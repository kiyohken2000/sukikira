# セッション引継ぎドキュメント

最終更新: 2026-02-23 (セッション10)

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
        │     ├── RankingTab    → RankingStacks   → Home
        │     ├── SearchTab     → SearchStacks    → Search
        │     ├── HistoryTab    → HistoryStacks   → History
        │     ├── BookmarkTab   → BookmarkStacks  → Bookmark → BookmarkFolder
        │     └── SettingsTab   → SettingsStacks  → Settings
        ├── Details   (SlideFromRightIOS)
        ├── Post      (modal, ModalPresentationIOS)
        └── SwipeVote (SlideFromRightIOS)
```

- `HomeStacks.js` は **未使用ファイル**（Tabs.js に組み込まれていない）
- Home/Search からの `navigate('Details')` は RootStack の Details へ遷移
- Details から `navigate('Post')` で Post モーダルを開く

---

## 主要ファイル一覧

| ファイル | 役割 |
|---|---|
| `apps/mobile/src/utils/sukikira.js` | suki-kira.com への全リクエスト処理 |
| `apps/mobile/src/contexts/SettingsContext.js` | NGワード・投票済み・結果キャッシュ・コメント投票・履歴・ブックマーク管理 |
| `apps/mobile/src/routes/navigation/rootStack/RootStack.js` | ルートナビゲーター |
| `apps/mobile/src/routes/navigation/tabs/Tabs.js` | タブナビゲーター（RankingTab, SearchTab, HistoryTab, BookmarkTab, SettingsTab） |
| `apps/mobile/src/scenes/home/Home.js` | ランキング画面（無限スクロール・スワイプ投票ボタン） |
| `apps/mobile/src/scenes/search/Search.js` | 検索画面 |
| `apps/mobile/src/scenes/details/Details.js` | 人物詳細画面（スレ内検索・自コメバッジ・ブックマーク★ボタン等） |
| `apps/mobile/src/scenes/post/Post.js` | コメント投稿画面 |
| `apps/mobile/src/scenes/settings/Settings.js` | 設定画面（NGワード管理） |
| `apps/mobile/src/scenes/history/History.js` | 履歴画面（投票・閲覧・コメント3セクション） |
| `apps/mobile/src/scenes/bookmark/Bookmark.js` | ブックマーク画面（フォルダ一覧・作成・削除） |
| `apps/mobile/src/scenes/bookmark/BookmarkFolder.js` | フォルダ内人物一覧（タップでDetails・個別削除） |
| `apps/mobile/src/scenes/swipe/SwipeVote.js` | スワイプ投票画面（PanResponder + Animated） |
| `apps/mobile/src/routes/navigation/stacks/HistoryStacks.js` | 履歴タブ用スタックナビゲーター |
| `apps/mobile/src/routes/navigation/stacks/BookmarkStacks.js` | ブックマークタブ用スタックナビゲーター |
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

### Cookie・IPトラッキング（`scripts/analyze_vote_cookie.py` で実測済み）

#### Cookie の構造
- Cookie名: `sk_vote`、値: `1`（好き）/ `0`（嫌い）
- **path が人物ごとに設定される**（グローバルではない）:
  ```
  /people/vote/{name}      （URLエンコード）
  /people/vote/{id}/       （数値ID）
  /people/result/{name}
  /people/comment/{id}/
  ```
- **有効期限: 正確に24時間**（`Max-Age=86400`相当）
- 投票ページ GET 時に `sk_vote=deleted`（既存Cookie削除）が送られた後、投票POST成功で新Cookie発行
- `sk_tr` という2分間有効のCookieも発行される（CSRF対策トークン = `auth-r` の元と思われる）

#### IPトラッキング
- Cookieなし・同IP でも `/people/result/{name}` にアクセス可能（IPトラッキングで通過）
- IP通過時もサーバーが**新たな24時間Cookieを再発行**する
- Cookie + IP の二重管理

#### 24時間以内の再投票（`scripts/analyze_revote.py` / `analyze_result_tokens.py` で実測済み）
- Cookie有効中に `/people/vote/{name}` へアクセス → `/people/result/{name}` へリダイレクト
- result ページに `auth1`/`auth2`/`auth-r` フィールドが存在するように見えるが、これらは**コメント投稿フォーム** (`/people/comment/{id}/`) のトークン。再投票フォームではない
  - `auth-r` の値が `'n'`（リテラル文字列）など vote ページのトークンとは異なる
  - `analyze_revote.py` の `tokens2_ok=True` はコメントフォームのトークンを誤検出していた
- result ページのトークンを使って `/people/result/{name}` に POST しても **% 変化なし（サーバーが完全に無視）**
- Cookie の値・有効期限も更新されない
- → **24時間以内の上書き投票はサーバー側で完全ブロック**
- アプリの `vote()` は `isResultPage` 判定でリダイレクトを検知しスキップするため整合している

#### アプリへの影響
- React Native の fetch は OS レベルの Cookie を自動管理（NSURLSession / OkHttp）
- アプリの `voted` は人物ごとに24時間でリセット → **サーバー仕様と一致**
- IPトラッキングにより、24h後もCookie切れ前に同IPからアクセスするとサーバー側は通過させる。アプリが「再投票できます」と促すのは正しいUX（修正不要と判断）

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
- `token` は各コメントDivの `data-token` 属性（`cBanBtn` スパンの `data-token` と同一トークン）
- Origin ヘッダーは `BASE_URL` (`https://suki-kira.com`) を使うこと（`BASE` は未定義）

