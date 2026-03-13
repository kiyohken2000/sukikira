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

### 全リクエスト: ブラウザ風ヘッダーを設定（2026-03-10 更新）

2026-03 に Cloudflare がネイティブ HTTP クライアント（Android: OkHttp、iOS: NSURLSession）のデフォルト User-Agent をボット判定し始めた。ブラウザ風 UA だけでなく、`Accept` / `Accept-Language` 等の標準ヘッダーも含めないとブロックされる。

```javascript
// ブラウザ標準ヘッダー（UA 以外）
const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
}

// GET
const res = await fetch(url, {
  credentials: 'include',
  headers: { ...BROWSER_HEADERS, 'User-Agent': getBrowserUA() },
})

// POST（Origin / Referer も必須）
const res = await fetch(url, {
  method: 'POST',
  credentials: 'include',
  headers: {
    ...BROWSER_HEADERS,
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': getBrowserUA(),
    Origin: BASE_URL,
    Referer: `${BASE_URL}/people/vote/${encodedName}`,
  },
  body,
})
```

**重要な注意点:**
- UA だけ設定しても不十分。Cloudflare は**ヘッダーの組み合わせ**でスコアリングする
- UA が Chrome なのに `Accept` / `Accept-Language` がないと「UA 偽装ボット」と判定される
- POST に `Origin` / `Referer` がないとブラウザのフォーム送信として不自然
- UA のバージョンが古すぎるとブロックされる（2年前の UA は NG）→ 定期的な更新が必要

### 検索API: タイムスタンプでキャッシュバスト

Cloudflare が空レスポンスをキャッシュすることがある（`cf-cache-status: HIT`）。

```javascript
// NG: キャッシュされた空レスポンスが返る
const res = await fetch(`${BASE_URL}/search/search?q=${q}&sk_token=${token}`)

// OK: タイムスタンプでキャッシュキーを変える
const res = await fetch(`${BASE_URL}/search/search?q=${q}&sk_token=${token}&_t=${Date.now()}`)
```

### POSTリクエスト: 全ブラウザヘッダー + Origin/Referer

```javascript
const res = await fetch(url, {
  method: 'POST',
  credentials: 'include',
  headers: {
    ...BROWSER_HEADERS,
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': getBrowserUA(),
    Origin: BASE_URL,
    Referer: `${BASE_URL}/people/vote/${encodedName}`,
  },
  body,
})
```

以前は `Content-Type + User-Agent` のみで動いていたが、2026-03-10 にブロックされるようになった。

### 全エンドポイントにブラウザヘッダー設定済み（2026-03-10 更新）

全 fetch に `BROWSER_HEADERS` + `getBrowserUA()` を統一適用。POST には `Origin` / `Referer` も追加。

| 関数 | エンドポイント | ヘッダー |
|---|---|---|
| `get()` | 全 GET リクエスト | BROWSER_HEADERS + credentials + User-Agent |
| `vote` | `/people/result/{name}` (POST) | BROWSER_HEADERS + Content-Type + User-Agent + Origin + Referer |
| `search` | `/search/search` (GET) | BROWSER_HEADERS + User-Agent |
| `getMoreComments` | `/p/{pid}/c/{cid}/t/{sk_token}` (GET) | BROWSER_HEADERS + credentials + User-Agent |
| `voteComment` | `api.suki-kira.com/comment/vote` (POST) | BROWSER_HEADERS + Content-Type + User-Agent + Origin + Referer |
| `postComment` | `/people/comment/{name}` (POST) | BROWSER_HEADERS + Content-Type + User-Agent + Origin + Referer |

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
| 本番アプリ fetch (旧 UA のみ) | ✗ 空ボディ | ✗ 空ボディ |
| 本番アプリ fetch (現行 UA + BROWSER_HEADERS) | ✓ 成功 | ✓ 成功 |
| 開発ビルド fetch (旧 UA のみ) | ✗ 空ボディ | ✗ 空ボディ |
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

### 事例3: 2026-03-10 — UA だけでは不十分、ヘッダー全体の整合性が必要

1. 投票時に 0bytes エラー。再起動しても改善しない。**開発ビルドでも再現**
2. UA ローテーション（別の UA でリトライ）を実装 → 改善せず
3. UA リストが2年前のバージョン（Chrome 122, iOS 17.4）であることを発見
4. UA を現行バージョン（Chrome 145, iOS 26/18.4）に更新
5. `Accept` / `Accept-Language` ヘッダーを全リクエストに追加（`BROWSER_HEADERS` 定数）
6. 投票 POST に `Origin` / `Referer` ヘッダーを追加

