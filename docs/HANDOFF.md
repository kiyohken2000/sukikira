# セッション引継ぎドキュメント

最終更新: 2026-02-23 (セッション6)

---

## プロジェクト概要

**スキキラ** - 好き嫌い.com (suki-kira.com) の非公式ブラウザアプリ
技術スタック: Expo (React Native) / Yarn Workspaces モノレポ
バックエンドなし。Expoから直接 suki-kira.com をスクレイピング/POST。

---

## ナビゲーション構造（重要）

```
NavigationContainer
  └── RootStack (createStackNavigator, headerShown: false)
        ├── HomeRoot → TabNavigator (底部タブ)
        │     ├── RankingTab   → RankingStacks  → Home
        │     ├── SearchTab    → SearchStacks   → Search
        │     ├── HistoryTab   → HistoryStacks  → History  ← 次セッションで追加予定
        │     └── SettingsTab  → SettingsStacks → Settings
        ├── Details  (SlideFromRightIOS)
        └── Post     (modal, ModalPresentationIOS)
```

- `HomeStacks.js` は **未使用ファイル**（Tabs.js に組み込まれていない）
- Home/Search からの `navigate('Details')` は RootStack の Details へ遷移
- Details から `navigate('Post')` で Post モーダルを開く

---

## 主要ファイル一覧

| ファイル | 役割 |
|---|---|
| `apps/mobile/src/utils/sukikira.js` | suki-kira.com への全リクエスト処理 |
| `apps/mobile/src/contexts/SettingsContext.js` | NGワード・投票済み・結果キャッシュ・コメント投票管理 |
| `apps/mobile/src/routes/navigation/rootStack/RootStack.js` | ルートナビゲーター |
| `apps/mobile/src/routes/navigation/tabs/Tabs.js` | タブナビゲーター（RankingTab, SearchTab, SettingsTab） |
| `apps/mobile/src/scenes/home/Home.js` | ランキング画面（無限スクロール対応） |
| `apps/mobile/src/scenes/search/Search.js` | 検索画面 |
| `apps/mobile/src/scenes/details/Details.js` | 人物詳細画面（複数画像・タグ・コメント無限スクロール） |
| `apps/mobile/src/scenes/post/Post.js` | コメント投稿画面 |
| `apps/mobile/src/scenes/settings/Settings.js` | 設定画面（NGワード管理） |
| `apps/mobile/src/components/VoteBar/VoteBar.js` | 好き嫌い割合バー |
| `apps/mobile/src/components/PersonCard/PersonCard.js` | ランキング/検索結果の人物カード |
| `apps/mobile/src/components/CommentItem/CommentItem.js` | コメント1件（good/bad ボタン付き） |

---

## suki-kira.com スクレイピング仕様（重要知識）

### ページ構造
- `/ranking/{type}/` (p1) / `/ranking/{type}/{n}` (p2以降) → ランキング（各18件）
  - 1〜3位: `<div class="ranking-card">` + `<h2 class="ranking-name">`（1ページ目のみ）
  - 4位〜: `<section class="box-rank-review">` + `<h2 class="title">` + `<p class="num">`
  - 次ページ判定: `<link rel="next">` の有無
  - 画像は `data-src`（遅延読み込み）
- `/search?q=...` → HTML シェル。実際の結果は AJAX: `/search/search?q=...&sk_token=...` (JSON)
- `/people/vote/{name}` → 投票フォームページ（Cookie/IP未トラッキング時）
- `/people/result/{name}` → 投票結果ページ（Cookie必須、なければ vote ページへリダイレクト）
- **存在しない人物**: `/people/vote/{name}` または `/people/result/{name}` がトップページ (`/`) にリダイレクト → `response.url` で検出

### result ページの HTML 形式（2種類）
- **旧形式**: `好き派: 29.91%(145445票)` （直接テキスト）
- **新形式**: `好き派: <span itemprop="ratingValue">64.95</span>%<br><span class="text-muted">(379325票)</span>` （spanタグあり）
- **判定**: `isResultPage = /好き派:/.test(html)` （`好き派: \d+%` ではダメ）
- **パーセント抽出**: `好き派:\s*(?:<[^>]+>)*([\d.]+)` （spanを読み飛ばす）
- **票数抽出**: `好き派:[\s\S]{0,200}?([\d,]+)票`（{0,200} が必要）

