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

BROWSER_HEADERS + UA ローテーション + リトライを実装しても、0bytes エラーが再発する。
根本原因は未確定だが、React Native の `fetch` が Cloudflare のボットスコアリングでブロックされることがある。

再起動で直ることがある挙動から、TLS フィンガープリント単独では原因を説明できない（TLS は再起動で変わらないため）。UA の当たり外れ、Cloudflare 側のスコアリング揺らぎ、または未特定の要素が関与している可能性がある。

いずれにせよ、WebView は実ブラウザエンジンを使うため、Cloudflare が判定に使うあらゆるシグナル（UA、ヘッダー、TLS、クッキー、JS 実行能力）が本物のブラウザと一致する。根本原因が何であっても WebView 方式なら回避できる。

### 方針: WebView で投票フローを完結させる

`react-native-webview` は実ブラウザエンジン（iOS: WKWebView / Android: Chromium WebView）を使うため、TLS フィンガープリントも本物のブラウザと一致する。投票フローを WebView 内で完結させることで Cloudflare を根本的に回避する。

### 実装手順

1. **非表示の WebView** を投票時にマウントする（`style={{ height: 0, width: 0, opacity: 0 }}`）
2. WebView の `source` に `/people/vote/{name}` を設定してロード
3. `injectedJavaScript` でトークン（`id`, `auth1`, `auth2`, `auth-r`）を抽出し、`window.ReactNativeWebView.postMessage(JSON.stringify(tokens))` で RN に送信
4. RN 側の `onMessage` でトークンを受信後、WebView に投票フォーム submit を実行する JS を inject
5. submit 後の結果ページ HTML を再度 `postMessage` で返す
6. RN 側で結果 HTML を parseResult / parseComments して UI に反映
7. 投票完了後に WebView をアンマウント

### ポイント

- **初期ロードは成功する**（2026-02-28 検証で確認済み）。投票は1回のロード + 1回の submit で完結するため、「ページ遷移後に JS 実行不可」問題には該当しない
- フォーム submit は `XMLHttpRequest` か `fetch` を WebView 内から実行する方式（ページ遷移ではなく XHR）にすればナビゲーションなしで完結
- WebView 内の fetch は実ブラウザの TLS + クッキーを使うため、Cloudflare のボットスコアが低くなる
- WebView のクッキーは WKWebView / Chromium のクッキーストアに保存され、`credentials: 'include'` の RN fetch とは独立
- 既存の `get()` によるフォールバック（RN fetch 方式）は残しておき、WebView がタイムアウトした場合の代替とする

### 注意点

- WebView のマウント/アンマウントにはレンダリングコストがある → 投票ボタン押下時のみマウント
- WebView 内の JS が `postMessage` を返す前にタイムアウトした場合のハンドリングが必要
- Android と iOS で WebView のクッキー挙動が異なる場合がある → 両プラットフォームでテスト必須
- 以前検証した「ページ遷移後に JS 実行不可」問題は pagination（複数ページ順次取得）で発生。投票フローは1ページ完結なので該当しない