**教訓:**
- UA 文字列を偽装しても、`Accept` / `Accept-Language` がなければ「UA 偽装ボット」と判定される
- Cloudflare は**ヘッダーの組み合わせ（composite signal）**でボットスコアリングする
- POST に `Origin` / `Referer` がないとブラウザのフォーム送信として不自然
- UA のバージョンは定期的に更新が必要（2年前のバージョンはボット判定リスク大）
- 空レスポンス時の自動 UA ローテーション + リトライを `get()` に組み込み

### 事例4: 2026-03-11 — BROWSER_HEADERS + UA ローテーション実装後も再発

1. 事例3 の対策（BROWSER_HEADERS + 現行 UA + ローテーション + リトライ）をコミット済み
2. 投票時に 0bytes エラーが再発
3. 何度かアプリを再起動すると投票できるようになる
4. 一度投票できるようになると、以降はアプリを再起動しても継続して投票可能

**考察:**
- TLS フィンガープリントは同じ OS・SDK なら再起動しても変わらないため、TLS が原因なら「常にブロック」になるはず。再起動で直ることと矛盾する
- 再起動で変わるのは **UA 文字列**（ランダム再選択）と **TCP コネクション**（新規接続）
- Cloudflare のボットスコアリングに **UA ごとのスコア差**や**タイミングによる揺らぎ**がある可能性
- 一度通ると `cf_clearance` 等の信頼クッキーが `credentials: 'include'` 経由でネイティブクッキージャーに保持され、以降は信頼済みとなる
- **根本原因は未確定**。UA の当たり外れ、Cloudflare 側のスコアリング揺らぎ、またはまだ特定できていない要素の可能性がある

**対策: UA パターン拡充 + リトライ回数強化**
- UA パターンを 8 → 20 に拡充（Safari/Chrome/Firefox/Edge/Samsung Browser × iPhone/Android/Desktop）
- リトライ回数を 1 → 最大 8 に増加（初回含め最大 9 UA を試行）
- 待ち時間は 500ms → 1900ms に段階的増加（全失敗時の最大待ち時間: 約 9.6 秒）
- 「何度か再起動すると直る」動作をアプリ再起動なしで自動的に再現する狙い

### 事例5: 2026-03-12 — `?_t=` キャッシュバストでサーバーが var_dump を返す + vote() リトライなし

> **注意: この事例は Cloudflare の BOT 対策変更ではなく、好き嫌い.com の PHP サーバー側の変更が原因。** `/people/` 系エンドポイントが未知のクエリパラメータ（`_t`）を `var_dump()` するようになった。修正過程で二次的な問題（CF 判定誤検出、二重リトライ、POST 後の再投票）が発生したが、これらは全て最初の問題の修正に起因するもの。

1. 人物詳細画面で「この人物のページはsuki-kira.comに存在しません」エラー。再読み込み連打で表示される
2. ランキング画面は正常（開発ビルド）。製品版も正常
3. デバッグログ追加で原因特定: レスポンスが `string(13) "1773315794818"` (27bytes) — PHP の `var_dump()` 出力
4. `/people/result/{name}?_t={timestamp}` の `_t` パラメータをサーバーが PHP 変数として処理し、ページ本体ではなくタイムスタンプの `var_dump()` を返していた
5. このレスポンスが `notFound` 判定（`/people/` も `好き派` も含まない）に合致し、「存在しません」エラーになっていた
6. また、`isCloudflareChallenge()` を `get()` に組み込んだ際、`cf-ray` 等の広すぎるマーカーが全 CF プロキシページにマッチし、正常なページも CF チャレンジと誤判定 → 全リトライ失敗
7. 投票も0bytesエラー: `vote()` 内の投票POST（直接 `fetch`）にリトライロジックがなく、1回の失敗で即エラー

**修正（第1弾）:**
- `/people/result/` と `/people/vote/` から `?_t=` キャッシュバストを削除（検索API `/search/search` は `&_t=` で問題なし）
- `isCloudflareChallenge()` は `getComments()` の `notFound` 誤判定防止にのみ使用。`get()` では使わない（正常ページの誤検出を防止）
- CF 判定の正規表現を厳密化: `<title>Just a moment...</title>` / `challenge-platform` / `id="cf-challenge"` / `id="challenge-running"` のみ（`cf-ray` 等は全ページに含まれるため除外）
- `vote()` 全体にリトライループ追加: トークン取得→POST→結果確認の一連を最大9回（1+8リトライ）、UA ローテーション付きで試行
- `get()` 内のエラーもキャッチしてリトライ（`get()` 内の8回リトライが全滅しても、`vote()` レベルで UA を変えて再挑戦）