### Cookie・IPトラッキング
- 結果ページ閲覧にはセッション Cookie が必要（投票すると Cookie がセットされる）
- **IP ベースのトラッキングもある**: 一度投票した IP から `/people/vote/{name}` にアクセスすると `/people/result/{name}` へリダイレクトされる
- React Native の fetch は OS レベルの Cookie を自動管理（NSURLSession / OkHttp）

### コメント構造
```html
<div class="comment-container c{id}">
  <div itemprop="reviewRating">
    <meta itemprop="bestRating"  content="100">
    <meta itemprop="worstRating" content="0">
    <meta itemprop="ratingValue" content = "0">   ← 0=嫌い派, 100=好き派
  </div>
  <p itemprop="reviewBody">コメント本文</p>
  <!-- good/bad 投票 -->
  <meta itemprop="upvoteCount"   content="N">
  <meta itemprop="downvoteCount" content="N">
  <span class="cBanBtn" data-token="...">  ← good/bad 投票トークン
</div>
```
- `ratingValue` は `0` or `100`（`0` or `1` **ではない**）
- `content = "0"` のように `=` の前後にスペースあり → JS正規表現は `\s*=\s*` で対応済み

### コメントページネーション
- カーソルベース: `?nxc={oldest_comment_id}` で次ページ取得
- 例: `/people/result/新垣結衣/?nxc=42261` → 20件取得
- `parseNextCursor(html)` で `?nxc=(\d+)` を抽出
- ページ末尾（最古）では `?nxc=` が出現しない → `nextCursor = null`

### コメント good/bad 投票
- エンドポイント: `POST https://api.suki-kira.com/comment/vote?xdate={xdate}&evl={like|dislike}`
- ボディ: `pid={pid_hash}&token={comment_token}`
- `xdate` / `pid_hash` は結果ページHTMLのインラインJS変数 (`var xdate = "..."`, `var pid_hash = "..."`)
- `token` は各コメントDivの `data-token` 属性
- Origin ヘッダーは `BASE_URL` (`https://suki-kira.com`) を使うこと（`BASE` は未定義）

### 人物詳細ページの追加情報
- **複数画像**: `<img class="sk-result-img" src="...">` × 複数枚（gstatic.com）
  - URL に `&amp;` が含まれるため `.replace(/&amp;/g, '&')` が必要
- **タグ**: `<span class="h4 tag tag-pill tag-warning">タグ名</span>` × 複数
  - `div.tags` ブロック内に存在（result ページのみ。vote ページにはない）

### 投票フォーム構造
```html
<input type="hidden" name="vote"   value="1">   ← 好き用フォーム
<input type="hidden" name="ok"     value="ng">
<input type="hidden" name="id"     value="61993">
<input type="hidden" name="auth1"  value="...">
<input type="hidden" name="auth2"  value="...">
<input type="hidden" class="auth-r" name="auth-r" value="...">
<!-- 嫌い用フォームも同様に続く（vote=0） -->
```

---

## AsyncStorage キー

| キー | 内容 |
|---|---|
| `@sukikira:ngWords` | NGワード配列 `string[]` |
| `@sukikira:voted` | 投票済みマップ `{ [name]: 'like' \| 'dislike' }` （投票済み判定用・既存） |
| `@sukikira:voteHistory` | 投票履歴 `Array<{ name, imageUrl, voteType, time }>` （履歴表示用・追加予定） |
| `@sukikira:browseHistory` | 閲覧履歴 `Array<{ name, imageUrl, time }>` （追加予定） |
| `@sukikira:commentHistory` | コメント履歴 `Array<{ name, body, time }>` （追加予定） |
| `@sukikira:resultCache` | 結果キャッシュ `{ [name]: { resultInfo, comments } }` |

---

## SettingsContext 設計の注意点

### ref ベースの実装（無限ループ回避）

`getCachedResult` / `getCommentVoted` はともに `useRef` 経由で実装。`useCallback` の依存配列が `[]` で安定。
理由: state を依存に入れると `setState → 再生成 → useFocusEffect 再実行` の無限ループが発生する。

