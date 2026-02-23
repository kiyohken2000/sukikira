# ストア申請メタデータ

コピペ用。提出前に最新バージョン番号・スクリーンショットを確認すること。

---

## App Store（Apple）

### アプリ名
```
スキキラ
```
※ 30字以内。現在 4字。

### サブタイトル
```
for 好き嫌い.com
```
※ 30字以内。現在 15字。

### プロモーションテキスト（検索結果上部に表示・170字以内）
```
好き嫌い.com をもっと手軽に楽しめる非公式アプリ。スワイプ投票・ブックマーク・閲覧履歴など、専用アプリならではの使いやすさを提供します。アップデートのお知らせはここに反映されます。
```
※ いつでも審査なしで変更可能。キャンペーン・アップデート告知に使える。

### 説明文（4000字以内）
```
スキキラは、好き嫌い.com を快適に楽しむための非公式ブラウザアプリです。

【主な機能】

■ ランキング閲覧
好感度・不人気・トレンドの3タブで最新ランキングを確認。無限スクロールで次々と閲覧できます。

■ スワイプ投票
カードを右にスワイプで「好き」、左で「嫌い」。Tinderスタイルでテンポよく投票できます。未投票の人物だけが表示されます。

■ 人物詳細・コメント閲覧
プロフィール・複数画像・好感度グラフ・コメントを1画面で確認。好き派・嫌い派のコメントをフィルタ表示し、キーワード検索も可能です。

■ コメント投稿・返信
好き派・嫌い派を選んでコメントを投稿。コメントへの返信にも対応しています。

■ コメント good/bad 投票
各コメントへの評価が可能。投票状態はアプリ再起動後も保持されます。

■ ブックマーク管理
「俳優」「アイドル」などフォルダを自由に作成。気になる人物をカテゴリ別に整理できます。

■ 履歴
投票・閲覧・コメント投稿の履歴を時系列で確認。以前見た人物の詳細へすぐに戻れます。

■ NGワード
非表示にしたいキーワードを設定。特定のコメントをフィルタリングできます。

【プライバシーについて】
収集したデータはすべて端末内にのみ保存され、外部サーバーへは送信されません。
広告 SDK・アナリティクス・クラッシュレポートツールは一切使用していません。

【免責事項】
本アプリは好き嫌い.com（suki-kira.com）の非公式アプリです。好き嫌い.com および運営者とは一切無関係です。
コンテンツ取得のために好き嫌い.com に直接アクセスします。投票・コメント投稿の際には好き嫌い.com のサーバーにデータが送信されます。
本アプリの利用によって生じたいかなる損害についても、開発者は責任を負いません。
```

### キーワード（100字以内・カンマ区切り・スペースなし）
```
好き嫌い,ランキング,投票,有名人,芸能人,アイドル,俳優,スワイプ,ブックマーク,好感度
```
現在 約45字。残り55字の余裕あり。

### カテゴリ
```
プライマリ: エンターテインメント
セカンダリ: ソーシャルネットワーキング
```

### 年齢レーティング
```
12+（ユーザー生成コンテンツ含む）
```
レーティング設定時の回答:
- 「ユーザー生成コンテンツ」→ あり（コメント投稿機能）
- 「成人向けコンテンツ」→ なし
- 「アルコール・タバコ」→ なし
- 「ギャンブル」→ なし

### URL 類
```
サポートURL:         https://sukikira.pages.dev
マーケティングURL:   https://sukikira.pages.dev
プライバシーポリシー: https://sukikira.pages.dev/privacy.html
```

### 著作権
```
© 2025 スキキラ
```

### レビュー用メモ（App Review Notes）
```
## Overview

Sukikira is an unofficial native client for suki-kira.com, a Japanese public website where users vote on and discuss public figures (celebrities, athletes, etc.). The app fetches publicly accessible content from suki-kira.com and presents it through a native mobile interface.

## No Account Required

No account or login is needed to use any feature of this app. To browse rankings, simply launch the app. To vote or comment, tap any person card to open the detail screen, then tap the like/dislike button.

## Features Beyond the Website (Guideline 4.2)

The app provides significant native functionality not available on the suki-kira.com website:

1. Swipe Voting — Tinder-style card swipe interface (right = like, left = dislike). Completely absent from the website.
2. Bookmark Management — Folder-based bookmark system to organize favorite people. Stored locally; not a website feature.
3. History Tracking — Separate tabs for vote history, browse history, and comment history. Website has no such feature.
4. NG Word Filter — Users can register keywords to hide matching comments. Website has no such feature.
5. Thread Search — Full-text search within comments on a person's detail page. Website has no such feature.
6. Own Comment Tracking — Tracks the user's posted comments with upvote/downvote change indicators.
7. Haptic Feedback — Tactile response on voting and comment reactions.

All of the above are implemented natively and do not exist on the website.

## Privacy & Data Handling

- All user data (bookmarks, history, NG words, vote records) is stored locally on the device using AsyncStorage.
- No data is sent to any server operated by us. There is no backend.
- No analytics, advertising SDKs, or crash reporting tools are used.
- When a user votes or posts a comment, the request goes directly to suki-kira.com — the same as using the website in a browser.
- Privacy policy: https://sukikira.pages.dev/privacy.html

## User-Generated Content Moderation (Guideline 1.2)

The app displays comments posted by users on suki-kira.com. The following moderation tools are available to every user:

- **Hide comment**: Tap the ⋮ (three-dot) button on any comment → select "非表示" (Hide). The comment is immediately hidden for that user for the remainder of the session.
- **Report comment**: Tap ⋮ → select "通報" (Report). This opens a browser link to suki-kira.com's official report page for that comment.
- **Report user**: Tap ⋮ → select "ユーザー通報" (Report User). This opens a browser link to suki-kira.com's official user report page.

All report actions are handled by suki-kira.com's own moderation system. The ⋮ button is visible on every comment in the detail screen.

Additionally, users can register NG words (Settings tab) to automatically hide any comments containing those keywords.

## Third-Party Content

This app is not affiliated with or endorsed by suki-kira.com or its operator. It accesses publicly available content only. The app name and subtitle ("for 好き嫌い.com") clearly indicate it is an unofficial client.

## Test Account

Not required. All features are accessible without registration.
```