**修正（第2弾）— 二重リトライ問題と POST 後の再投票防止:**

第1弾の `vote()` リトライは `get()` 内部のリトライとネストしていた。`vote()` → `get()` → 8回リトライ全滅 → `vote()` がキャッチ → UA ローテーション → また `get()` → 8回リトライ... で最大 9×9=81回 fetch が走り、全UA を何周もローテーションしていた。

また、POST 送信後にレスポンスが空だった場合、投票自体はサーバーに届いている可能性が高いのに、再度 vote ページ取得→トークン取得→POST 送信と再投票フローを走らせていた。

修正内容:
- `vote()` の vote ページ取得を `get()` から**単発 `fetch`** に変更。`vote()` 自身がリトライを管理し、1回の試行 = 1回の fetch に
- **POST 送信後は再投票しない**: レスポンスが空/結果以外の場合は `getComments()` で結果ページの取得のみをリトライ（最大8回）
- 結果取得も全失敗した場合は「投票は送信されましたが結果の取得に失敗しました。リロードしてください」とユーザーに通知（二重投票を防止）
- POST 後のエラー（`投票は送信されました`）は外側リトライループに伝播せず、そのまま throw

**教訓:**
- `?_t=` キャッシュバストは**クエリパラメータが既にある URL**（`/search/search?q=...&_t=`）では安全だが、**パラメータなしの URL**（`/people/result/{name}?_t=`）ではサーバーが `_t` を未知のパラメータとして処理する可能性がある
- Cloudflare の CF マーカー（`cf-ray`, `challenge-platform` 等）は Bot Management が**全ページ**に埋め込むことがある。チャレンジページ判定には `<title>Just a moment...</title>` 等のチャレンジ固有マーカーのみ使うこと
- `fetch` のリトライは `get()` だけでなく、それを利用する上位関数（`vote()` 等）にも必要。ただし **二重リトライにならないよう**、上位関数は `get()` ではなく単発 `fetch` を使うこと
- **POST 送信後は再投票してはいけない**。レスポンスが空でもサーバーには届いている可能性が高い。結果ページの取得だけをリトライし、それも失敗したらユーザーにリロードを促す

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

### 対策: セッション固定 UA ランダム化 + 空レスポンス時ローテーション

`BROWSER_UAS` 配列に20パターンの**現行バージョン**ブラウザ UA を定義し、**セッション（モジュールロード）単位でランダムに1つ選択して固定**する方式を導入。全 fetch リクエストに統一適用。

- リクエストごとに UA を変えると同一 IP からの不自然なパターンになるため、セッション単位で固定
- アプリ再起動で新しい UA が選ばれるため、長期的には分散する
- **空レスポンス検出時は自動で次の UA にローテーション**して最大8回リトライ（`get()` 内で実装）
- 初回含め最大9つの UA を1セッション内で試行（再起動を繰り返すのと同等の効果）
- 待ち時間は 500ms〜1900ms に段階的増加（全失敗時の最大待ち時間: 約 9.6 秒）
- UA のバージョンは定期的に現行ブラウザに合わせて更新すること（古い UA はボット判定される）
- UA だけでなく `Accept` / `Accept-Language` も全リクエストに設定（`BROWSER_HEADERS` 定数）

UA パターン内訳（20種）:
| ブラウザ | プラットフォーム | パターン数 |
|---|---|---|
| Safari | iPhone (iOS 26/18.4/18.3.2/18.3) | 4 |
| Chrome | Android (Pixel 9/8a, Galaxy S24 Ultra/A55/S24+) | 5 |
| Chrome | iPhone (iOS 18.4/26) | 2 |
| Safari | iPad (Desktop mode) | 1 |
| Chrome | Desktop (Windows/Mac) | 2 |
| Firefox | Android / Desktop (Windows/Mac) | 3 |
| Edge | Desktop (Windows) | 1 |
| Samsung Browser | Android (Galaxy S24 Ultra/S24+) | 2 |

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
1. **WebView 方式（推奨）** — 後述の「WebView 投票方式」を参照
2. **Expo SDK のメジャーアップグレード** — OkHttp 等が更新される可能性があるが確実ではない
3. **カスタムネイティブモジュール** — 別の HTTP クライアントを使う（大がかり）
4. **自前プロキシサーバー** — ブラウザの TLS で中継する（Cloudflare Workers は同様にブロックされるため別サーバーが必要）

