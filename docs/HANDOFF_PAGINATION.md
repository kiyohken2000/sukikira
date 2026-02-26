# コメントページネーション調査 引継ぎ

## 現状

Cloudflare が `?nxc=` パラメータ付きリクエストをブロックし、2ページ目以降のコメントが取得できない。
暫定対応として個別コメントAPI (`/p/{pid}/c/{cid}/t/{sk_token}`) で1件ずつ取得しているが、
**upvote/downvote 数と投票トークンが欠落**するため完全な解決ではない。

## 判明済みの事実

### Cloudflare の挙動（実測）

| リクエスト条件 | `?nxc=` の結果 |
|---|---|
| UA なし（現在のアプリ方式） | `?cm` にリダイレクト（1ページ目に戻る） |
| モバイル UA あり | リダイレクトなし、**空ボディ**（Cloudflare JS チャレンジ） |
| デスクトップ UA あり（Python） | リダイレクトなし、コンテンツ返却だが**1ページ目と同じコメント** |
| **react-native-webview + デスクトップ UA** | **`?cm` にリダイレクト**（1ページ目に戻る） |
| ブラウザ（cf_clearance cookie あり） | **正常動作** — 2ページ目以降のコメントが取得できる |
| axios (XMLHttpRequest) + デスクトップ UA | `?cm` にリダイレクト |
| POST で nxc をボディに入れる | サーバーが無視（1ページ目が返る） |

### WebView 検証結果（2026-02-25 実施）

react-native-webview でデスクトップ UA を設定し、実機テスト済み。

**成功した点:**
- result ページの読み込み — 20件のコメントを完全取得
- upvote/downvote 数 — HTML の `commentVote` ボタン id から取得成功
- token（good/bad 投票用）— 取得成功
- pid / xdate / pidHash — HTML 内の `var` 宣言から取得成功
- skToken — window スコープのグローバル変数から取得成功
- vote ページへのリダイレクト → 自動投票フォーム送信 → result ページ取得の一連のフロー

**失敗した点:**
- `?nxc=` で2ページ目へのナビゲーション — 同一 WebView セッション内（cookie 保持）でも `?cm` にリダイレクトされた
- Cloudflare がクエリパラメータ `nxc` 自体をブロックしている（`cf_clearance` cookie の有無は無関係の可能性）

**Nav ログの証拠:**
```
Nav: .../?nxc=145518 (loading=false)
Nav: .../?cm (loading=true)          ← サーバー側リダイレクト
```

### ブラウザでの正常な動作

ブラウザでは以下のように遷移する:
```
/?cm           → 最新コメント（42312〜42289）
/?nxc=42278    → 次ページ（42278〜42257）
/?nxc=42249    → その次（42249〜42228）
```

ページネーションリンクの HTML:
```html
<a rel="next" href="/?nxc=42278">次へ</a>
```

### 個別コメントAPI

```
GET /p/{pid}/c/{commentId}/t/{sk_token}
```
レスポンス:
```json
{
  "body": "コメント本文（HTMLタグ含む）",
  "index": "42277",
  "created_at": "2026-02-19 22:18",
  "type": "1",
  "name_hash": "匿名",
  "url": "https://suki-kira.com/people/result/2893?c=42277"
}
```
**含まれないもの**: upvoteCount, downvoteCount, token（good/bad 投票用）

### people-result.js 完全解析結果（2026-02-25）

`scripts/out/people-result.js` に全文保存済み（18,017文字、非minified）。

**発見されたエンドポイント:**

| エンドポイント | メソッド | 用途 |
|---|---|---|
| `https://api.suki-kira.com/comment/vote?xdate={xdate}&evl={like\|dislike}` | POST `{pid: pid_hash, token}` | コメント good/bad 投票 |
| `/p/{pid}/c/{cid}/t/{sk_token}` | GET (JSON) | 個別コメント取得 |
| `/people/vote/ban_comment/?xdate={xdate}` | POST `{pid_hash, token}` | コメント通報 |
| `/people/vote/ng_user/?index={index}` | POST `{pid}` | ユーザーNG |
| `/people/vote/healthcheck?pid={pid}` | GET | コメント送信前チェック |
| `https://suki-kira.com/search/tag/{term}` | GET (JSON) | タグ検索 |

**commentVote ボタンの id 構造:**
```
commentVote-{like|dislike}-{commentId}-{likeCount}-{dislikeCount}-{token}
```
例: `commentVote-like-145539-0-7-BaNxCBw+pI9y` → likes=0, dislikes=7, token=BaNxCBw+pI9y

**good/bad POST のレスポンス:**
- `api.suki-kira.com` が本体（`suki-kira.com` ではない）
- レスポンスは数値1文字のみ: `0`=受付成功、`5`=重複
- **投票数は含まれない**

**ページネーション関連:**
- JS 内にページネーション用の AJAX ロジックは**なし**（全てサーバーサイドレンダリング）
- JSON でコメント一覧を返す API は存在しない

### good/bad POST 詳細（2026-02-25 Python で検証）

