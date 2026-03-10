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