## WebView 投票方式（次の対策候補）

### 背景

UA ローテーション + リトライで投票できているが、Cloudflare/サーバー側の変更で繰り返しブロックされている（事例1〜5）。次にリトライ方式で対処不可能な問題が発生した場合、WebView 方式に切り替える。

WebView は実ブラウザエンジン（iOS: WKWebView / Android: Chromium WebView）を使うため、Cloudflare が判定に使うあらゆるシグナル（UA、ヘッダー、TLS、クッキー、JS 実行能力）が本物のブラウザと一致する。根本原因が何であっても WebView 方式なら回避できる。

### 適用範囲

**投票フロー（`vote()`）のみ**。読み取り系（ランキング、コメント表示）は現行の `get()` + リトライで十分。

理由:
- Cloudflare に頻繁にブロックされるのは `/people/vote/` と `/people/result/` への POST
- 全通信を WebView にすると、無限スクロール等の頻繁な通信すべてに WebView のオーバーヘッドがかかる
- 投票は「1回成功すればいい」操作なので遅延が許容しやすい

### アーキテクチャ

```
[Details.js]
  ├─ onVote('like') 押下
  │
  ├─ 現行: vote(name, 'like')  ← sukikira.js の RN fetch 方式
  │
  └─ 新方式: webViewVote(name, 'like')  ← WebView 方式
       │
       ├─ <VoteWebView> をマウント（非表示）
       ├─ vote ページロード → injectedJS でトークン抽出 → postMessage
       ├─ RN で受信 → injectJavaScript で XHR POST 実行
       ├─ 結果 HTML を postMessage → RN で parseResult/parseComments
       └─ resolve({ resultInfo, comments, nextCursor })
```

### ファイル構成

```
apps/mobile/src/
  components/
    VoteWebView.js     ← 新規: 非表示 WebView コンポーネント
  utils/
    sukikira.js        ← 既存: vote() は残す（フォールバック用）
    webViewVote.js     ← 新規: WebView 投票の Promise ラッパー
  scenes/details/
    Details.js         ← 変更: onVote で webViewVote → vote フォールバック
```

### 1. VoteWebView.js — 非表示 WebView コンポーネント

```jsx
// apps/mobile/src/components/VoteWebView.js
import React, { useRef, useEffect } from 'react'
import { WebView } from 'react-native-webview'

const TIMEOUT_MS = 15000

// vote ページロード後にトークンを抽出して postMessage する JS
const EXTRACT_TOKENS_JS = `
(function() {
  // 既投票済み（result ページ）の場合
  if (document.body.innerHTML.includes('好き派:')) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'result',
      html: document.documentElement.outerHTML,
    }));
    return;
  }
  // vote ページ → トークン抽出
  var getId = function(n) {
    var el = document.querySelector('input[name="' + n + '"]');
    return el ? el.value : null;
  };
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'tokens',
    id: getId('id'),
    auth1: getId('auth1'),
    auth2: getId('auth2'),
    authR: getId('auth-r'),
  }));
})();
true;
`

// トークンを使って XHR で投票 POST する JS を生成
const makePostJS = (encodedName, voteType, tokens) => `
(function() {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/people/result/${encodedName}', true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onload = function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'postResult',
      html: xhr.responseText,
      status: xhr.status,
    }));
  };
  xhr.onerror = function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'postError',
      message: 'XHR error',
    }));
  };
  var params = 'vote=${voteType === 'like' ? '1' : '0'}'
    + '&ok=ng'
    + '&id=${tokens.id}'
    + '&auth1=${tokens.auth1}'
    + '&auth2=${tokens.auth2}'
    + '&auth-r=${tokens.authR}';
  xhr.send(params);
})();
true;
`

/**
 * @param {object} props
 * @param {string} props.name - 人物名（デコード済み）
 * @param {'like'|'dislike'} props.voteType
 * @param {(result: {type: string, html?: string, error?: string}) => void} props.onComplete
 * @param {() => void} props.onTimeout
 */
const VoteWebView = ({ name, voteType, onComplete, onTimeout }) => {
  const webViewRef = useRef(null)
  const timerRef = useRef(null)
  const encodedName = encodeURIComponent(name)
    .replace(/\(/g, '%28').replace(/\)/g, '%29')

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onTimeout()
    }, TIMEOUT_MS)
    return () => clearTimeout(timerRef.current)
  }, [])

  const handleMessage = (event) => {
    const data = JSON.parse(event.nativeEvent.data)

    if (data.type === 'result') {
      // 既投票済み → そのまま返す
      clearTimeout(timerRef.current)
      onComplete(data)
    } else if (data.type === 'tokens') {
      // トークン取得成功 → XHR で POST
      if (!data.id || !data.auth1 || !data.auth2 || !data.authR) {
        clearTimeout(timerRef.current)
        onComplete({ type: 'error', error: 'token parse failed' })
        return
      }
      const js = makePostJS(encodedName, voteType, data)
      webViewRef.current?.injectJavaScript(js)
    } else if (data.type === 'postResult') {
      // POST 完了 → 結果 HTML を返す
      clearTimeout(timerRef.current)
      onComplete(data)
    } else if (data.type === 'postError') {
      clearTimeout(timerRef.current)
      onComplete({ type: 'error', error: data.message })
    }
  }

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: `https://suki-kira.com/people/vote/${encodedName}` }}
      injectedJavaScript={EXTRACT_TOKENS_JS}
      onMessage={handleMessage}
      style={{ height: 0, width: 0, opacity: 0, position: 'absolute' }}
      // JS チャレンジ通過のため javaScriptEnabled は必須（デフォルト true）
      javaScriptEnabled={true}
    />
  )
}

