# 技術仕様書

---

## リリース対象

- iOS・Android 同時リリース
- EAS Buildでビルド

---

## アーキテクチャ

### データフロー

```
Expo（モバイルアプリ）
    │
    │ 直接HTTPリクエスト
    ▼
好き嫌い.com（suki-kira.com）
```

バックエンド・プロキシなし。

### リクエスト方式

Expoの `fetch()` から直接好き嫌い.comにアクセスする。
Cloudflareのボット対策はモバイルのUser-Agentでは発動しないことを検証済み。

---

## UI設計方針

### ベースアプリ：Geschar

現在iOS向け5ch専ブラで最も評価が高く、モダンなUIを持つGescharをベースとする。
「広告なし・シンプル・快適」という方向性がスキキラのコンセプトと一致している。

### 各アプリから取り入れる要素

| アプリ | 取り入れる要素 |
|--------|--------------|
| Geschar（ベース） | シンプルで洗練されたUI・広告なし・ミニマップ付きスクロールバー |
| ChMate | NGワードの使いやすさ（追加・削除・一覧管理）・コメントの密度の高いリスト表示 |
| Twinkle | 黒背景・白文字のダークテーマ（長文コメントを目に優しく） |

### スキキラ独自の差別化

好き嫌い.comには「好き派・嫌い派」という軸があり、5ch専ブラにはない要素。
コメントの左端にボーダーカラーをつけて視覚的に区別する。

```
好き派コメント  → 左端に暖色（例: #f97316 オレンジ）のボーダー
嫌い派コメント  → 左端に寒色（例: #3b82f6 ブルー）のボーダー
```

### 基本テーマ

- ダークモードをデフォルトとする（Twinkle踏襲）
- 背景: #0a0a0a
- テキスト: #e5e5e5
- セカンダリテキスト: #888888
- カード背景: #1a1a1a

---

## 好き嫌い.com APIリファレンス（解析済み）

### 共通ヘッダー

```javascript
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja-JP,ja;q=0.9",
};
```

---

### 1. 投票ページ取得（フォームトークン取得）

```
GET /people/vote/{name}
```

| パラメータ | 説明 |
|-----------|------|
| name | 人物名（URLエンコード必須） |

**レスポンス:** HTML

HTMLから以下の値をパースして取得する（投票・コメント投稿時に必要）：

```javascript
// パース対象のhidden input
id     // 人物ID（例: 78347）
auth1  // 認証トークン1（例: a24c72a427fe1577f994947471409199）
auth2  // 認証トークン2（例: f34b02e6e55115def5fc5eba34213a77）
auth-r // 認証トークンR（例: f34b02e6e55115def5fc5eba34213a77）
```

**パース方法:**

```javascript
const getFormTokens = (html) => {
  const id    = html.match(/name="id"[^>]*value="([^"]+)"/)?.[1];
  const auth1 = html.match(/name="auth1"[^>]*value="([^"]+)"/)?.[1];
  const auth2 = html.match(/name="auth2"[^>]*value="([^"]+)"/)?.[1];
  const authR = html.match(/name="auth-r"[^>]*value="([^"]+)"/)?.[1];
  return { id, auth1, auth2, authR };
};
```

---

### 2. 投票POST

```
POST /people/result/{name}
Content-Type: application/x-www-form-urlencoded
```

| フィールド | 値 | 説明 |
|-----------|-----|------|
| vote | 1 または 0 | 1=好き / 0=嫌い |
| ok | ng | 固定値 |
| id | {人物ID} | フォームから取得 |
| auth1 | {トークン} | フォームから取得 |
| auth2 | {トークン} | フォームから取得 |
| auth-r | {トークン} | フォームから取得 |

**レスポンス:** HTML（投票結果ページ）

```javascript
// 好き嫌い割合のパース
const likePercent    = html.match(/(\d+\.\d+)%.*?好き/)?.[1];
const dislikePercent = html.match(/(\d+\.\d+)%.*?嫌い/)?.[1];
const votes          = [...html.matchAll(/([\d,]+)票/g)].map(m => m[1]);
```