#### サーバーレスポンスの意味（`scripts/analyze_comment_revote.py` で実測済み）
- `0` = 投票受け付け（新規）
- `5` = 重複投票でブロック（同IPから同じコメントに再送/変更しようとした場合）
- `10` = xdate が無効（古い・空文字・未来日時）
- `11` = xdate がわずかにずれている（-1分程度）
- `good→bad` 変更も `5` で拒否される。一度 good を押すと bad には変更不可
- IPトラッキングによりサーバー側でも重複を管理（アプリの AsyncStorage 管理と二重）
- → アプリは `AsyncStorage` に投票済み状態を保存しておけばよい（`@sukikira:commentVoted`）

#### xdate の有効期限（`scripts/analyze_xdate.py` で実測済み）
- xdate はサーバーで厳密に検証される。**-1分でも失敗（レスポンス `11`）**
- ページを開いたまま放置してからコメント good/bad を押すとサイレント失敗する
- **ただしウェブ版（`people-result.js`）も同じ設計**（`success: defer.resolve` でレスポンスボディを無視）
- ウェブ版・アプリともに楽観的更新（先に UI を voted 状態にしてから AJAX）
- → **修正不要。ウェブ版と同等の仕様として受け入れる**

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
| `@sukikira:voted` | 投票済みマップ `{ [name]: { type: 'like'\|'dislike', votedAt: number } }` （人物ごと24h でリセット） |
| `@sukikira:voteHistory` | 投票履歴 `Array<{ name, imageUrl, voteType, time }>` |
| `@sukikira:browseHistory` | 閲覧履歴 `Array<{ name, imageUrl, time }>` |
| `@sukikira:commentHistory` | コメント履歴 `Array<{ name, body, time }>` |
| `@sukikira:resultCache` | 結果キャッシュ `{ [name]: { resultInfo, comments } }` |
| `@sukikira:bookmarkFolders` | ブックマークフォルダ `Array<{ id, name, items: { name, imageUrl }[] }>` |

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
| 括弧付き人物名（田中瞳 (アナウンサー) 等）がランキングから開けない | `getRanking` が h2 テキスト（括弧なし表示名）から name を取得していたが、サーバーは href パス（括弧付き正式名）を使用 | `sukikira.js` `getRanking` で name を href からデコードして取得するよう変更 |

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
- コメント good/bad ボタン（投票済み状態がセッション中持続）
- コメント投稿（投稿後に既存Details画面へ戻る・キャッシュ反映）
- 設定画面（NGワード追加・削除UI）
- ハプティクス（投票・コメント good/bad）
- 履歴タブ（投票・閲覧・コメント履歴、タップで Details へ）
- 投票済みバッジ / コメント済みバッジ（ランキング・検索の人物カード）
- ⋮メニュー「NGワード追加」（Modal+TextInput でキーワード登録）
- スレ内検索（フィルタバー横🔍→検索バー展開、ヒット件数表示）
- 自分のコメント追跡（「自分」バッジ・「返信」バッジ・いいね増加数）
- スワイプ投票モード（ランキング画面「スワイプ」ボタン→カードスワイプ）
- ブックマーク機能（フォルダ形式・Details★ボタン・フォルダ選択モーダル）

### 残タスク・今後の対応
- [x] フェーズ5: ランディングページ（Vite + Cloudflare Pages）実装済み → https://sukikira.pages.dev
- [x] フェーズ6: App Store・Google Play 両ストア申請済み（審査中）
- [ ] 審査結果対応（リジェクト時は STORE_METADATA.md の「リジェクト対応」文を参照）
- [ ] スプラッシュスクリーン作成（未対応）
- [見送り] Supabase リモートパース設定 → EAS Update（OTA）で代替可能なため保留

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

