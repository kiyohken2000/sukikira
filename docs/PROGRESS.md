# 進捗管理

## ステータス凡例
- [ ] 未着手
- [~] 進行中
- [x] 完了

---

## フェーズ1: 環境構築

- [x] Yarn Workspacesでモノレポ構成を作る
- [x] `apps/mobile` にExpoプロジェクトを作成（ボイラープレートベース）
- [ ] `apps/web` にViteプロジェクトを作成
- [ ] TypeScript設定
- [ ] ESLint / Prettier設定

---

## フェーズ2: コアライブラリ（src/utils/sukikira.js）

好き嫌い.comへのリクエスト処理を全てここに集約する。

- [x] 共通ヘッダー定義
- [x] `getVotePageTokens(name)` - 投票フォームのトークン取得
- [x] `vote(name, type)` - 投票（好き/嫌い）
- [x] `getResult(name)` - 投票結果・好き嫌い割合取得
- [x] `getComments(name)` - コメント一覧取得（結果ページHTMLパース）
- [x] `postComment(name, body)` - コメント投稿
- [x] `getRanking(type)` - ランキング取得（好感度/不人気/トレンド）
- [x] `search(query)` - 人物検索
- [x] エラーハンドリング（ネットワークエラー・パース失敗）

---

## フェーズ3: モバイルアプリ画面

### ランキング画面（ホーム）
- [x] タブ切り替えUI（好感度/不人気/トレンド）
- [x] ランキングリスト表示
- [x] 各アイテム: 順位・人物名・サムネイル・好き嫌い割合バー
- [x] タップで人物詳細画面へ遷移
- [x] プルリフレッシュ

### 検索画面
- [x] テキスト入力
- [x] 検索結果一覧
- [x] タップで人物詳細画面へ遷移

### 人物詳細画面
- [x] 人物名・サムネイル表示
- [x] 好き嫌い割合表示（大きく・バー付き）
- [x] 好き！/ 嫌い！ボタン
- [x] 投票済み判定（AsyncStorageに保存）
- [x] コメント全件読み込み（無制限スクロール）
- [x] コメントフィルタ（全件/好き派/嫌い派）
- [x] NGワードフィルタ適用
- [ ] good/badボタン
- [x] コメント投稿ボタン

### コメント投稿画面
- [x] テキスト入力エリア
- [x] 文字数カウンター
- [x] 投稿ボタン
- [x] 投稿成功/失敗のフィードバック

---

## フェーズ4: ローカル設定（AsyncStorage）

- [x] NGワード管理（追加・削除）→ SettingsContext
- [x] 投票済み人物の記録 → SettingsContext
- [ ] 設定画面UI

---

## フェーズ4.5: アプリ機能拡充

- [x] 閲覧・投票・コメント履歴タブ追加
- [x] ブックマーク機能（フォルダ形式カテゴリ管理）
- [x] 投票済みバッジ（ランキング・検索画面）
- [x] 再投票可バッジ（ランキング・検索・ブックマーク・履歴画面）
- [x] 履歴画面に「履歴 / 再投票」サブタブ（通知予定・再投票待ち一覧）
- [x] スレ内検索機能（コメント一覧内キーワード検索）
- [x] 自分のコメント追跡（レス確認・good/bad 反応確認）
- [x] スワイプ投票モード
- [見送り] Supabase リモートパース設定

---

## フェーズ5: ランディングページ（Cloudflare Pages）

- [x] Viteプロジェクトセットアップ（`apps/web/`）
- [x] トップページデザイン・実装（ヒーロー・機能カード6枚）
- [x] `/privacy.html` プライバシーポリシーページ実装
- [x] Cloudflare Pagesへのデプロイ → https://sukikira.pages.dev
- [x] faviconをアプリアイコンから生成（sharp）

---

## フェーズ6: リリース準備

- [x] アプリアイコン作成（Adobe Firefly / `assets/images/logo-lg.png`）
- [ ] スプラッシュスクリーン作成
- [x] App Store向けスクリーンショット作成
- [x] App Store / Google Play 説明文作成（`docs/STORE_METADATA.md`）
- [x] EAS Buildでビルド
- [x] App Store申請・公開済み（https://apps.apple.com/jp/app/id6759544300）
- [x] Google Play申請・公開済み（https://play.google.com/store/apps/details?id=net.votepurchase.sukikira）

---

## フェーズ7: 収益化（審査通過後）