**実装例:**

```javascript
const vote = async (name, voteType) => {
  // 1. フォームトークンを取得
  const pageRes = await fetch(
    `https://suki-kira.com/people/vote/${encodeURIComponent(name)}`,
    { headers: HEADERS }
  );
  const pageHtml = await pageRes.text();
  const { id, auth1, auth2, authR } = getFormTokens(pageHtml);

  // 2. 投票POST
  const body = new URLSearchParams({
    vote: voteType === 'like' ? '1' : '0',
    ok: 'ng',
    id,
    auth1,
    auth2,
    'auth-r': authR,
  }).toString();

  const res = await fetch(
    `https://suki-kira.com/people/result/${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://suki-kira.com',
        'Referer': `https://suki-kira.com/people/vote/${encodeURIComponent(name)}`,
      },
      body,
    }
  );
  return await res.text();
};
```

---

### 3. 結果ページ取得（コメント一覧）

```
GET /people/result/{name}
```

**レスポンス:** HTML

HTMLに最新20件のコメントが埋め込まれている。
コメントIDはJavaScript内の `bobj[{コメントID}]` パターンで確認できる。

```javascript
// コメントIDの抽出
const commentIds = [...html.matchAll(/bobj\[(\d+)\]/g)]
  .map(m => m[1]);

// コメント本文の抽出
const comments = [];
const regex = /itemprop="reviewBody"[^>]*>([\s\S]*?)<\/[^>]+>/g;
let m;
while ((m = regex.exec(html)) !== null) {
  const text = m[1].replace(/<[^>]+>/g, '').trim();
  if (text) comments.push(text);
}
```

---

### 4. コメント1件取得API

```
GET /people/vote/get_comment_by_index/?pid={pid}&index={index}
```

| パラメータ | 説明 |
|-----------|------|
| pid | 人物ID |
| index | コメントのインデックス（1始まり） |

**注意:** サーバーから500が返ることがあるが、結果ページHTMLからの取得で代替できる。

---

### 5. コメント投稿

```
POST /people/comment/{id}/
Content-Type: application/x-www-form-urlencoded
```

| フィールド | 値 | 説明 |
|-----------|-----|------|
| id | {人物ID} | フォームから取得 |
| name_id | （空） | 固定値 |
| type | （空） | 固定値 |
| url | {人物名} | URLエンコードなしの人物名 |
| body | {コメント本文} | ユーザーが入力したテキスト |
| sum | {値} | フォームから取得（コメント総数） |
| auth1 | {トークン} | フォームから取得 |
| auth2 | {トークン} | フォームから取得 |
| auth-r | n | 固定値 |
| ok | ok | 固定値 |
| tag_id | {値} | フォームから取得 |

**フォームパース:**

```javascript
const getCommentFormTokens = (html) => {
  const action = html.match(/action="(\/people\/comment\/[^"]+)"/)?.[1];
  const id     = html.match(/name="id"[^>]*value="([^"]+)"/)?.[1];
  const sum    = html.match(/name="sum"[^>]*value="([^"]+)"/)?.[1];
  const tagId  = html.match(/name="tag_id"[^>]*value="([^"]+)"/)?.[1];
  const auth1  = html.match(/name="auth1"[^>]*value="([^"]+)"/)?.[1];
  const auth2  = html.match(/name="auth2"[^>]*value="([^"]+)"/)?.[1];
  return { action, id, sum, tagId, auth1, auth2 };
};
```

---

## アプリ画面仕様

### 画面一覧

```
1. ランキング画面（ホーム）
2. 検索画面
3. 人物詳細画面（投票 + コメント一覧）
4. コメント投稿画面
```

---

### 1. ランキング画面（ホーム）

**表示内容:**
- 好感度ランキング（上位20件）
- 不人気ランキング（上位20件）
- トレンドランキング（上位20件）
- タブ切り替えで3種類を表示

**データ取得:**
```
GET https://suki-kira.com/
```
トップページHTMLをパースしてランキングを抽出する。

**各アイテムの表示要素:**
- 順位
- 人物名
- サムネイル画像
- 好き派 / 嫌い派 割合（バー表示）

---

### 2. 検索画面

**機能:**
- テキスト入力で人物名を検索
- 検索結果一覧を表示
- タップで人物詳細画面へ遷移

**データ取得:**
```
GET https://suki-kira.com/search?q={検索ワード}
```

---

### 3. 人物詳細画面

**表示内容:**

上部:
- 人物名
- サムネイル画像
- 好き派 / 嫌い派 割合（大きく表示）
- 好き！ / 嫌い！ ボタン（投票済みの場合はグレーアウト）

コメント一覧:
- 最新順で全件表示（無制限スクロール）
- 各コメントに good / bad ボタン
- フィルタ: 全件 / 好き派のみ / 嫌い派のみ
- NGワードフィルタ（端末ローカルに保存）
- コメント投稿ボタン

**差別化ポイント（5ch専ブラ相当の機能）:**
- 20件制限なしで全件読み込み
- NGワードフィルタ（AsyncStorageに保存）
- 好き派 / 嫌い派での絞り込み

---

### 4. コメント投稿画面

**UI:**
- テキスト入力エリア
- 文字数カウンター
- 投稿ボタン
- 好き派 / 嫌い派 の選択（任意）

---

## ランディングページ仕様（Cloudflare Pages）

### ページ構成

```
/ （トップ）
  └─ アプリ紹介・特徴
  └─ App Store / Google Play ダウンロードボタン