- `sk=count`, `sk=info`, `sk=status`, `sk=get`, `sk=detail` — いずれも無効
- GET `/p/{pid}/c/{cid}/t/{sk_token}` — upvote/downvote は含まれない
- **upvote/downvote を取得する API は存在しない**（HTML の commentVote ボタン id が唯一のソース）

## 棄却されたアプローチ

### ~~1. WebView で ?nxc= ページネーション（window.location.href）~~
**棄却理由:** WebView + デスクトップ UA でも `?nxc=` は `?cm` にリダイレクトされる。
同一セッション内のナビゲーション（cookie 保持）でも同様。
テスト画面: `apps/mobile/src/scenes/debug/WebViewTest.js`

### ~~2. デスクトップ UA で ?nxc= アクセス~~
**棄却理由:** コンテンツは返るが1ページ目と同じコメント。`nxc` パラメータが無視される。

### ~~3. 他の API エンドポイント~~
**棄却理由:** people-result.js を完全解析済み。ページネーション用 API や
upvote/downvote を返す API は存在しない。

### ~~4. good/bad POST から投票数取得~~
**棄却理由:** レスポンスは `0` or `5` のみ。投票数は含まれない。

### ~~5. WebView 内 fetch("/?nxc=...")~~
**棄却理由（2026-02-25 実測）:** WebView 内で `fetch(url, {credentials:'include'})` を実行。
`redirected: true`, `finalUrl: .../?cm`。同一オリジン・cookie 共有でもリダイレクトされる。

### ~~6. DOM `<a rel="next">` の .click() で遷移~~
**棄却理由（2026-02-25 実測）:** ページネーションリンクは DOM に存在する:
```html
<a href="/people/result/木村拓哉/?nxc=145521" class="page-link" data-ci-pagination-page="5410" rel="next">前へ ›</a>
```
`.click()` でネイティブナビゲーションを発火 → Nav ログ:
```
Nav: .../木村拓哉/?nxc=145521 (loading=false)
Nav: .../木村拓哉/?cm (loading=true)    ← サーバーサイドリダイレクト
```
DOM クリックでも `?cm` にリダイレクトされる。**手法は無関係、WAF がパラメータ自体をブロック**。

### ~~7. WebView の cf_clearance cookie（非表示・可視 両方テスト済み）~~
**確認（2026-02-25 実測）:**
- 非表示 WebView (0x0, opacity:0): 12 cookies、cf_clearance なし
- **可視 WebView (250px)**: 24 cookies（広告系追加）、**cf_clearance なし**
- Selenium (実Chrome): cf_clearance **自動発行**（チャレンジなし）

**結論:** Cloudflare Managed Challenge（不可視 Turnstile）は実 Chrome プロセスでのみ通過する。
Android WebView は Chrome ベースだがフィンガープリントが異なり、cf_clearance が発行されない。
**WebView 経由での ?nxc= ページネーション突破は不可能。**

### ~~8. 個別コメントAPI URL で Cloudflare チャレンジを可視 WebView に表示~~
**棄却理由（2026-02-25 実測）:**
- `/p/{pid}/c/{cid}/t/{sk_token}` を可視 WebView で読み込み
- `htmlLength: 509` — Cloudflare チャレンジページが**表示された**（`cf_challenge` フェーズ検出）
- しかし Turnstile は**解決されなかった** — ページは challenge のまま遷移しない
- Cookie 確認: 22 cookies、**cf_clearance なし**
- **結論:** WebView でチャレンジページを表示しても、Turnstile は解けない。
  Cloudflare は WebView の fingerprint を実 Chrome と区別しており、チャレンジ自体を通過させない。

## 運営によるブロックの可能性

アプリをストアに公開した**翌日**から Cloudflare の挙動が変わった（空ボディ返却、`?nxc=` ブロック）。
`docs/CLOUDFLARE_TROUBLESHOOTING.md` の件（GET に空ボディが返る問題）も同時期に発生。

**意図的ブロックを示唆する点:**
- タイミングがアプリ公開直後と一致
- `?nxc=` パラメータだけをピンポイントでリダイレクトするのは WAF ルールの典型パターン
- UA なし / 非ブラウザからのアクセスを弾く設定も運営側で可能
- コメントページネーションだけがブロックされ、ランキングのページネーションは正常動作 → コメント大量取得を狙い撃ち

**偶然の可能性:**
- Cloudflare の Bot Fight Mode が自動でセキュリティレベルを上げた
- アプリからのアクセス増加で rate limit ルールが発動した

**留意事項:**
- 技術的に回避しても、いたちごっこになるリスクがある
- 突破を試みる前に「突破して使うべきか」の判断も必要

## 棄却されたアプローチ（追加分: 2026-02-26）

### ~~9. Cloudflare Workers プロキシ~~
**棄却理由（2026-02-26 実測）:**
- Workers をデプロイし `/batch` エンドポイントで個別コメント API をバッチ取得する方式を実装
- Workers 内の `fetch()` でも suki-kira.com から Cloudflare チャレンジ（"Just a moment..."、403）が返る
- result ページ、個別コメント API ともに Workers からはアクセス不可
- KV キャッシュ付きの実装を行ったが、そもそもオリジンからデータを取得できないため無意味
- **結論:** Workers の IP レンジも Cloudflare にブロックされている