### 方針
- 広告なし・完全無料を基本とする（suki-kira.com の広告収益を奪わないため）
- 任意の寄付（Tip Jar）のみ実装

### Tip Jar IAP
- [ ] RevenueCat プロジェクト作成（既存アカウントに追加）
- [ ] App Store Connect / Google Play Console で消耗型商品を登録
  - ☕ コーヒー1杯おごる ¥120
  - 🍱 ランチをおごる    ¥370
  - 🎉 もっと応援する    ¥750
- [ ] `react-native-purchases`（RevenueCat SDK）導入・EAS Build 対応
- [ ] Settings 画面に「開発者を応援する」セクション追加

### 注意事項
- Buy Me a Coffee 等の外部決済リンクは日本向け App Store では禁止（2025年時点）
- IAP は審査が別途必要（バイナリ更新＋再申請）
- Apple 手数料: 売上 ¥100万未満なら 15%、以上なら 30%

---

## フェーズ8: UX改善（審査通過後）

### 再投票までの残り時間表示

`votedAt` はすでに SettingsContext に保存済みのため、計算のみで実装可能。

**表示場所①: Details 画面**（投票済みステータス付近・常時表示）

```
投票済み（好き派）· あと 18時間32分で再投票できます
```

**表示場所②: ランキング・検索の PersonCard**（残り2時間以内のときだけ表示）

```
┌─────────────────┐
│  [画像]         │
│  大谷翔平       │
│  [好き済]       │
│  あと1時間32分  │  ← 2時間以内のときのみ追加表示
└─────────────────┘
```

通常は「好き済」バッジのみ。再投票が近づいたときだけ残り時間を表示することで、常時表示による情報過多を避ける。

**実装方針:**
- [x] `getVotedAt(name)` を SettingsContext に追加（votedRawRef 経由）
- [x] Details.js: 投票ボタン下に `CountdownText` コンポーネント。毎分更新、0で「再投票できます」
- [x] PersonCard: `remainingMs` prop を追加。2時間未満で残り時間テキスト、0で「再投票可」バッジ（紫）を表示
- [x] Home.js / Search.js / BookmarkFolder.js: `getVotedAt` で remainingMs を算出して渡す（24h経過時は0）
- [x] History.js VoteRow / BookmarkFolder.js: 24h経過で「再投票可」バッジ表示
- [x] 時間表示は「あと X時間Y分」形式（1時間未満は「あとY分」）
- 追加ライブラリ不要・JSのみの変更なら EAS Update で配信可能

---

### 再投票可能ローカル通知

投票した人物ごとにオプトイン。デフォルトはオフ。

**UI:** Details 画面の投票済み表示の横にベルアイコン
- 未投票時は非表示
- オン: 🔔（アクティブ色）/ オフ: 🔕（グレー）
- 初回オン時に通知パーミッションを要求（起動時には要求しない）

**データ構造:**

| AsyncStorage キー | 内容 |
|---|---|
| `@sukikira:notifyVote` | 通知オンの人物マップ `{ [name]: true }` |
| `@sukikira:notifyIds` | スケジュール済み通知ID `{ [name]: string }` |

**フロー:**

| 操作 | 処理 |
|------|------|
| ベルをオン（投票済み） | `scheduleNotificationAsync(votedAt + 24h)` → ID 保存 |
| ベルをオフ | `cancelScheduledNotificationAsync(ID)` → ID 削除 |
| 再投票時・通知オン | 旧IDキャンセル → 新しくスケジュール |
| 24h経過・通知発火 | 「〇〇への再投票が可能になりました」 |

**実装タスク:**
- [x] `expo-notifications` 導入済み（package.json + app.json plugins 設定済み）
- [x] `src/utils/notification.js` 新規作成（`scheduleVoteNotification` / `cancelVoteNotification`）
- [x] SettingsContext に `notifyVote` / `notifyIds` 追加（`isNotifyEnabled` / `setNotifyEnabled` / `getNotifyId` / `setNotifyId`）
- [x] Details.js の `CountdownText` 内にベルアイコン追加（トグルでスケジュール/キャンセル）

---

## 修正済みバグ（セッション12）