### セッション10で対応した事項

| 対応 | 内容 | 実装場所 |
|---|---|---|
| App Store / Google Play 申請 | 両ストアに審査提出。審査中 | — |
| サブタイトル変更 | 「好き嫌い.com 非公式ブラウザ」→「for 好き嫌い.com」 | `Settings.js`・`docs/STORE_METADATA.md` |
| Android ステータスバー被り修正 | 全画面の `SafeAreaView` を `react-native` → `react-native-safe-area-context` に変更 | `Home.js`・`Search.js`・`Settings.js`・`History.js`・`Bookmark.js`・`BookmarkFolder.js`・`SwipeVote.js`・`Post.js`・`Details.js` |
| ストア申請メタデータ整備 | App Store・Google Play 両ストア向けのコピペ用メタデータを作成 | `docs/STORE_METADATA.md`（新規） |

---

### セッション9で実装した機能（ブックマーク・UX改善）

| 機能 | 内容 | 実装場所 |
|---|---|---|
| ブックマーク機能 | フォルダ形式でブックマーク管理。Details ヘッダー★ボタン→フォルダ選択モーダル（追加/解除/新規フォルダ作成）。専用タブで一覧・詳細閲覧 | `Bookmark.js`・`BookmarkFolder.js`・`BookmarkStacks.js`（新規）+ `SettingsContext.js`・`Tabs.js`・`Details.js` |
| ボトムタブのスクロールトップ | アクティブなタブを再タップすると一番上にスクロール（`useScrollToTop`） | `Home.js`・`Search.js`・`History.js` |
| 検索クリアボタン | 検索後に TextInput 右端の ✕ をタップでキーワード・結果・状態をリセット | `Search.js` |
| スワイプ投票: パーセント非表示 | 投票前の判断を偏らせないよう VoteBar・ランクバッジを非表示に | `SwipeVote.js` |

---

### セッション8で実装した機能（UI機能強化）

| 機能 | 内容 | 実装場所 |
|---|---|---|
| 投票済みバッジ | PersonCard に `votedType` prop。「好き済」橙・「嫌い済」青 | `PersonCard.js` + `Home.js` + `Search.js` |
| コメント済みバッジ | PersonCard に `commented` prop。「コメ済」緑 | `PersonCard.js` + `Home.js` + `Search.js` |
| ⋮メニュー「NGワード追加」 | Modal+TextInput でキーワード入力 → `addNgWord()` | `CommentItem.js`（useSettings 直接参照） |
| スレ内検索 | フィルタバー横🔍→検索バー展開・ヒット件数表示 | `Details.js` |
| 検索バー キーボード消えバグ修正 | 検索バーを FlatList の ListHeaderComponent 外に移動 | `Details.js` |
| 自分のコメント追跡 | 「自分」バッジ（橙）・「返信」バッジ（紫）・いいね増加数 (+N) | `CommentItem.js` + `Details.js` |
| commentId 保存 | Post.js で result.comments から本文マッチしてID特定 | `Post.js` + `SettingsContext.js` |
| スワイプ投票モード | PanResponder+Animated カードスワイプ。ローカルキュー管理でバグ修正済み | `SwipeVote.js`（新規）+ `RootStack.js` + `Home.js` |

#### スワイプ投票の設計上の注意（バグ修正済み）
- `voted` state に依存した `unvotedItems` の useMemo は「投票→voted 更新→キュー再計算→インデックスズレ」を引き起こす
- **ローカルキュー** (`queue` state) でマウント時に一度だけフィルタし、以降は `queue.slice(1)` で進める
- `position.setValue({x:0,y:0})` は `requestAnimationFrame` 内で React 再描画後に実行（フラッシュ防止）
- `PanResponder` は ref 経由で最新の swipeOut/voting を参照し、一度だけ作成（`useMemo(()=>..., [])`）

---

### セッション7で実装した機能（履歴タブ）

| 機能 | 内容 | 実装場所 |
|---|---|---|
| 履歴タブ追加 | ボトムタブに「履歴」タブ（clock-o アイコン）を追加 | `Tabs.js` |
| HistoryStacks | 履歴タブ用スタックナビゲーター | `HistoryStacks.js` （新規） |
| History 画面 | 投票履歴・閲覧履歴・コメント履歴の3セクション SectionList。各行タップで Details へ遷移 | `History.js` （新規） |
| 閲覧履歴記録 | Details ロード成功時に `recordBrowse(name, imageUrl)` を呼ぶ。dedup 付き最大30件 | `Details.js` + `SettingsContext.js` |
| コメント履歴記録 | Post 投稿成功時に `recordComment(name, body)` を呼ぶ。最大30件 | `Post.js` + `SettingsContext.js` |
| 投票履歴記録 | `recordVote` を拡張し imageUrl も受け取り `voteHistory` に追記。dedup 付き最大50件 | `SettingsContext.js` |
| AsyncStorage キー | `@sukikira:voteHistory` / `@sukikira:browseHistory` / `@sukikira:commentHistory` 追加 | `SettingsContext.js` |