### ~~10. expo-web-browser (Chrome Custom Tabs) プロキシ~~
**棄却理由（2026-02-26 検討）:**
- Chrome Custom Tabs は実 Chrome プロセスなので cf_clearance は取得可能
- しかし JS インジェクション不可・DOM 読み取り不可・Cookie 読み出し不可
- Workers ページを中継に使う案もクロスオリジンで失敗
- **結論:** データをアプリに戻す手段がない

### ~~11. WebView プロキシ（非表示 WebView で個別 API fetch）~~
**棄却理由（2026-02-26 実測）:**
- WebView で result ページをロード後、同一オリジン fetch で個別コメント API にアクセス → **成功**
- ただし、アプリの通常 fetch でも個別コメント API は現在動作中（curl/Workers からのみブロック）
- WebView プロキシにしても得られるデータは現行と同一（本文のみ、upvote/downvote なし）
- **結論:** 現行方式と同じ結果のため、追加の複雑さに見合わない

### ~~12. URL エンコードで WAF バイパス~~
**棄却理由（2026-02-26 実測）:** WebView 内 fetch で8パターンをテスト:

| パターン | WAF 回避 | サーバー認識 |
|---|---|---|
| `?nxc=` (通常) | ✗ リダイレクト | - |
| `?%6exc=` (n エンコード) | ✗ リダイレクト | - |
| `?%6E%78%63=` (全エンコード) | ✗ リダイレクト | - |
| `?NXC=` (大文字) | ✓ WAF 通過 | ✗ サーバー無視 |
| `?Nxc=` (混合) | ✓ WAF 通過 | ✗ サーバー無視 |
| `?nxc%20=` (スペース) | ✓ WAF 通過 | ✗ サーバー無視 |
| `/{nxc}/` (パス埋め込み) | ✓ WAF 通過 | ✗ サーバー無視 |
| `?cm#nxc=` (フラグメント) | ✓ WAF 通過 | ✗ サーバー無視 |

- WAF は URL デコード後の小文字 `nxc` をパターンマッチ → エンコード系は全滅
- 大文字等で WAF を回避できても、サーバーは小文字 `nxc` のみ認識 → ページネーションが効かない
- **結論:** WAF が弾くものとサーバーが認識するものが完全に一致。バイパス不可能

## 未探索の方向性

### ~~1. Selenium で cf_clearance 取得~~
**検証済み（2026-02-25 実測）:** `scripts/test_cf_clearance.py`
- Selenium (実Chrome): cf_clearance **自動発行**、`?nxc=` で2ページ目取得**成功**
  - コメント20件、ID範囲: 145520~145501（1ページ目: 145543~145521）
- requests に cookie を引き継ぎ: **403**（cf_clearance はブラウザセッション/TLS に紐付け）
- **結論:** cf_clearance は実 Chrome でのみ有効。外部 HTTP client には引き継げない

### 残る選択肢

なし。全ての合理的なアプローチを検証済み。

## 最終結論

**?nxc= ページネーションによる upvote/downvote 取得は技術的に不可能。**

### 現行方式（確定）
- **1ページ目（20件）**: 完全表示（upvote/downvote/token あり、good/bad 投票可能）
- **2ページ目以降**: 個別コメント API で取得（本文・日時・派閥のみ、upvote/downvote なし → グレーアウト表示）
- `getMoreComments()` は**動作中**（アプリの fetch は個別コメント API にアクセス可能。curl/Workers からのみブロック）

### ブロックの構造
- `?nxc=` パラメータ: WAF がリダイレクト（cf_clearance ありの実ブラウザのみ通過）
- 個別コメント API: アプリ fetch は通過、curl/Workers はブロック
- ランキングページネーション: 正常動作（コメントのみ狙い撃ち）

## 関連ファイル

| ファイル | 説明 |
|---|---|
| `apps/mobile/src/utils/sukikira.js` | API モジュール（`getMoreComments` が動作中） |
| `apps/mobile/src/scenes/details/Details.js` | 詳細画面（`loadMore` で呼び出し） |
| `apps/mobile/src/components/CommentItem/CommentItem.js` | コメント表示（グレーアウト処理） |
| `apps/mobile/src/scenes/debug/WebViewTest.js` | **WebView 検証テスト画面**（設定→バージョン5回タップ、テスト1-9） |
| `workers/comment-proxy/` | Workers プロキシ（テストコード。Cloudflare にブロックされるため未使用） |
| `scripts/test_cf_clearance.py` | Selenium cf_clearance テスト |
| `scripts/investigate_upvote_api.py` | API エンドポイント調査スクリプト |
| `scripts/out/people-result.js` | people-result.js 全文（18,017文字） |
| `scripts/out/investigate_upvote_api.txt` | API 調査結果 |
| `scripts/out/result_page.html` | result ページ HTML（参考用） |
| `scripts/analyze_pagination.py` | 初期調査スクリプト |