export default VoteWebView
```

### 2. webViewVote.js — Promise ラッパー

```javascript
// apps/mobile/src/utils/webViewVote.js
//
// VoteWebView の結果を Promise で返すためのイベントバス。
// Details.js が VoteWebView をレンダーし、結果をこのモジュール経由で resolve する。
//
// 使い方:
//   const promise = createVotePromise()
//   // → VoteWebView をマウント（onComplete で resolveVote を呼ぶ）
//   const result = await promise

let _resolve = null
let _reject = null

export const createVotePromise = () => {
  return new Promise((resolve, reject) => {
    _resolve = resolve
    _reject = reject
  })
}

export const resolveVote = (result) => {
  if (_resolve) {
    _resolve(result)
    _resolve = null
    _reject = null
  }
}

export const rejectVote = (error) => {
  if (_reject) {
    _reject(error)
    _resolve = null
    _reject = null
  }
}
```

### 3. Details.js — 統合

```javascript
// Details.js の onVote を以下のように変更:

import VoteWebView from '../../../components/VoteWebView'
import { parseResult, parseComments } from '../../../utils/sukikira'
// ↑ parseResult, parseComments を sukikira.js から export する必要あり

const [webViewVote, setWebViewVote] = useState(null)
// webViewVote = { name, voteType } or null（マウント制御用）

const onVote = async (type) => {
  if (voteStatus) return
  setVoting(true)
  try {
    // --- WebView 方式 ---
    const result = await new Promise((resolve, reject) => {
      // VoteWebView マウント用 state をセット
      setWebViewVote({
        name,
        voteType: type,
        onComplete: (data) => {
          setWebViewVote(null) // アンマウント
          resolve(data)
        },
        onTimeout: () => {
          setWebViewVote(null) // アンマウント
          reject(new Error('WebView timeout'))
        },
      })
    })

    if (result.type === 'error') {
      throw new Error(result.error)
    }

    // result.html から parseResult / parseComments
    if (result.html && /好き派:/.test(result.html)) {
      const info = parseResult(result.html)
      const cmts = parseComments(result.html)
      setResultInfo(info)
      setComments(cmts)
      // ... 以降は現行の onVote 成功時と同じ処理
    }
  } catch (e) {
    // --- WebView 失敗時: 現行の RN fetch 方式にフォールバック ---
    console.warn('[Details] WebView vote failed, falling back to fetch:', e.message)
    try {
      const { resultInfo: info, comments: cmts, nextCursor: cursor } = await vote(name, type)
      // ... 現行の成功処理
    } catch (fetchErr) {
      // 両方失敗
      Alert.alert('エラー', `投票に失敗しました: ${fetchErr.message}`)
    }
  } finally {
    setVoting(false)
  }
}

