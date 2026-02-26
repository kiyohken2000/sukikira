const darkColors = {
  // ベース
  background: '#0a0a0a',
  card: '#1a1a1a',
  border: '#2a2a2a',

  // テキスト
  text: '#e5e5e5',
  textSecondary: '#888888',
  textMuted: '#555555',

  // アクセント（好き派: 暖色 / 嫌い派: 寒色）
  like: '#f97316',      // オレンジ
  dislike: '#3b82f6',   // ブルー

  // UI
  primary: '#f97316',
  white: '#ffffff',
  black: '#000000',

  // タブ・ナビゲーション
  tabActive: '#f97316',
  tabInactive: '#555555',
  tabBar: '#111111',

  // ボタン
  buttonDisabled: '#333333',

  // その他
  overlay: 'rgba(0,0,0,0.6)',
  separator: '#2a2a2a',
}

const lightColors = {
  // ベース
  background: '#ffffff',
  card: '#f5f5f5',
  border: '#e0e0e0',

  // テキスト
  text: '#1a1a1a',
  textSecondary: '#666666',
  textMuted: '#999999',

  // アクセント（好き派: 暖色 / 嫌い派: 寒色）
  like: '#f97316',      // オレンジ
  dislike: '#3b82f6',   // ブルー

  // UI
  primary: '#f97316',
  white: '#ffffff',
  black: '#000000',

  // タブ・ナビゲーション
  tabActive: '#f97316',
  tabInactive: '#999999',
  tabBar: '#ffffff',

  // ボタン
  buttonDisabled: '#cccccc',

  // その他
  overlay: 'rgba(0,0,0,0.4)',
  separator: '#e0e0e0',
}

// 後方互換（ボイラープレートが参照する存在しないキーも含む）
const colors = darkColors

export { darkColors, lightColors, colors }