```js
// 結果キャッシュ
const resultCacheRef = useRef({})
const cacheResult = useCallback((name, resultInfo, comments) => {
  const next = { ...resultCacheRef.current, [name]: { resultInfo, comments } }
  resultCacheRef.current = next
  setResultCache(next)
  AsyncStorage.setItem(...)
}, [])
const getCachedResult = useCallback((name) => resultCacheRef.current[name] ?? null, [])

// コメント投票済み（セッション中のみ・AsyncStorage 不要）
const commentVotedRef = useRef({})
const recordCommentVote = useCallback((commentId, voteType) => {
  commentVotedRef.current = { ...commentVotedRef.current, [commentId]: voteType }
}, [])
const getCommentVoted = useCallback((commentId) => commentVotedRef.current[commentId] ?? null, [])
```

---

## sukikira.js API 一覧

| 関数 | シグネチャ | 戻り値 |
|---|---|---|
| `getRanking` | `(type, page=1)` | `{ items, nextPage }` |
| `search` | `(query)` | `item[]` |
| `getComments` | `(name)` | `{ resultInfo, comments, nextCursor, notFound? }` |
| `getMoreComments` | `(name, cursor)` | `{ comments, nextCursor }` |
| `vote` | `(name, voteType)` | `{ resultInfo, comments, nextCursor }` |
| `voteComment` | `(pidHash, commentId, voteType, token, xdate)` | `void` |
| `postComment` | `(name, commentBody, commentType='1')` | `{ resultInfo, comments }` |

### resultInfo オブジェクト構造
```js
{
  name: string,
  imageUrl: string,        // OG画像（1枚）
  images: string[],        // sk-result-img の全画像（result ページのみ）
  tags: string[],          // タグ一覧（result ページのみ）
  likePercent: string,     // "64.95"
  dislikePercent: string,
  likeVotes: string,       // "379325"（カンマなし）
  dislikeVotes: string,
  xdate: string,           // コメント投票用
  pidHash: string,         // コメント投票用
}
```

### comment オブジェクト構造
```js
{
  id: string,
  body: string,
  type: 'like' | 'dislike' | 'unknown',
  upvoteCount: number,
  downvoteCount: number,
  token: string,           // コメント投票トークン（空文字の場合あり）
}
```

---

## セッション3で修正したバグ・実装した機能

### バグ修正

| バグ | 原因 | 修正場所 |
|---|---|---|
| コメント good/bad が常に失敗 | `voteComment` 内で `Origin: BASE`（未定義変数） | `sukikira.js` → `Origin: BASE_URL` |
| 存在しない人物を投票すると「投票に失敗しました」 | `/people/vote/{name}` がトップページへリダイレクト → トークンなし・result 判定も false | `vote()` / `getComments()` で `response.url` チェックを追加 |
| コメント good/bad を押して詳細を開き直すと未投票に戻る | `CommentItem` の `voted` state がローカルなため再マウント時リセット | `SettingsContext` に `commentVotedRef` 追加、`votedType` prop で初期化 |

### 新機能

| 機能 | 実装場所 |
|---|---|
| 設定画面（NGワード管理） | `Settings.js` + `SettingsStacks.js` + `Tabs.js` |
| コメント good/bad ボタン | `CommentItem.js` + `voteComment()` + `Details.js` |
| 人物詳細に複数画像表示 | `parseResult` に `images[]` 追加、`Details.js` 横スクロール |
| 人物詳細にタグ表示 | `parseResult` に `tags[]` 追加、`Details.js` ピルチップ表示 |
| コメント無限スクロール | `getMoreComments()` + `parseNextCursor()`、`Details.js` の `onEndReached` |
| ランキング無限スクロール | `getRanking(type, page)` 対応、`Home.js` の `onEndReached` |

---

## 現在の実装状況

### 動作確認済み
- ランキング表示（好感度/不人気/トレンド、無限スクロール）
- 検索（JSON API 経由）
- 人物詳細画面（複数画像・タグ・投票バー・コメント一覧）
- 好き/嫌い投票（IPリダイレクト時のフォールバック、存在しない人物のエラー表示）
- コメントフィルタ（すべて/好き派/嫌い派）
- コメント無限スクロール（`?nxc=` ページネーション）
- NGワードフィルタ（SettingsContext 経由）
- コメント投稿（投稿後に既存Details画面へ戻る・キャッシュ反映）
- 設定画面（NGワード追加・削除UI）
- コメント good/bad ボタン（投票済み状態がセッション中持続）

