// 行为参数集中。调实验只动这一个文件。
//
// 编辑后必须重启 dev server（vite 才能正确热替换 const）。
//
// 注：CSS 动画时长（如 muse-pet 闪烁）写在 fairy.css 里，独立于此。
// 后端 .env 控制限流和 AI 模型选择，独立于此。

export const CONFIG = {
  ui: {
    panelWidth: 352,                  // 宠物面板宽度（px）
    cardsPerBatch: 18,                // 每次"换一批"展示多少张词卡
    successAnimationMs: 1500,         // 生成成功后 pet 动画时长
    inputFocusDelayMs: 220,           // 打开面板后多少毫秒自动聚焦输入框
  },
  generation: {
    minTagsToGenerate: 2,             // 至少选几个词才能"✦ 生成"
    maxSelectedTags: 20,              // 已选词条最多锁多少
  },
  aiCache: {
    targetSize: 12,                   // 蓄水池目标容量
    perRefresh: 6,                    // 每次"换一批"消费多少绿卡
    fetchOverhead: 2,                 // 每次拉一批时额外多拉几张冗余
    maxFetchPerCall: 12,              // 单次 dynamic-cloud 上限
    refreshDebounceMs: 250,           // selectedTags 变化后多少毫秒防抖再发请求
  },
  chapters: {
    min: 1,                           // 章节数下限
    max: 20,                          // 章节数上限（前后端 schema 也对齐）
  },
  excludeWindow: 90,                  // 词云黑名单滑动窗口大小（5 批 × 18 卡）
  swapCards: {
    perSlot: 3,                       // 每个槽位的词卡数
    slots: 3,                         // 一次生成几个槽位（不变）
    refreshDebounceMs: 200,           // 🔄 换一批的连点防抖
    excludeWindow: 60,                // 调味词卡的滑动窗口（独立于撒网）
  },
  hoverPreview: {
    enterDelayMs: 80,                 // hover 词卡多少毫秒后显示预览
    leaveDelayMs: 100,                // 离开词卡多少毫秒后隐藏预览
    maxLen: 60,                       // 防御性截断（与后端 SwapCard.preview 上限一致）
  },
} as const;

export type Config = typeof CONFIG;
