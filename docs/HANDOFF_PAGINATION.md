# コメントページネーション調査 引継ぎ

## 現状

Cloudflare が `?nxc=` パラメータ付きリクエストをブロックし、2ページ目以降のコメントが取得できなくなった。
暫定対応として個別コメントAPI (`/p/{pid}/c/{cid}/t/{sk_token}`) で1件ずつ取得しているが、
**upvote/downvote 数と投票トークンが欠落**するため完全な解決ではない。

## 判明済みの事実

### Cloudflare の挙動（実測）

| リクエスト条件 | `?nxc=` の結果 |
|---|---|
| UA なし（現在のアプリ方式） | `?cm` にリダイレクト（1ページ目に戻る） |
| モバイル UA あり | リダイレクトなし、**空ボディ**（Cloudflare JS チャレンジ） |
| デスクトップ UA あり | リダイレクトなし、**コンテンツ返却だが1ページ目と同じコメント** |
| ブラウザ（cf_clearance cookie あり） | **正常動作** — 2ページ目以降のコメントが取得できる |
| axios (XMLHttpRequest) + デスクトップ UA | `?cm` にリダイレクト |
| react-native-webview | `?cm` にリダイレクト |
| POST で nxc をボディに入れる | サーバーが無視（1ページ目が返る） |

### ブラウザでの正常な動作

ブラウザでは以下のように遷移する:
```
/?cm           → 最新コメント（42312〜42289）
/?nxc=42278    → 次ページ（42278〜42257）
/?nxc=42249    → その次（42249〜42228）
/?nxc=42227    → その次（42227〜42206）
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
  "type": "1",        // "1"=好き派, "0"=嫌い派
  "name_hash": "匿名",
  "url": "https://suki-kira.com/people/result/2893?c=42277"
}
```
**含まれないもの**: upvoteCount, downvoteCount, token（good/bad 投票用）

### サイトの JavaScript

- `common.js`: サイト共通、ページネーション関連なし
- `people-result.js`: 結果ページ用、コメント good/bad の AJAX 処理あり
  - good/bad は `/p/{pid}/c/{cid}/t/{sk_token}` に POST で `sk=like|dislike` を送信
  - ページネーション用の AJAX ロジックは**なし**（全てサーバーサイドレンダリング）

## 未探索の方向性

### 1. cf_clearance cookie の取得（最有力）

ブラウザが `?nxc=` で正常動作する理由は `cf_clearance` cookie。
この cookie は Cloudflare の JS チャレンジを解くと発行される。

**調査案:**
- アプリ起動時に WebView で result ページを1回読み込み、`cf_clearance` cookie を取得
- その cookie を `fetch()` の Cookie ヘッダーに付与して `?nxc=` リクエスト
- `react-native-webview` の `onNavigationStateChange` や `injectedJavaScript` で
  `document.cookie` を読み取れるか検証
- CookieManager (`@react-native-cookies/cookies`) で WebView cookie を fetch に渡す

**Python で検証可能:**
```python
# Selenium/Playwright で cf_clearance を取得し、requests で ?nxc= にアクセスできるか
```

### 2. デスクトップ UA で同じコメントが返る問題の深掘り

デスクトップ UA では空ボディにならずコンテンツが返ったが、**1ページ目と同じコメント**だった。
- `?nxc=` パラメータが無視されたのか、リダイレクトが起きたのか
- `responseUrl` を確認していたか要再確認
- Cloudflare が UA ありでも `?nxc=` を書き換えている可能性

**Python で検証可能:**
```python
# requests + デスクトップ UA で ?nxc= にアクセスし、
# レスポンスヘッダー・リダイレクト履歴・コメントIDを詳細確認
```

### 3. 他の API エンドポイント探索

サイトの HTML/JS にまだ発見していない API がある可能性:
- コメント一覧を JSON で返すエンドポイント
- upvote/downvote 数を含むエンドポイント
- ページネーション用のエンドポイント

**調査案:**
- result ページの HTML 全体を保存し、すべての URL パターンを抽出
- `people-result.js` の完全なソースを取得して全エンドポイントを洗い出す
- Network タブで実際にブラウザがどんなリクエストを送っているか記録
  （ユーザーにブラウザ DevTools のスクリーンショットを依頼）

### 4. upvote/downvote 数だけ別途取得

個別コメントAPI でコメント本文は取得できている。
upvote/downvote 数だけ別のリクエストで取れないか。

**調査案:**
- `/p/{pid}/c/{cid}/t/{sk_token}` に異なるパラメータを付けると追加情報が返るか
- good/bad ボタンの POST レスポンスに現在の投票数が含まれるか
  （`sk=count` のような未知のパラメータ）

### 5. Cloudflare Workers / プロキシ

最終手段として、Cloudflare Workers でプロキシを立てる:
- Workers がブラウザとして `?nxc=` にアクセスし、結果を返す
- ただしサイトに負荷をかけるため倫理的に要検討

## 推奨する次の調査ステップ

1. **Python スクリプトで cf_clearance 取得検証** — Selenium/Playwright で
   cf_clearance cookie を取得し、それを使って requests で `?nxc=` にアクセス可能か確認
2. **result ページの完全 HTML 保存** — `scripts/out/` に保存して
   未発見の API エンドポイントやパターンを grep
3. **people-result.js の完全取得** — minified でも全体を保存して
   `upvote`, `downvote`, `count`, `vote` 等のキーワードで検索
4. **good/bad POST のレスポンス詳細調査** — 投票数が含まれていないか

## 関連ファイル

| ファイル | 説明 |
|---|---|
| `apps/mobile/src/utils/sukikira.js` | API モジュール（`getMoreComments` が暫定実装） |
| `apps/mobile/src/scenes/details/Details.js` | 詳細画面（`loadMore` で呼び出し） |
| `apps/mobile/src/components/CommentItem/CommentItem.js` | コメント表示（グレーアウト処理） |
| `scripts/analyze_pagination.py` | 前回の調査スクリプト |
| `scripts/out/analyze_pagination.txt` | 前回の調査結果 |