### 未実装・残タスク
- [ ] 閲覧・コメント履歴機能（次セッション予定。詳細は下記）
- [ ] お気に入り機能（詳細は下記）
- [ ] 投票済みバッジ表示（ランキング・検索画面の人物カードに投票済みマークを表示）
- [x] ハプティクス（詳細投票 `notificationAsync(Success)` / コメント good/bad `impactAsync(Light)`）
- [ ] コメントテキスト選択→NGワード追加（詳細は下記）
- [ ] スワイプ投票モード（詳細は下記）
- [ ] Supabase リモートパース設定（詳細は下記）
- [ ] フェーズ5: ランディングページ（Vite + Cloudflare Pages）
- [ ] フェーズ6: リリース準備（アイコン・スクリーンショット・ストア申請）

### セッション4で実装した機能（コメントUI改善）
- コメントに番号・投稿者名・投稿日時を表示（sukikira.js parseComments に author/dateText 追加）
- コメント本文の `>>NNN` アンカーをタップで対象コメントをポップアップ表示
- コメント本文のURL（https://...）をタップでブラウザで開く（Linking.openURL）
- upvote/downvote を横向き赤/青バー表示に変更（比率バー + カウント）
- ⋮メニューボタン → ActionSheet で「返信」「非表示」「通報」
- 非表示にしたコメントはfilteredCommentsからフィルタ（セッション中）
- 返信は Post.js に `>>NNN\n` プリセット入力で遷移

### セッション5で実装した機能（コメント投稿バグ修正・詳細画面改善）

| 機能・修正 | 内容 | 実装場所 |
|---|---|---|
| コメント投稿が保存されないバグ修正 | `type` フィールドを `''` から `'1'`(好き派) / `'0'`(嫌い派) に変更。サーバーは空文字列を受け付けるが保存しない | `sukikira.js` `postComment()` |
| 返信投稿失敗バグ修正 | 同上。type が正しくなったことで解決 | `sukikira.js` `postComment()` |
| Post画面に派閥バッジ表示 | 投票済み種別（好き派/嫌い派）を左ボーダー付きバッジで表示。voted[name] から自動取得 | `Post.js` |
| 詳細画面の画像拡大表示 | 写真タップで全画面モーダル表示（黒背景・fade アニメーション）。複数画像時は ‹ › ナビゲーションボタンと「n / N」カウンター表示 | `Details.js` |

### セッション6で実装した機能（ハプティクス）

| 機能 | 内容 | 実装場所 |
|---|---|---|
| 好き/嫌い投票時のハプティクス | 投票成功時に `Haptics.notificationAsync(Success)` で成功フィードバック（強め） | `Details.js` `onVote` |
| コメント good/bad 投票時のハプティクス | good/bad タップ時に `Haptics.impactAsync(Light)` で軽い触感フィードバック | `CommentItem.js` `handleVote` |

#### コメント投稿の type フィールド仕様（重要）
- サーバーは `type='1'`（好き派）または `type='0'`（嫌い派）を必要とする
- `type=''`（空文字）や `type='好き派'`（日本語文字列）は HTTP 200 を返すが**コメントを保存しない**（サイレント失敗）
- `postComment(name, body, commentType)` の第3引数で渡す。デフォルト `'1'`
- Post.js では `voted[name]` から自動決定: `'like'→'1'`, `'dislike'→'0'`, 未投票→`'1'`

---

### 将来実装予定：コメントテキスト選択→NGワード追加

#### 概要
コメント本文内のテキストを長押し選択し、選択した文字列をそのままNGワードに追加できる機能。
設定画面を開かずにインラインで登録できるため、NGワード管理が大幅に楽になる。

#### 実装方針
- `CommentItem.js` のコメント本文を `Text` から `TextInput`（`editable={false}` + `multiline`）に変更すると OS標準のテキスト選択UIが使える
  - ただし iOS/Android でスタイルの調整が必要
- 選択後に出るコンテキストメニュー（カット・コピー等）にカスタムアクションを追加するのは困難
- **現実的な代替案**: コメント本文テキストを長押し → Alert または ActionSheet で「このコメントのNGワードを追加」→ テキスト入力ダイアログで選択範囲（またはキーワード）を入力 → `addNgWord()` を呼ぶ
- または ⋮ メニューの「NGワード追加」から TextInput で手入力する簡易版でも十分

