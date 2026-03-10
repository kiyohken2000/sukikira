# Cloudflare 空ボディ問題 トラブルシューティング

## 概要

suki-kira.com は Cloudflare を経由している。Cloudflare の設定変更により、特定のリクエストパターンが空ボディ（status 200 だが本文 0 バイト）を返すことがある。2026-02-25 に発生し、以下の手順で原因特定・修正した。

## 症状

- `fetch()` が status 200 を返すが `res.text()` が空文字
- ランキング等の一部ページは正常、`/people/` や `/search/search` など特定パスだけ空
- Python スクリプト（urllib）では正常取得できる場合とできない場合がある
- `yarn start -c`（Metro キャッシュクリア）で一時的に直ることがある

## 診断手順

### 1. サーバー側の問題か確認

```bash
python scripts/analyze_vote_form.py
```

Python で正常にHTMLが取得できるなら、サーバー自体は生きている。React Native の fetch 固有の問題。

### 2. fetch 自体が動くか確認

アプリ内で最小限の fetch テストを行う:

```javascript
// Settings.js 等に一時的にボタンを追加
const testFetch = async () => {
  const url = 'https://suki-kira.com/people/vote/' + encodeURIComponent('大谷翔平')

  // テスト1: ヘッダーなし
  const r1 = await fetch(url)
  console.log('plain:', (await r1.text()).length)

  // テスト2: カスタムヘッダー付き
  const r2 = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 ...' }
  })
  console.log('with-headers:', (await r2.text()).length)

  // テスト3: ランキング（対照群）
  const r3 = await fetch('https://suki-kira.com/ranking/like/')
  console.log('ranking:', (await r3.text()).length)
}
```

### 3. 原因の切り分け

| plain fetch | with headers | 原因 |
|---|---|---|
| 正常 | 空 | **Cloudflare がヘッダーでブロック** → ヘッダーを外す |
| 空 | 空 | Cloudflare が全ブロック or JS チャレンジ要求 |
| 正常 | 正常 | fetch の問題ではない → URL エンコーディングやリダイレクトを疑う |

### 4. 同じ画面コンテキストでテストする

Settings 画面で動いても Details 画面で動かない場合がある。問題が起きている画面の関数内に直接テスト fetch を埋め込んで確認すること。

```javascript
export const getComments = async (name) => {
  // --- DEBUG ---
  const dbg = await fetch(`${BASE_URL}/people/vote/${encodeURIComponent(name)}`)
  console.log('DEBUG:', (await dbg.text()).length)
  // --- END DEBUG ---
  // ... 本来の処理
}
```

## 既知の回避策

### 全リクエスト: ブラウザ風 User-Agent を設定（2026-03 更新）

2026-03 に Cloudflare がネイティブ HTTP クライアント（Android: OkHttp、iOS: NSURLSession）のデフォルト User-Agent をボット判定し始めた。ヘッダーなし fetch でも空ボディが返るようになったため、ブラウザ風 UA を明示的に設定する方式に変更。

```javascript
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

// GET
const res = await fetch(url, {
  credentials: 'include',
  headers: { 'User-Agent': BROWSER_UA },
})

// POST
const res = await fetch(url, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': BROWSER_UA,
  },
  body,
})
```

**重要な注意点:**
- 開発ビルドでは再現しない（開発クライアントの UA は本番と異なる）
- `--no-dev` モード（`npx expo start --no-dev`）でも再現しないことがある
- iOS / Android 両方で同時に発生する
- 本番ビルドでのみ発生するため、デバッグが困難。エラーメッセージに詳細（レスポンスサイズ等）を含めることが重要

### 検索API: タイムスタンプでキャッシュバスト

Cloudflare が空レスポンスをキャッシュすることがある（`cf-cache-status: HIT`）。

```javascript
// NG: キャッシュされた空レスポンスが返る
const res = await fetch(`${BASE_URL}/search/search?q=${q}&sk_token=${token}`)

// OK: タイムスタンプでキャッシュキーを変える
const res = await fetch(`${BASE_URL}/search/search?q=${q}&sk_token=${token}&_t=${Date.now()}`)
```

### POSTリクエスト: Content-Type + User-Agent のみ

```javascript
const res = await fetch(url, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': BROWSER_UA,
    // Origin, Referer, Accept, Accept-Language は付けない
  },
  body,
})
```

### 二重 fetch 回避: _votePageCache

