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

### GETリクエスト: カスタムヘッダーを付けない

```javascript
// NG: Cloudflare に空ボディにされる
const res = await fetch(url, { headers: { 'User-Agent': '...', Accept: '...' } })

// OK: ヘッダーなし
const res = await fetch(url, { credentials: 'include' })
```

### 検索API: タイムスタンプでキャッシュバスト

Cloudflare が空レスポンスをキャッシュすることがある（`cf-cache-status: HIT`）。

```javascript
// NG: キャッシュされた空レスポンスが返る
const res = await fetch(`${BASE_URL}/search/search?q=${q}&sk_token=${token}`)

// OK: タイムスタンプでキャッシュキーを変える
const res = await fetch(`${BASE_URL}/search/search?q=${q}&sk_token=${token}&_t=${Date.now()}`)
```

### POSTリクエスト: 最小限のヘッダーのみ

```javascript
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Origin: BASE_URL,
    Referer: '...',
    // User-Agent, Accept, Accept-Language は付けない
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

## アクセス元別のブロック状況（2026-02-26 時点）

| アクセス元 | result ページ | 個別コメント API | `?nxc=` |
|---|---|---|---|
| アプリ fetch (ヘッダーなし) | ✓ 成功 | ✓ 成功 | ✗ `?cm` にリダイレクト |
| アプリ fetch (カスタムヘッダー付き) | ✗ 空ボディ | 未テスト | ✗ リダイレクト |
| WebView (同一オリジン fetch) | ✓ 成功 | ✓ 成功 | ✗ `?cm` にリダイレクト |
| Workers fetch | ✗ チャレンジ | ✗ チャレンジ | ✗ チャレンジ |
| curl | ✗ チャレンジ | ✗ チャレンジ | ✗ チャレンジ |
| 実ブラウザ (Chrome) | ✓ 成功 | ✓ 成功 | ✓ 成功 |

## 時系列（2026-02-25 の事例）

1. 投票エラー発生。ストア版でも再現 → コード変更が原因ではない
2. Python では正常取得 → サーバーは生きている
3. アプリ内 debugFetch でヘッダーなし fetch は成功、ヘッダー付きは空 → **ヘッダーが原因**
4. `get()` からカスタムヘッダーを除去 → 投票復旧
5. 検索 API は Python でも空 → Cloudflare キャッシュの問題
6. `&_t=timestamp` 追加 → 検索復旧
7. POST の `...HEADERS` を除去 → コメント投稿復旧