---

### 将来実装予定：投票済みバッジ（ランキング・検索画面）

#### 概要
ランキング画面・検索結果の人物カードに、投票済みかどうかを示すバッジを表示する。
`SettingsContext` の `voted[name]` を参照するだけで実装可能。

#### 実装方針
- `PersonCard.js` に `votedType?: 'like' | 'dislike'` prop を追加
- 好き派なら橙色の「好き済み」、嫌い派なら青色の「嫌い済み」バッジをカード右上などに表示
- `Home.js` / `Search.js` から `voted[name]` を渡す

---

### 将来実装予定：スワイプ投票モード

#### 概要
未投票の人物をカード形式で1枚ずつ表示し、左右スワイプで好き/嫌いを連続投票できるモード。
Tinderライクな操作で、ブラウザには絶対できないアプリならではの体験。
ランキングを眺めながら「まだ投票していない人」を効率よく消化できる。

#### 実装方針
- ランキングタブに「スワイプ投票」ボタンを追加、または独立したタブとして追加
- カードスタックUI: 上位N件の未投票人物を積み重ねて表示
- `react-native-gesture-handler` の `PanGestureHandler` でスワイプ検出
- スワイプ方向に応じて `vote(name, 'like' | 'dislike')` を呼ぶ
- 投票済み人物は `voted` を参照してスキップ
- ハプティクスと組み合わせると体験が向上

---

### 将来実装予定：お気に入り機能

#### 概要
人物をお気に入り登録して、ホーム画面や履歴タブからすぐアクセスできるようにする。
ブラウザとの差別化・リテンション向上に直結する機能。

#### 実装方針
- AsyncStorage に追加: `@sukikira:favorites`: `Array<{ name, imageUrl }>` (登録順)
- SettingsContext に追加: `favorites`, `addFavorite(name, imageUrl)`, `removeFavorite(name)`, `isFavorite(name)`
- Details.js: ナビゲーションヘッダーに★ボタンを追加 → タップでお気に入り登録/解除
- 表示場所: 履歴タブ上部にお気に入りセクション、またはランキングタブ上部に固定表示（要検討）

---

### 将来実装予定：プッシュ通知

#### 概要
アプリならではの差別化機能。ブラウザでは実現不可能。

#### 候補
- お気に入り人物の好感度が大きく変動したとき
- 自分がコメントした人物に新しいコメントが付いたとき

#### 技術方針
- `expo-notifications` を使えばクライアント側のプッシュ通知は**無料**で実現可能
- ただし「定期的にサイトを巡回して変化を検知する」サーバー側の仕組みが必要になり、そこで費用が発生する可能性がある
- まずはお気に入り・履歴機能を完成させてからサーバー費用対効果を検討する

---

### 将来実装予定：Supabase リモートパース設定

#### 背景・目的
suki-kira.com の HTML 構造が変化した際、アプリ更新なしに対応できるようにする。
正規表現・URL レベルの変化（頻度高め）は Supabase 設定更新だけで解決し、
フロー変化・認証方式変化（稀）のときだけ EAS Update またはアプリストア更新を行う。

#### アーキテクチャ
```
アプリ起動
  ↓
Supabase から最新パース設定を取得（タイムアウト: 3〜5秒）
  ↓ 失敗（オフライン・Supabase 障害）
バンドル内デフォルト設定 or 前回キャッシュを使用
  ↓
クライアントから直接 suki-kira.com にアクセス（IP 集中を回避）
```

#### Supabase に置く設定の例
```json
{
  "version": 1,
  "result": {
    "like_pct":      "好き派:\\s*(?:<[^>]+>)*([\\d.]+)",
    "dislike_pct":   "嫌い派:\\s*(?:<[^>]+>)*([\\d.]+)",
    "like_votes":    "好き派:[\\s\\S]{0,200}?([\\d,]+)票",
    "comment_id":    "class=\"comment-container c(\\d+)\"",
    "next_cursor":   "\\?nxc=(\\d+)"
  },
  "endpoints": {
    "ranking":  "/ranking/{type}/",
    "vote":     "/people/vote/{name}",
    "result":   "/people/result/{name}",
    "comment":  "/people/comment/{pid}/"
  }
}
```