---

## Google Play

### アプリ名（50字以内）
```
スキキラ
```

### ショートdescription（80字以内）
```
好き嫌い.com の非公式ブラウザ。ランキング・スワイプ投票・ブックマーク管理を快適に。
```
現在 約40字。

### 説明文（4000字以内）
```
スキキラは、好き嫌い.com を快適に楽しむための非公式ブラウザアプリです。

【主な機能】

■ ランキング閲覧
好感度・不人気・トレンドの3タブで最新ランキングを確認。無限スクロールで次々と閲覧できます。

■ スワイプ投票
カードを右にスワイプで「好き」、左で「嫌い」。Tinderスタイルでテンポよく投票できます。未投票の人物だけが表示されます。

■ 人物詳細・コメント閲覧
プロフィール・複数画像・好感度グラフ・コメントを1画面で確認。好き派・嫌い派のコメントをフィルタ表示し、キーワード検索も可能です。

■ コメント投稿・返信
好き派・嫌い派を選んでコメントを投稿。コメントへの返信にも対応しています。

■ コメント good/bad 投票
各コメントへの評価が可能。投票状態はアプリ再起動後も保持されます。

■ ブックマーク管理
「俳優」「アイドル」などフォルダを自由に作成。気になる人物をカテゴリ別に整理できます。

■ 履歴
投票・閲覧・コメント投稿の履歴を時系列で確認。以前見た人物の詳細へすぐに戻れます。

■ NGワード
非表示にしたいキーワードを設定。特定のコメントをフィルタリングできます。

【プライバシーについて】
収集したデータはすべて端末内にのみ保存され、外部サーバーへは送信されません。
広告 SDK・アナリティクス・クラッシュレポートツールは一切使用していません。

【免責事項】
本アプリは好き嫌い.com（suki-kira.com）の非公式アプリです。好き嫌い.com および運営者とは一切無関係です。
コンテンツ取得のために好き嫌い.com に直接アクセスします。投票・コメント投稿の際には好き嫌い.com のサーバーにデータが送信されます。
本アプリの利用によって生じたいかなる損害についても、開発者は責任を負いません。
```

### カテゴリ
```
エンターテインメント
```

### コンテンツレーティング
```
IARC レーティング設定で回答:
- 「ユーザー生成コンテンツ」→ あり
- 「コミュニティ機能」→ あり
→ 想定レーティング: Teen（12歳以上）
```

### タグ（最大5つ）
```
ランキング
投票
有名人
エンタメ
ソーシャル
```

### URL 類・連絡先
```
ウェブサイト:         https://sukikira.pages.dev
プライバシーポリシー: https://sukikira.pages.dev/privacy.html
メールアドレス:       retwpay@gmail.com
```

---

## スクリーンショット 撮影ガイド

提出時に必要な画面。以下の順番で並べると機能が伝わりやすい。

| # | 画面 | 内容 |
|---|------|------|
| 1 | ランキング（好感度タブ） | ランキング一覧の全体像 |
| 2 | スワイプ投票 | カードUIで「好き/嫌い」選択中 |
| 3 | 人物詳細 | 画像・グラフ・コメント |
| 4 | ブックマーク | フォルダ一覧 |
| 5 | 履歴 | 投票・閲覧履歴 |

### サイズ要件
- **App Store**: 6.9インチ (1320×2868 または 1290×2796) が必須。他サイズは自動縮小される。
- **Google Play**: 最低2枚。推奨 1080×1920px（縦）または 1920×1080px（横）。

---

## 提出前チェックリスト

- [ ] `apps/mobile/app.json` のバージョン番号・ビルド番号を更新
- [ ] `expo build` / `eas build` が通ること
- [ ] スクリーンショット 5枚準備（6.9インチサイズ）
- [ ] プライバシーポリシー URL が生きていること（https://sukikira.pages.dev/privacy.html）
- [ ] App Store Connect でバンドルID `com.retwpay.sukikira`（仮）を登録済み
- [ ] Google Play Console でアプリ作成済み