`getComments` と `vote` が同じ URL を短時間に2回 fetch すると、2回目が空ボディになることがある。`_votePageCache` で1回目の結果をキャッシュして再利用する。

## Python での検証

アプリの問題かサーバーの問題かを切り分けるために、Python スクリプトで同じ URL を叩く:

```python
import urllib.request, urllib.parse

name = '大谷翔平'
url = 'https://suki-kira.com/people/vote/' + urllib.parse.quote(name)
req = urllib.request.Request(url, headers={
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ...',
})
with urllib.request.urlopen(req, timeout=15) as r:
    html = r.read().decode('utf-8')
    print(f'len={len(html)}')  # 0 ならサーバー側の問題
```

Python でも 0 バイトなら、サーバー/Cloudflare 側の問題。アプリでは対処不可能なので待つしかない。

## Cloudflare Workers からのアクセス（2026-02-26 検証）

Workers (`sukikira-comment-proxy.votepurchase.workers.dev`) をデプロイしてテスト。
Workers 内の `fetch()` でも suki-kira.com から **Cloudflare チャレンジ（"Just a moment..."、403）** が返る。

- result ページ (`/people/result/{name}`) → チャレンジ
- 個別コメント API (`/p/{pid}/c/{cid}/t/{sk_token}`) → チャレンジ
- Workers からの投票 POST → チャレンジ（result ページを取得できないため投票フローも不可）

**結論:** Workers の IP レンジも Cloudflare にブロックされている。
Pages Functions も同じランタイムのため同様にブロックされると推測。

## アクセス元別のブロック状況

### 2026-02-26 時点

| アクセス元 | result ページ | 個別コメント API | `?nxc=` |
|---|---|---|---|
| アプリ fetch (ヘッダーなし) | ✓ 成功 | ✓ 成功 | ✗ `?cm` にリダイレクト |
| アプリ fetch (カスタムヘッダー付き) | ✗ 空ボディ | 未テスト | ✗ リダイレクト |
| WebView (同一オリジン fetch) | ✓ 成功 | ✓ 成功 | ✗ `?cm` にリダイレクト |
| Workers fetch | ✗ チャレンジ | ✗ チャレンジ | ✗ チャレンジ |
| curl | ✗ チャレンジ | ✗ チャレンジ | ✗ チャレンジ |
| 実ブラウザ (Chrome) | ✓ 成功 | ✓ 成功 | ✓ 成功 |

### 2026-03-10 時点（WAF ルール変更後）

| アクセス元 | result ページ | 投票 POST |
|---|---|---|
| 本番アプリ fetch (ヘッダーなし) | ✗ 空ボディ | ✗ 空ボディ |
| 本番アプリ fetch (ブラウザ UA 付き) | ✓ 成功 | ✓ 成功 |
| 開発ビルド fetch (ヘッダーなし) | ✓ 成功 | ✓ 成功 |
| `--no-dev` モード | ✓ 成功 | ✓ 成功 |

### デフォルト User-Agent（httpbin.org で確認、2026-03-10）

| ビルド | デフォルト UA |
|---|---|
| 開発ビルド (Expo Dev Client) | `app/6 CFNetwork/3860.400.51 Darwin/25.3.0` |
| 本番ビルド (EAS Build) | `app/13 CFNetwork/3860.400.51 Darwin/25.3.0` |

- `app/X` の数字はビルド番号。CFNetwork・Darwin バージョンは同一
- どちらも非ブラウザ UA だが、本番のみブロックされた
- **UA 文字列だけではブロックの差を説明できない** → Cloudflare は UA 以外の要素（TLS フィンガープリント、リクエスト頻度、ボットスコアリング等）も判定に使用している可能性
- 設定画面でデフォルト UA を表示する機能を追加済み（`httpbin.org/user-agent` で取得）

## 時系列

### 事例1: 2026-02-25 — カスタムヘッダーによる空ボディ

1. 投票エラー発生。ストア版でも再現 → コード変更が原因ではない
2. Python では正常取得 → サーバーは生きている
3. アプリ内 debugFetch でヘッダーなし fetch は成功、ヘッダー付きは空 → **ヘッダーが原因**
4. `get()` からカスタムヘッダーを除去 → 投票復旧
5. 検索 API は Python でも空 → Cloudflare キャッシュの問題
6. `&_t=timestamp` 追加 → 検索復旧
7. POST の `...HEADERS` を除去 → コメント投稿復旧