/privacy-policy
  └─ プライバシーポリシー（App Store審査用）
```

### プライバシーポリシーに記載する内容

- 収集する情報: なし（ユーザーアカウント・個人情報を収集しない）
- NGワードはデバイスのローカルストレージのみに保存
- 好き嫌い.comへのリクエストはユーザーの操作に基づくもの
- 広告なし
- 連絡先メールアドレス

---

## ファイル構成（mobile）

ボイラープレート: https://github.com/kiyohken2000/ReactNativeExpoBoilerplate
ナビゲーション: React Navigation
状態管理: React Context

```
apps/mobile/
├── assets/
├── src/
│   ├── components/          # 共通UIコンポーネント
│   │   ├── PersonCard/      # 人物カード（ランキング・検索結果）
│   │   ├── CommentItem/     # コメント1件
│   │   ├── VoteBar/         # 好き嫌い割合バー
│   │   └── CommentInput/    # コメント入力欄
│   ├── contexts/
│   │   └── SettingsContext/ # NGワード等のローカル設定（AsyncStorage）
│   ├── routes/
│   │   └── navigation/
│   │       ├── tabs/        # ボトムタブ（ランキング・検索）
│   │       ├── stacks/      # スタック（人物詳細・コメント投稿）
│   │       └── rootStack/   # ルートナビゲーター
│   ├── scenes/
│   │   ├── home/            # ランキング画面
│   │   ├── search/          # 検索画面
│   │   ├── details/         # 人物詳細画面（投票 + コメント一覧）
│   │   ├── post/            # コメント投稿画面
│   │   └── loading/         # 起動時ローディング
│   ├── theme/               # カラー・フォント定義
│   └── utils/
│       └── sukikira.js      # 好き嫌い.comへのリクエスト処理（全て集約）
└── App.js
```

**重要:** 好き嫌い.comへのリクエスト処理は必ず `src/utils/sukikira.js` に集約する。仕様変更時の修正箇所を1ファイルに限定するため。

---

## 注意事項

- 好き嫌い.comへのリクエストは過剰に行わない（コメント取得時は適切なウェイトを入れる）
- auth1 / auth2 トークンはリクエストごとにフォームから取得する（キャッシュしない）
- 日本語を含むURLは必ず `encodeURIComponent()` でエンコードする