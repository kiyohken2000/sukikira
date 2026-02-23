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
- [x] App Store申請（審査中）
- [x] Google Play申請（審査中）

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