// render 内に追加（return の中、任意の場所）:
{webViewVote && (
  <VoteWebView
    name={webViewVote.name}
    voteType={webViewVote.voteType}
    onComplete={webViewVote.onComplete}
    onTimeout={webViewVote.onTimeout}
  />
)}
```

### 4. sukikira.js — export 追加

`parseResult` と `parseComments` を Details.js から使えるよう export する:

```javascript
// 現行: const parseResult = (html) => { ... }
// 変更: export const parseResult = (html) => { ... }
//
// 現行: const parseComments = (html) => { ... }
// 変更: export const parseComments = (html) => { ... }
```

### 既存コードとの関係

| 関数/ファイル | 変更内容 |
|---|---|
| `sukikira.js` の `vote()` | **変更なし**。フォールバック用にそのまま残す |
| `sukikira.js` の `parseResult` / `parseComments` | `export` を追加 |
| `Details.js` の `onVote` | WebView 方式を先に試行し、失敗時に `vote()` にフォールバック |
| `VoteWebView.js` | 新規作成 |
| `webViewVote.js` | 新規作成（不要になる可能性あり。Details.js 内で Promise を作る方式なら不要） |

### 検証済み事項（2026-02-28）

- WebView での初期ロードは成功する
- 投票は1回のロード + 1回の XHR POST で完結するため、「ページ遷移後に JS 実行不可」問題には該当しない
- `react-native-webview` は既にインストール済み（`WebViewTest.js` で使用中）

### 注意点

- `makePostJS` 内のテンプレートリテラルで `tokens` の値を直接埋め込むため、XSS に注意。トークン値は英数字のみなので通常は問題ないが、念のためエスケープを検討
- タイムアウト（15秒）は Cloudflare の JS チャレンジ通過時間を考慮。チャレンジが5秒程度かかることがある
- WebView マウント中に画面遷移した場合の cleanup を useEffect の return で行うこと
- Android と iOS で WebView のクッキー挙動が異なる可能性 → 両プラットフォームでテスト必須

---

## 2026-03-14 追記: WebView 先行フォールバックの検証結果（不採用）

### 目的
- 投票済み人物の詳細表示で空ボディが連続する問題を回避するため、
  Details 画面の読み込みを「WebView 先行 → 失敗時 fetch」に切り替えた。
- 投票も「WebView 先行 → 失敗時 fetch」に変更して試験。

### 実装方針（検証版）
- Details 読み込み:
  - WebView で `/people/result/{name}` を取得
  - 結果HTMLをパースして UI 更新
  - 失敗時に fetch + UA ローテーションへフォールバック
  - WebView が vote ページを返した場合はキャッシュ表示（stale）に切り替え
- 投票:
  - WebView で vote ページ取得 → XHR POST
  - 失敗時に従来の fetch 投票へフォールバック

### 観測された問題
- WebView が `about:srcdoc` を外部で開こうとして警告が出ることがあり、ローディングが止まるケースがあった
  - `originWhitelist` に `about:*` を追加し回避
- WebView が「短いHTML（例: 39 bytes）」を返すことがあり、結果ページとして扱えない
  - HTML 長さが短い場合は再試行するロジックを追加
- WebView が結果HTMLを返してもタイムアウトが発火するケースがあり、再試行や fetch フォールバックが走って遅くなる
- WebView が結果ではなく vote ページを返すケースがあり、stale 表示になる
- 開閉を繰り返すとローディングが止まることがあり、早期タイムアウト＋watchdogで緩和したが完全解消はできなかった

### 結論
- WebView 先行は安定性が低く、結果的に fetch リトライと体感が大きく変わらなかった。
- 本番への適用は見送る。

### ノウハウ（参考として残す）
- WebView での取得は「短すぎるHTMLは無効」として再試行すること
- `about:srcdoc` 警告が出た場合は `originWhitelist` へ `about:*` を追加すること
- WebView が vote ページを返す場合があるため、vote ページ判定を先に行うこと
- WebView はタイムアウトや二重完了が起きやすいので、完了フラグで二重処理を防止すること
- WebView を 0x0 サイズ（`width/height: 0`）にすると、OS の最適化で読み込みや JS 実行が不安定になる可能性がある。
  - 代替: `width: 1, height: 1, opacity: 0, position: 'absolute'` で画面内に置く

### パッチ
- 検証用の差分パッチ: `patches/webview-fallback-experiment.patch`
- 適用: `git -c safe.directory=C:/Users/all/develop/expo/sukikira apply patches/webview-fallback-experiment.patch`
- 破棄（元に戻す）: `git -c safe.directory=C:/Users/all/develop/expo/sukikira apply -R patches/webview-fallback-experiment.patch`