---

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

### ~~将来実装予定：NGワード追加・投票済みバッジ・スレ内検索・自分のコメント追跡・スワイプ投票~~ → セッション8で実装済み

---

### ~~将来実装予定：ブックマーク機能（フォルダ形式）~~ → セッション9で実装済み

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

### ~~次セッションで実装予定：閲覧・コメント履歴機能~~ → セッション7で実装済み

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
- コメント good/bad の投票済み状態は AsyncStorage に永続化（`@sukikira:commentVoted`）

---

## フェーズ5: ランディングページ（apps/web/）

### ファイル構成
| ファイル | 役割 |
|---|---|
| `apps/web/index.html` | ランディングページ本体 |
| `apps/web/privacy.html` | プライバシーポリシーページ |
| `apps/web/vite.config.js` | Vite MPA設定（index.html + privacy.html） |
| `apps/web/package.json` | vite devDependency |
| `apps/web/images/` | スクリーンショット画像（ss_*.jpg） |

### デプロイ（Cloudflare Pages）
```
ビルドコマンド: npm run build
出力ディレクトリ: dist
ルートディレクトリ: apps/web
```

### 連絡先メールアドレス
`retwpay@gmail.com`（プライバシーポリシーのお問い合わせ先）

### スクリーンショット使用箇所
| ファイル | 使用箇所 |
|---|---|
| ss_home_1.jpg | ヒーロー・ランキング機能カード |
| ss_swipe_mode_1.jpg | ヒーロー・スワイプ投票機能カード |
| ss_detail_1.jpg | ヒーロー・詳細/コメント機能カード |
| ss_detail_search_1.jpg | スレ内検索機能カード |
| ss_bookmark_1.jpg | ブックマーク機能カード |
| ss_history_1.jpg | 履歴機能カード |

---

## フェーズ6: リリース準備

### アプリアイコン（Adobe Firefly）

アプリの世界観: 好き嫌い投票アプリ。温色（橙・ピンク）＝好き、寒色（青・紫）＝嫌いの二面性。

#### 方向性A — ハート分割（推奨）
```
App icon, split heart shape, left half warm orange-coral filled,
right half cool blue cracked/broken, dark charcoal background (#1a1a2e),
flat design, minimalist, sharp edges, mobile app icon style,
no text, rounded square composition
```

#### 方向性B — サムズアップ／ダウン融合
```
App icon, thumbs up and thumbs down icons merged back-to-back,
gradient from warm orange to cool blue, dark background,
bold flat design, minimalist, centered composition,
professional mobile app icon, no text
```

#### 方向性C — 人物シルエット＋ハート
```
App icon, simple human silhouette centered,
surrounded by split aura (warm pink-orange on right, cool blue-purple on left),
small heart icon above, dark navy background,
flat modern design, minimalist, no text, mobile app icon
```

#### 調整用追加プロンプト
- より明るく: `vibrant colors, high contrast`
- よりシンプルに: `ultra minimal, single symbol only`
- 色を固定: `use #FF6B35 for like side, #4B9FE1 for dislike side`

#### アイコンサイズ要件
- iOS: 1024×1024px（App Store 提出用）
- Android: 512×512px（Google Play 提出用）
- `apps/mobile/assets/` に配置、`app.json` の `icon` フィールドで指定

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
| `analyze_vote_cookie.py` | Cookie構造・有効期限・IPトラッキング確認 | `out/analyze_vote_cookie.txt` |
| `analyze_revote.py` | 24h以内の再投票ブロック確認（vote→result リダイレクト） | `out/analyze_revote.txt` |
| `analyze_result_tokens.py` | result ページのトークン構造確認（コメントフォーム用と判明） | `out/analyze_result_tokens.txt` |
| `analyze_comment_revote.py` | コメント good/bad の重複投票・変更制限確認 | `out/analyze_comment_revote.txt` |
| `analyze_comment_vote.py` | コメントのいいねボタン HTML 構造確認 | `out/analyze_comment_vote.txt` |

実行: `python scripts/<スクリプト名>` （プロジェクトルートから）
Windows cp932 の絵文字エラーを避けるため、新スクリプトは stdout ではなくファイルのみに書き出す方式を使うこと。
