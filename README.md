# スキキラ

好き嫌い.com（suki-kira.com）の非公式専用ブラウザアプリ。
5ch専ブラのような使い勝手で好き嫌い.comを快適に閲覧・投票・コメント投稿できるモバイルアプリ。

---

## プロジェクト構成

```
/
├── apps/
│   ├── mobile/          # Expo（React Native）- メインアプリ
│   └── web/             # Vite - ランディングページ
├── docs/
│   ├── SPEC.md          # 技術仕様書
│   └── PROGRESS.md      # 進捗管理
├── README.md            # このファイル
├── package.json         # Yarn Workspaces
└── yarn.lock
```

---

## 技術スタック

| 用途 | 技術 |
|------|------|
| モバイルアプリ | Expo（React Native） |
| ランディングページ | Vite + React |
| ホスティング | Cloudflare Pages |
| データソース | 好き嫌い.com（直接リクエスト） |

**バックエンドなし。** Expoから好き嫌い.comに直接リクエストする構成。

---

## セットアップ

```bash
# apps/mobile は以下のボイラープレートをベースにしている
# https://github.com/kiyohken2000/ReactNativeExpoBoilerplate

# 依存関係インストール
yarn install

# モバイルアプリ起動
cd apps/mobile
npx expo start

# ランディングページ起動
cd apps/web
yarn dev
```

---

## 検証済み事項

- Expoから好き嫌い.comへの直接リクエストが可能なことを確認（5/5テスト成功）
- 投票・コメント取得・コメント投稿のAPIエンドポイントを解析済み
- Cloudflareのボット対策をモバイルからのリクエストが通過することを確認

詳細は `docs/SPEC.md` を参照。