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

### ~~1. WebView で ?nxc= ページネーション~~
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

## 運営によるブロックの可能性

アプリをストアに公開した**翌日**から Cloudflare の挙動が変わった（空ボディ返却、`?nxc=` ブロック）。
`docs/CLOUDFLARE_TROUBLESHOOTING.md` の件（GET に空ボディが返る問題）も同時期に発生。

**意図的ブロックを示唆する点:**
- タイミングがアプリ公開直後と一致
- `?nxc=` パラメータだけをピンポイントでリダイレクトするのは WAF ルールの典型パターン
- UA なし / 非ブラウザからのアクセスを弾く設定も運営側で可能

**偶然の可能性:**
- Cloudflare の Bot Fight Mode が自動でセキュリティレベルを上げた
- アプリからのアクセス増加で rate limit ルールが発動した

**留意事項:**
- 技術的に回避しても、いたちごっこになるリスクがある
- 個別コメント API (`/p/{pid}/c/{cid}/t/{sk_token}`) はまだ生きている
- 突破を試みる前に「突破して使うべきか」の判断も必要

## 未探索の方向性

### 1. cf_clearance cookie の明示的取得（最有力）

ブラウザが `?nxc=` で正常動作する**唯一の条件**は `cf_clearance` cookie。
WebView テストでは cf_clearance が発行されなかった可能性がある（JS チャレンジページが表示されなかった）。

**調査案:**
- WebView で Cloudflare チャレンジページを**意図的に**トリガーする
  - 例: 短時間に大量リクエストを送って rate limit を引く
  - または `/__cf_chl_tk` のようなチャレンジ URL に直接アクセス
- チャレンジ解決後に `cf_clearance` cookie が発行されるか確認
- `document.cookie` で `cf_clearance` を読み取り、以降の fetch に付与
- `@react-native-cookies/cookies` (CookieManager) で WebView → fetch への cookie 受け渡し

**Python で先行検証可能:**
```python
# Selenium/Playwright で cf_clearance を取得し、
# requests で ?nxc= にアクセスできるか確認
```

### 2. WebView 内で「次へ」リンクをクリック

`window.location.href = "?nxc=..."` ではなく、実際の DOM 要素（`<a rel="next">`）をクリックする。
ブラウザのネイティブナビゲーションなら Cloudflare が許可する可能性。

**調査案:**
```javascript
// WebView inject
var nextLink = document.querySelector('a[rel="next"]');
if (nextLink) nextLink.click();
```

### 3. WebView を fetch クライアントとして使う

ページのナビゲーションではなく、WebView 内で `fetch()` を実行して結果を postMessage で返す。
WebView 内の fetch はブラウザ環境と同等なので、cf_clearance が自動付与される可能性。

**調査案:**
```javascript
// WebView inject
fetch("/?nxc=145518").then(r => r.text()).then(html => {
  window.ReactNativeWebView.postMessage(JSON.stringify({ html: html }));
});
```

### 4. Cloudflare Workers プロキシ

最終手段。Cloudflare Workers でプロキシを立てる:
- Workers が `?nxc=` にアクセスし、結果を JSON で返す
- ただしサイトに負荷をかけるため倫理的に要検討
- Cloudflare が Workers からのリクエストもブロックする可能性

### 5. ハイブリッド方式で UX 改善（保険）

技術的解決が困難な場合の UX 側アプローチ:
- 1ページ目（20件）: 完全表示（upvote/downvote/token あり）← WebView 経由
- 2ページ目以降: 個別コメント API（本文のみ、upvote/downvote なし）← 現行方式
- グレーアウトの代わりに「投票数はページ読み込みで取得」等の説明表示

## 推奨する次の調査ステップ

1. **WebView 内 fetch テスト** — WebView 内で `fetch("/?nxc=...")` を実行し、
   2ページ目のコメントが取得できるか確認（テスト画面にボタン追加）
2. **「次へ」リンク DOM クリック** — `a[rel="next"]` の `.click()` で遷移した場合の挙動
3. **cf_clearance の Selenium 検証** — Python + Selenium で cf_clearance を取得し、
   requests で `?nxc=` にアクセス可能か確認
4. 上記全て失敗した場合 → ハイブリッド方式で UX 改善

## 関連ファイル

| ファイル | 説明 |
|---|---|
| `apps/mobile/src/utils/sukikira.js` | API モジュール（`getMoreComments` が暫定実装） |
| `apps/mobile/src/scenes/details/Details.js` | 詳細画面（`loadMore` で呼び出し） |
| `apps/mobile/src/components/CommentItem/CommentItem.js` | コメント表示（グレーアウト処理） |
| `apps/mobile/src/scenes/debug/WebViewTest.js` | **WebView 検証テスト画面**（設定→バージョン5回タップ） |
| `scripts/investigate_upvote_api.py` | API エンドポイント調査スクリプト |
| `scripts/out/people-result.js` | people-result.js 全文（18,017文字） |
| `scripts/out/investigate_upvote_api.txt` | API 調査結果 |
| `scripts/out/result_page.html` | result ページ HTML（参考用） |
| `scripts/analyze_pagination.py` | 初期調査スクリプト |
