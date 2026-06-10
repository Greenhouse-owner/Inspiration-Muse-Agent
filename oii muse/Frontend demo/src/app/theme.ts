// 设计 token 集中。改主题色只动这一个文件。
//
// 命名约定：
//   语义色：primary / text / sub / bg / card / border ... (跟 App.tsx 老命名对齐)
//   组件色：tag* / chip* / tab* / pet* （Fairy 内部的小色卡）
//
// Fairy.tsx 的 `C` 对象保留为本地别名（少量字段名不同，迁移成本低于一次性全改）。

export const theme = {
  // 基础语义色
  bg:      '#0D0D0D',
  card:    '#1A1A1A',
  border:  '#2A2A2A',
  primary: '#FF2D78',
  text:    '#FFFFFF',
  sub:     '#999999',

  // Fairy 词卡 / 标签
  tagBg:   '#2A2A2A',
  tagTxt:  '#CCCCCC',

  // Fairy 折叠 tab + 卡片连体（不可改成 rgba，必须不透明覆盖 1px 描边）
  cardFill:   '#281B20',
  cardBorder: '#FF2D78',
  tabIdleBd:  '#3A3A3A',
  tabIdleTxt: '#888888',

  // Fairy 已选词条 / chip
  chipBg:  'rgba(255,45,120,.18)',
  chipBd:  'rgba(255,45,120,.32)',
  chipTxt: '#FFCCDC',
} as const;

export type Theme = typeof theme;