#### 実装方針
- Supabase の public テーブル or Storage（認証不要で読み取り可能）に設定を置く
- `sukikira.js` の正規表現をハードコードからこの設定経由に切り替え
- アプリ起動時に1回取得、AsyncStorage にキャッシュ
- フォールバック順: Supabase 取得 → AsyncStorage キャッシュ → バンドル内デフォルト
- フロー変化・認証方式変化が起きた場合のみ EAS Update で対応

---

### 次セッションで実装予定：閲覧・コメント履歴機能

#### 概要
- **閲覧履歴**: Details 画面を開いた人物の記録（名前・画像・日時）
- **コメント履歴**: コメント投稿に成功した人物の記録（名前・本文プレビュー・日時）

#### 実装方針
**表示場所**: ボトムタブに「履歴」タブを追加（RankingTab と SearchTab の間）

**AsyncStorage に追加:**
- `@sukikira:voteHistory`: `Array<{ name, imageUrl, voteType, time }>` (最大50件・新しい順)
- `@sukikira:browseHistory`: `Array<{ name, imageUrl, time }>` (最大30件・新しい順・dedup)
- `@sukikira:commentHistory`: `Array<{ name, body, time }>` (最大30件・新しい順)

**SettingsContext に追加:**
- `voteHistory`, `browseHistory`, `commentHistory` state
- `recordVote` を拡張: 既存の `voted` マップ更新に加えて `voteHistory` にも追記
- `recordBrowse(name, imageUrl)` — Details.js のロード成功時に呼ぶ
- `recordComment(name, body)` — Post.js の投稿成功時に呼ぶ

**新規ファイル:**
- `apps/mobile/src/scenes/history/History.js` — 履歴画面
- `apps/mobile/src/routes/navigation/stacks/HistoryStacks.js`

**History.js の構成:**
- セクション1「投票履歴」: 人物名・画像・好き/嫌いバッジ・日時 → タップで Details へ
- セクション2「閲覧履歴」: 人物名・画像・日時 → タップで Details へ
- セクション3「コメント履歴」: 人物名・本文プレビュー・日時 → タップで Details へ

**注意:** `voted` マップ（投票済み判定用）はそのまま残す。`voteHistory` は表示専用で別管理。

**Tabs.js の変更:**
- HistoryTab を RankingTab と SearchTab の間に追加
- アイコン: `history` または `clock-o`（FontAwesome）

---

### 既知の制限
- Cookie なし（未投票状態）では結果・コメント閲覧不可。キャッシュがあれば表示
- 木村拓哉のような超有名人は最新コメントが全て嫌い派になる場合がある（サーバー側の仕様）
- コメント good/bad の投票済み状態はアプリ再起動でリセット（AsyncStorage には保存しない）

---

## 解析スクリプト（`scripts/`）

| ファイル | 用途 | 出力 |
|---|---|---|
| `analyze_ranking.py` | ランキングページのHTML構造確認 | `out/analyze_ranking.txt` |
| `analyze_search.py` | 検索APIの確認 | `out/analyze_search.txt` |
| `analyze_comment_struct.py` | コメントdivのHTML構造確認（投票POST後） | `out/analyze_comment_struct.txt` |
| `analyze_rating.py` | ratingValue の属性確認 | `out/analyze_rating.txt` |
| `analyze_rating2.py` | 投票タイプ別コメントtype分布 | `out/analyze_rating2.txt` |
| `analyze_rating3.py` | unknown コメントのHTML詳細 | `out/analyze_rating3.txt` |
| `analyze_vote_form.py` | 投票フォームのtoken属性順確認 | `out/analyze_vote_form.txt` |
| `analyze_vote_post.py` | 投票POSTの全フロー確認 | `out/analyze_vote_post.txt` |
| `analyze_final_check.py` | isResultPage・parseResult・parseComments 統合確認 | `out/analyze_final_check.txt` |
| `analyze_vote_fresh.py` | フレッシュ投票ページの構造確認 | `out/analyze_vote_fresh.txt` |
| `analyze_vote_page_raw.py` | 投票ページの生HTMLとinputタグ一覧 | `out/analyze_vote_page_raw.txt` |

実行: `python scripts/<スクリプト名>` （プロジェクトルートから）
Windows cp932 の絵文字エラーを避けるため、新スクリプトは stdout ではなくファイルのみに書き出す方式を使うこと。