### 事例2: 2026-03-10 — デフォルト UA によるボット判定

1. 本番アプリで投票が「投票に失敗しました」エラー。開発ビルドでは正常
2. 同じコードで昨日まで問題なし → サーバー側（Cloudflare）の変更
3. エラー詳細を表示するよう修正 → `Cannot read property 'imageUrl' of null`（vote() が resultInfo: null を返す）
4. さらに詳細追加 → `post=0, fallback=0bytes`（POST レスポンスも fallback GET も空ボディ）
5. `credentials: 'include'` 追加・Origin/Referer 除去 → 変化なし
6. `getComments` 経由の fallback → 変化なし
7. リトライ（1秒/2秒/3秒待ち） → 変化なし
8. `--no-dev` モードでテスト → 投票成功（再現せず）
9. **ブラウザ風 User-Agent（`BROWSER_UA`）を全リクエストに設定 → 本番で投票復旧**

**教訓:**
- Cloudflare は予告なく WAF ルールを変更する
- 開発ビルドと本番ビルドで HTTP クライアントのデフォルト UA が異なる
- 「ヘッダーなし」が安全とは限らない — デフォルト UA 自体がブロック対象になりうる
- 本番でのみ再現する問題は、エラーメッセージに詳細（レスポンスサイズ、HTTP ステータス等）を含めて切り分ける
- `--no-dev` でも再現しない場合がある。ネイティブバイナリの違い（EAS Build vs dev client）が原因の可能性

## 本番ビルドのみブロックされた原因の考察

### デフォルト UA の調査結果

httpbin.org で確認したデフォルト UA:
- 開発ビルド: `app/6 CFNetwork/3860.400.51 Darwin/25.3.0`
- 本番ビルド: `app/13 CFNetwork/3860.400.51 Darwin/25.3.0`

CFNetwork・Darwin バージョンは同一で、ビルド番号のみ異なる。どちらも非ブラウザ UA。
**UA 文字列の違いだけではブロックの差を説明できない。**

### 推測: Cloudflare のボットスコアリング複合判定

最も可能性が高い仮説は、Cloudflare が単一要素ではなく複数要素の組み合わせでボットスコアを算出していること:

- 本番アプリは約342人のユーザーが同一の `app/13 CFNetwork/...` UA でアクセス
- 通常のブラウザなら Chrome / Safari 等の何百種類もの UA に分散する
- 「非ブラウザ UA × 多数の異なる IP から同一パターン × 一定の頻度」がボットネットのパターンに類似
- 開発ビルドは1人しか使わないためスコアが閾値に達しなかった

### 対策: UA ランダム化

`BROWSER_UAS` 配列に複数のブラウザ UA を定義し、リクエストごとにランダムに選択する方式を導入。
これにより、リクエストが通常のブラウザアクセスのパターンに近づく。

## 再発リスクと対処の難易度

| ブロック手法 | 再発リスク | 対処 | 難易度 |
|---|---|---|---|
| UA ベースのブロック | 低（対策済み） | UA パターンの追加・更新 | 簡単 |
| TLS フィンガープリント | 不明 | Expo SDK アップグレード or カスタムネイティブモジュール | 困難 |
| JS チャレンジの全面導入 | 低 | アプリからの直接アクセスが不可能になる | 対処不可 |

### TLS フィンガープリントでブロックされた場合の判別方法

TLS ブロック時もレスポンスは UA ブロックと同じ（200 + 空ボディ、または 403）で、原因の明示はない。
消去法で推測するしかない:

1. ブラウザ UA を設定しても空ボディ → UA が原因ではない
2. 異なる UA を複数試しても全て空ボディ → UA 以外の要素
3. 開発ビルドでは動く → ネイティブバイナリの違い（TLS の可能性）
4. Expo SDK アップグレード + 再ビルドで直った → TLS がほぼ確定

### TLS フィンガープリントでブロックされた場合の対処

同じ Expo SDK で再ビルドしても TLS フィンガープリントは変わらない（HTTP クライアント = OkHttp / NSURLSession のバージョンが同じため）。

対処の選択肢:
1. **Expo SDK のメジャーアップグレード** — OkHttp 等が更新される可能性があるが確実ではない
2. **カスタムネイティブモジュール** — 別の HTTP クライアントを使う（大がかり）
3. **自前プロキシサーバー** — ブラウザの TLS で中継する（Cloudflare Workers は同様にブロックされるため別サーバーが必要）