| # | バグ内容 | 原因 | 修正 |
|---|---------|------|------|
| 1 | 「再投票可能」バッジがついていても詳細画面で好き/嫌いボタンが押せない | `voted` memo が `votedRaw` 変更時のみ再計算。24h経過してもmemoが更新されない | Details.js で `getVotedAt` から直接24h経過を判定 |
| 2 | 投票後にコメントの追加読み込みが動かない | `vote()` が `nextCursor` を返していなかった。`loadMore` の依存配列に `resultInfo` が不足 | `vote()` に `nextCursor` 返却を追加、`loadMore` の依存配列に `resultInfo` 追加 |
| 3 | 一覧画面の残り時間・最終閲覧がフォーカス時に更新されない | 再レンダーを強制する仕組みがなかった | Home/Search/BookmarkFolder/History に `useFocusEffect` + `setTick` で再計算 |

---

## 既知の課題・懸念事項

| 課題 | 優先度 | 対応方針 |
|------|--------|---------|
| 好き嫌い.comの仕様変更リスク | 中 | リクエスト処理をlib/sukikira.tsに集約して修正箇所を最小化 |
| コメント全件取得の速度 | 中 | ページネーションで少しずつ読み込む |
| App Store審査でのリジェクトリスク | 低 | 5ch専ブラが通っている前例あり |

---

## 決定事項ログ

| 日付 | 決定内容 |
|------|---------|
| 2026/02/22 | バックエンドなし・Expoから直接リクエストする構成に決定（5/5検証成功） |
| 2026/02/22 | Supabase・expo-notifications・Pages Functionsは使わないことに決定 |
| 2026/02/22 | Cloudflare Pagesはランディングページとプライバシーポリシーのみのホスティングに決定 |
| 2026/02/22 | 好き嫌い.comへのリクエスト処理はlib/sukikira.tsに全て集約することに決定 |
| 2026/02/23 | App Store・Google Play 両ストアに申請（審査中） |
| 2026/02/23 | サブタイトルを「好き嫌い.com 非公式ブラウザ」→「for 好き嫌い.com」に変更 |
| 2026/02/23 | SafeAreaView を react-native-safe-area-context に統一（Android ステータスバー被り修正） |
| 2026/02/23 | Cookie仕様を実測調査（analyze_vote_cookie.py）：人物ごと24時間・IPトラッキングあり・アプリ実装と一致 |
| 2026/02/23 | voted を人物ごと24時間でリセットする仕様に変更（SettingsContext.js） |
| 2026/02/23 | 未投票・期限切れ時はコメント投稿画面へのナビゲートをブロック（Details.js） |
| 2026/02/23 | result ページのトークンはコメント投稿フォーム用（再投票不可）と判明（analyze_result_tokens.py） |
| 2026/02/23 | コメント good/bad：重複投票・good→bad 変更はサーバーがIPで拒否（レスポンス5）と判明（analyze_comment_revote.py） |
| 2026/02/23 | xdate は1分でも古いと拒否されるが、ウェブ版も同じ設計（レスポンスボディ無視）のため修正不要と判断（analyze_xdate.py） |
| 2026/02/24 | 再投票カウントダウン + ローカル通知（人物ごとオプトイン）実装完了 |
| 2026/02/24 | App Store 審査リジェクト: Guideline 1.2（EULA）+ Guideline 1.5（Support URL）の2点指摘 |
| 2026/02/24 | App Store 公開完了 |
| 2026/02/24 | Google Play 公開完了 |
| 2026/02/24 | 括弧付き人物名バグ修正: getRanking の name 取得元を h2 テキスト→href デコードに変更（analyze_parentheses*.py で調査） |
| 2026/02/25 | コメントページネーション修正: Cloudflare が `?nxc=` をブロック → 個別コメントAPI (`/p/{pid}/c/{cid}/t/{sk_token}`) 方式に変更。追加コメントは good/bad グレーアウト |
| 2026/02/26 | Workers プロキシ検証: Workers からも Cloudflare チャレンジでブロック → 棄却 |
| 2026/02/26 | WebView プロキシ再検証: WebView 内 fetch で個別 API 成功だが、アプリ fetch でも動作中のため不要 |
| 2026/02/26 | URL エンコード WAF バイパス: 8パターンテスト。WAF 回避できてもサーバーが認識しない → 棄却 |
| 2026/02/26 | ?nxc= による upvote/downvote 取得は全アプローチ検証済みで技術的に不可能と確定 |
| 2026/02/26 | バグ修正3件: 再投票可能なのにボタン押せない / 投票後コメント追加読み込み不可 / 一覧の残り時間がフォーカス時に更新されない |
