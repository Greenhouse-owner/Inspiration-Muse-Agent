// 用户能看到的所有中文文案集中在这里。
// 改文案只动这一个文件。
//
// 命名约定：
//   T.fairy.*    宠物面板（核心交互）
//   T.errors.*   错误/兜底提示
//   T.password.* 口令门
//   T.landing.*  产品介绍页（hero / sections / footer）
//   T.tags.*     词卡相关（路径标签、漏斗阶段、阶段目标、缺口名）
//
// 函数形式（如 hintNeed(n)）用于带参数的模板。
// 不带逻辑、不带组件，只有字符串和返回字符串的函数。

import { theme } from '../theme';

export const T = {
  // ─── 宠物面板 ─────────────────────────────────────────────────
  fairy: {
    statusThinking: '正在生成…',
    hintNeed: (n: number) => `还需选 ${n} 个词`,
    hintReady: '词够了，可以生成 ✦',

    btnGenerate: '✦ 生成',
    btnAddCustom: '+ 加入',
    btnPlus: '+',
    btnEscape: '跳出去',
    btnRefresh: '换一批',
    btnSummon: '召唤精灵',
    titleEscape: '临时提高自由词比例，打破当前套路',
    titleSummon: '让 AI 拍一屏全新词卡（约 1-3 秒）',

    // 选题期欢迎引导
    welcomeGreeting: '欢迎来到 oii muse',
    welcomeHeadline: '点击一个方向，开始你的灵感拼图……',

    inputPlaceholderThinking: '正在生成…',
    inputPlaceholderRefineWithChapters: '输入修改需求，或换个数字重生章节…',
    inputPlaceholderStoryNoChapters: '输入数字 1-20 拆章节，或修改需求…',
    inputPlaceholderRefine: '输入修改需求…',
    inputPlaceholderPickWord: '输入自定义词汇，回车加入…',

    tagTitleAi: 'AI 根据已选词生成',
    tagTitleLocal: '本地词库',

    copy: 'copy',
    copyDone: 'copied ✓',
  },

  // ─── 调味词卡 v1.2 ───────────────────────────────────────────
  swap: {
    refresh: '换一批',
    refreshing: '调味中…',
    notAvailable: '（v1 暂只支持故事路径的调味，请用文字告诉 Muse 想改哪里）',
    refreshFailed: '（换一批失败了，Muse网络不太稳，等几秒再试）',
  },

  // ─── 章节卡 ───────────────────────────────────────────────────
  chapters: {
    title: (n: number) => `📖 章节大纲（${n}）`,
    insertAtTop: '+ 在最前插入新章节',
    insertAfter: (n: number) => `+ 在第 ${n} 章后插入`,
    chapterHeading: (n: number, title: string) => `第 ${n} 章 · ${title}`,
    btnDelete: '删除',
    ariaDelete: (n: number) => `删除第 ${n} 章`,
    afterStoryHint: '可继续输入修改需求，或想分章节？直接输入分1-10章节（例如 "分3章"）',
  },

  // ─── 错误 / 兜底 ──────────────────────────────────────────────
  errors: {
    onlyOnStoryPath: '（Muse拆章节需要先有故事——切到「故事梗概」路径，生成一段再来）',
    chapterGenFailed: '（章节生成失败了，Muse网络可能波动，等几秒再试一次）',
    chapterInsertFailed: '（插入章节没成功，Muse服务暂时忙不过来，稍后再点）',
    chapterMaxReached: '（Muse已经 20 章了，先删掉不需要的章节再插入新的）',
    refineNoChange: '（Muse没听懂要改哪里，试试说得更具体：比如「把结局改成开放式」）',
    refineFailedSmart: '（修改请求没送出去，Muse网络不太稳，过一会儿再试）',
    refineFailedLegacy: '（修改失败了，可能是Muse服务暂时过载，等半分钟再发一次）',
    generateOffline: '（AI 暂时连不上，先用本地Muse模板垫一版，联网后可以重新生成）',
    invalidChapterCount: (min: number, max: number) => `章节数请填 ${min}-${max}`,
    intentInvalidWrap: (reason: string) => `（${reason}）`,
    aiOfflineHint: 'AI 暂时离线，词卡为本地生成',
  },

  // ─── 路径 / 阶段 / 缺口 ────────────────────────────────────────
  tags: {
    paths: {
      story:     { label: '故事梗概',   desc: '200-300 字故事梗概' },
      character: { label: '角色设定',   desc: '完整角色设定卡' },
      worldview: { label: '世界观规则', desc: '世界观规则说明' },
    },
    stages: {
      spread: '撒网期',
      stitch: '拼接期',
      narrow: '收束期',
    },
    gaps: {
      story:     ['主角', '场景', '引发事件', '目标', '阻碍', '冲突', '反转', '结局基调'],
      character: ['身份', '性格', '创伤', '核心欲望', '最大恐惧', '隐藏秘密', '关系冲突', '人物弧光'],
      worldview: ['时代', '核心法则', '规则代价', '禁忌', '组织势力', '社会影响', '世界真相'],
    },
    stageGoals: {
      story: {
        spread: '找到故事的基本感觉——选人物、场景和类型词',
        stitch: '把已选词连接成故事链——补起因、阻碍、线索',
        narrow: '形成可生成梗概的核心结构——找真相、反转和结局钩子',
      },
      character: {
        spread: '打开人物可能性——选身份、职业和性格词',
        stitch: '让角色产生内部矛盾——补创伤、欲望、秘密',
        narrow: '让角色成为可写的人——确定核心动机和人物弧光',
      },
      worldview: {
        spread: '找到世界的核心想象力——选时代、制度和异常现象',
        stitch: '让世界规则可运行——补规则代价、禁忌和势力',
        narrow: '明确最重要的法则与冲突源——确认世界真相',
      },
    },
    moodWords: ['悬疑', '治愈', '荒诞', '惊悚', '阴郁', '压抑', '癫狂', '宁静', '悲壮', '温柔'],
    toneUndefined: '未定型',
    seedStory:     (texts: string[]) => texts.length ? `已有元素：${texts.slice(0, 4).join('、')}，故事轮廓正在成形。` : '故事还是一张白纸，先撒几个感兴趣的词。',
    seedCharacter: (texts: string[]) => texts.length ? `一个${texts.slice(0, 3).join('、')}的人物正在浮现。` : '角色还没有轮廓，从身份或性格词开始。',
    seedWorldview: (texts: string[]) => texts.length ? `世界核心：${texts.slice(0, 3).join('、')}，规则开始运转。` : '世界观还是空白，先找一个核心想象力。',
    reasonGap:    (gaps: string[]) => `当前还缺：${gaps.slice(0, 2).join('、')}，建议继续选词补充。`,
    reasonReady:  '词汇已较完整，可以生成了。',
  },

  // ─── 角色卡 / 世界观卡 字段名 ─────────────────────────────────
  cards: {
    character: {
      title: '👤 角色设定卡',
      rows: [
        ['暂称', 'name'], ['身份', 'identity'], ['性格', 'personality'],
        ['创伤', 'wound'], ['欲望', 'desire'], ['恐惧', 'fear'],
        ['秘密', 'secret'], ['弧光', 'arc'],
      ] as const,
    },
    worldview: {
      title: '🌍 世界观规则',
      rows: [
        ['名称', 'title'], ['核心规则', 'coreRule'], ['使用代价', 'cost'],
        ['禁忌', 'taboo'], ['社会影响', 'socialImpact'],
      ] as const,
      conflictHooksLabel: '冲突钩子',
    },
  },

  // ─── 口令门 ───────────────────────────────────────────────────
  password: {
    brand: 'oiioii Muse · 内测体验',
    tip: '这是一个 demo 链接，仅供内部体验。请输入访问口令开始使用。',
    placeholder: '访问口令',
    submit: '进入 oiioii Muse',
    wrong: '口令不对，再试一次。',
  },

  // ─── 产品介绍页 ───────────────────────────────────────────────
  landing: {
    brand: 'oiioii Muse',
    brandSub: '不需要写任何东西，只需要点几个词',
    badgeBeta: 'MVP Beta',
    badgeProductTag: '动态灵感拼图生成器',

    heroTitle: '点词拼接灵感',
    heroTitleHl: '世界逐步成形',
    heroDesc: 'oiioii Muse 是一个动态灵感拼图生成器。选择创作目标（故事 / 角色 / 世界观），从词卡中持续选择——Muse 每次刷新都会读取已选词、分析当前缺口、生成下一批动态词卡，让故事、角色或世界观逐步成形。',
    heroChips: [
      { icon: '📖', text: '3 条创作路径' },
      { icon: '🔄', text: '动态词卡闭环' },
      { icon: '🌪', text: '跳出去模式' },
      { icon: '✦', text: '3 种结构化输出' },
    ],

    sectionFeatures: '产品功能',
    sectionFunnel:   '三阶段漏斗',
    sectionFlow:     '使用流程',
    sectionTech:     '技术架构',
    sectionStack:    '技术选型',

    featureCards: [
      { icon: '📖', title: '三条创作路径',  desc: '故事梗概 / 角色设定 / 世界观规则，点击切换，词卡围绕当前创作目标即时重排。' },
      { icon: '🔄', title: '动态生词闭环',  desc: '每次刷新，AI 先读取已选词、分析创作缺口，再生成下一批被"染色"的词卡。' },
      { icon: '🌪', title: '跳出去模式',    desc: '词卡被锁死时，点「跳出去」临时提高自由词比例，打破套路，避免过早收束。' },
      { icon: '✦', title: '三种结构化输出', desc: '按当前路径生成：故事梗概文本 / 角色设定卡 / 世界观规则说明，结果可继续修改。' },
    ],

    funnelStages: [
      {
        icon: '◈', label: '撒网期', color: theme.primary,
        desc: '短词、意象词、开放词为主，快速找到故事感觉，不替用户定型。',
        words: ['废墟', '双胞胎', '末世', '孤僻'],
      },
      {
        icon: '◎', label: '拼接期', color: '#FF9500',
        desc: '桥梁词、线索词、关系词为主，把已选词连接成故事链。',
        words: ['醒来少一段记忆', '另一人格保护她', '每次复活失去记忆'],
      },
      {
        icon: '◉', label: '收束期', color: '#4CAF50',
        desc: '剧情钩子、核心秘密、最终选择为主，帮助故事结构成形。',
        words: ['妹妹其实是人格', '记忆是世界的货币', '最后选择说出真相'],
      },
    ],

    archSteps: [
      { step: '01', label: '选路径',     desc: '选择本次创作目标：故事 / 角色 / 世界观' },
      { step: '02', label: '选词锁定',   desc: '在词云点选，已选词跨路径常驻锁定栏' },
      { step: '03', label: '动态刷新',   desc: 'AI 读取已选词分析缺口，生成下一批词卡' },
      { step: '04', label: '生成输出',   desc: '按当前路径生成结构化结果，可继续修改' },
    ],

    techCards: [
      { icon: '▣', title: '漏斗系统', tag: 'TypeScript',     desc: '每条路径独立维护撒网/拼接/收束三阶段，按已选词数量自动判断，控制发散与收紧比例。' },
      { icon: '▷', title: '反向染色', tag: 'FastAPI + AI',   desc: '已选词跨路径常驻锁定栏，切换路径时反向影响新词云——词卡会"长成"适合当前故事种子的形态。' },
      { icon: '⬡', title: '缺口分析', tag: 'Prompt 工程',    desc: 'AI 每次刷新前临时归纳创作状态，分析当前缺口（冲突/动机/规则/代价等），指导下一批词卡方向。' },
      { icon: '◫', title: '三种输出', tag: 'React',          desc: '故事梗概 → 200-300 字文本；角色设定 → 结构化设定卡；世界观 → 规则说明 + 冲突钩子。' },
    ],

    stackRows: [
      ['前端',    'React 18 + TypeScript + Vite',     '组件化清晰，HMR 快，部署简单'],
      ['样式',    'Tailwind CSS + CSS Animation',     '快速暗色主题，零图片动效'],
      ['后端',    'FastAPI + Python 3.11',            '按创作路径路由到独立词库与 prompt 链路'],
      ['AI 分析', 'Prompt 工程 + Pydantic',           '归纳创作状态、分析缺口、生成结构化词卡'],
      ['存储',    'localStorage（MVP）',              '保存会话、路径历史、锁定词'],
      ['部署',    'Vercel + Railway',                 '免费额度，自动 CI/CD'],
    ],

    footerSpan: 'oiioii Muse — MVP 阶段',
    footerHint: '点击右下角 ●● 开始体验 ↘',
  },
} as const;

export type Translations = typeof T;
