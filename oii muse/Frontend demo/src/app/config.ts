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
} as const;

export type Config = typeof CONFIG;
