import { useState, useCallback, useRef, useEffect } from "react";
import "./fairy.css";
import { type CreationPath, PATH_META } from "../data/localTags";
import { metaForField } from "../data/recipeSlots";
import { parseIntent } from "../services/inputIntent";
import { T } from "../i18n/zh";
import { CONFIG } from "../config";
import { IconRefresh } from "./icons";

// ─── Types ────────────────────────────────────────────────────────────────────
// ChatMessage / MuseState 已搬到 features/fairy/types（C5）
import type { ChatMessage, MuseState } from "../features/fairy/types";

// ─── Design tokens ────────────────────────────────────────────────────────────
// 颜色集中在 src/app/theme.ts。下方 C 是本地短别名（C.p = theme.primary 等），
// 用于压缩 inline style 的可读性。新代码可直接用 theme.*，两种写法等价。

import { theme } from "../theme";

const C = {
  bg: theme.bg, card: theme.card, border: theme.border,
  p:  theme.primary, text: theme.text, sub: theme.sub,
  tagBg: theme.tagBg, tagTxt: theme.tagTxt,
  cardFill: theme.cardFill, cardBorder: theme.cardBorder,
  tabIdleBd: theme.tabIdleBd, tabIdleTxt: theme.tabIdleTxt,
  chipBg: theme.chipBg, chipBd: theme.chipBd, chipTxt: theme.chipTxt,
};

// ─── Subcomponents / helpers / hooks ──────────────────────────────────────────
// 实现都在 ../features/fairy/。Fairy.tsx 只保留 render shell + 几个 setter。

import { mid, tagFontSize, tagColors } from "../features/fairy/helpers";
import { TypingDots } from "../features/fairy/components/TypingDots";
import { CharacterCard } from "../features/fairy/components/CharacterCard";
import { WorldviewCard } from "../features/fairy/components/WorldviewCard";
import { StageHint } from "../features/fairy/components/StageHint";
import { ChapterListCard } from "../features/fairy/components/ChapterListCard";
import { TabbedHead } from "../features/fairy/components/TabbedHead";
import { CopyButton } from "../features/fairy/components/CopyButton";
import { SwapCloud } from "../features/fairy/components/SwapCloud";
import { WelcomeGuide } from "../features/fairy/components/WelcomeGuide";
import { type ChipTag } from "../features/fairy/components/ChipAwareInput";
import { useTagCloud } from "../features/fairy/hooks/useTagCloud";
import { useAiCachePrefetch } from "../features/fairy/hooks/useAiCachePrefetch";
import { useChapters } from "../features/fairy/hooks/useChapters";
import { useGeneration } from "../features/fairy/hooks/useGeneration";
import { useRecipe } from "../features/fairy/hooks/useRecipe";
import { usePetDrag } from "../features/fairy/hooks/usePetDrag";

// ─── Main Fairy component ─────────────────────────────────────────────────────

export function Fairy() {
  const [open, setOpen]           = useState(false);
  const [panelAnim, setPanelAnim] = useState<'enter'|'exit'|null>(null);
  const [museState, setMuseState] = useState<MuseState>('idle');

  const [currentPath, setCurrentPath] = useState<CreationPath>('story');
  // pathConfirmed=false：首次进入或折叠状态。视觉上 3 个 tab 全灰，词卡区折叠。
  // 内部 currentPath 仍是 'story' 默认值，避免下游 30+ 处引用变成 nullable。
  const [pathConfirmed, setPathConfirmed] = useState(false);
  // cloudCollapsed：用户再次点击当前选中的 tab → 折叠词卡区。
  // 切到新路径 → 自动展开。pathConfirmed=false 时也强制等同折叠。
  const [cloudCollapsed, setCloudCollapsed] = useState(true);

  // ── 词云 / 选词 / 滑动窗口（C3 抽出）─────────────────────────────
  const cloud = useTagCloud({ open, currentPath });
  const {
    selectedTags, batch, escape, analysis, stage,
    setAnalysis,
    latestBatchRef, latestExcludeRef, latestTagStateKeyRef,
    toggleTag, removeSelected, addSelectedFromInput, refreshBatch: refreshBatchInternal,
    summonFairy,
    resetCloudForPath, resetCloudAfterGenerate,
  } = cloud;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');

  // 共享 abort 控制器：refine / chapters 谁先动就 abort 对方
  const inflightRef = useRef<AbortController | null>(null);

  // 星星动画 state（被 spawnStars 写、被 render 读）
  const [flash, setFlash]   = useState(false);
  const [stars, setStars]   = useState<{ id: number; x: number; y: number }[]>([]);
  const starIdRef            = useRef(0);
  const msgEndRef            = useRef<HTMLDivElement>(null);
  const inputRef             = useRef<HTMLInputElement>(null);

  // ── Stars（hooks 需要注入，所以提前到 hook 实例化之前）────────────
  const spawnStars = useCallback((n = 6) => {
    const next = Array.from({ length: n }, () => ({
      id: ++starIdRef.current,
      x: (Math.random() - 0.5) * 60,
      y: -(18 + Math.random() * 38),
    }));
    setStars(s => [...s, ...next]);
    setTimeout(() => setStars(s => s.filter(st => !next.find(n => n.id === st.id))), 750);
  }, []);

  // ── 消息追加（给 hooks 注入）──────────────────────────────────────
  const appendMessage = useCallback((m: ChatMessage) => {
    setMessages(prev => [...prev, m]);
  }, []);
  const appendMessages = useCallback((ms: ChatMessage[]) => {
    setMessages(prev => [...prev, ...ms]);
  }, []);

  // ── AI 词卡蓄水池（C4）。hooks 也要 invalidateCache，所以提前到 chapters/generation hook 之前。
  const AI_PER_REFRESH = CONFIG.aiCache.perRefresh;
  const aiCache = useAiCachePrefetch({
    open, currentPath, stage, selectedTags,
    latestBatchRef, latestExcludeRef, latestTagStateKeyRef,
    onAnalysis: setAnalysis,
  });
  const { aiTagCache, consumeFromCache, removeFromCache, invalidateCache, isDegraded } = aiCache;

  // ── 章节状态（C5 抽出到 useChapters）──────────────────────────────
  // 因为 useChapters 需要 getCurrentResult，而 currentResult 在 useGeneration 里，
  // 但 useGeneration 又需要 getChapters/setChapters/resetChapters；
  // 解决：用 forward-declared ref，先实例化 useChapters 再实例化 useGeneration。
  const currentResultGetterRef = useRef<() => import('../types').CurrentResult | null>(() => null);

  const chaptersHook = useChapters({
    inflightRef,
    getCurrentResult: () => currentResultGetterRef.current(),
    appendMessage,
    setMuseState,
    spawnStars,
  });
  const {
    chapters, chapterBusy, chaptersDegraded,
    setChapters: setChaptersFromHook,
    generateChapters,
    handleDeleteChapter, handleInsertChapterAfter,
    resetChapters,
  } = chaptersHook;

  // ── 生成 / refine（C5 抽出到 useGeneration）───────────────────────
  const generationHook = useGeneration({
    inflightRef,
    currentPath,
    getSelectedTags: () => selectedTags,
    getChapters: () => chaptersHook.chaptersRef.current,
    setChapters: setChaptersFromHook,
    resetChapters,
    resetCloudAfterGenerate,
    invalidateAiCache: invalidateCache,
    appendMessage,
    appendMessages,
    setMuseState,
    spawnStars,
  });
  const { currentResult, setCurrentResult, generate, refine, refreshSwapsAction } = generationHook;
  // 把 currentResultRef 暴露给 useChapters 的 getCurrentResult
  currentResultGetterRef.current = () => generationHook.currentResultRef.current;

  // ── 调味词卡状态机（C6 抽出到 useRecipe）──────────────────────────
  // 只管 pendingTags / pendingText / lastPickedCard 这些 UI 状态。
  // refine-smart 真实调用走 useGeneration.refine；🔄 走 refreshSwapsAction。
  const recipeHook = useRecipe({ currentResult });
  const {
    recipe, swaps,
    pendingTags, pendingText,
    setPendingTags, setPendingText,
    lastPickedCard,
    togglePendingTag, clearPending,
  } = recipeHook;

  // 调味区是否就绪（后端返回了 recipe + swaps 才显示）
  const swapReady = !!(recipe && swaps);

  // 调味词卡的滑动窗口：累计展示过的 label，下次 swap / refresh 时通过
  // excludeSwapTexts 喂给 AI，让 AI 出新词避免重复。
  // 上限 CONFIG.swapCards.excludeWindow（默认 60），超出从最早的弹掉。
  const swapExcludeRef = useRef<string[]>([]);
  const [swapRefreshing, setSwapRefreshing] = useState(false);
  // 召唤精灵 ✨ 状态：撒网期一次性"全 AI 词云"操作
  const [summoning, setSummoning] = useState(false);

  // 每次 swaps 变更（生成 / refine / refresh），把新词追加到 exclude 窗口
  useEffect(() => {
    if (!swaps) return;
    const newLabels: string[] = [];
    for (const cards of Object.values(swaps.cards)) {
      for (const c of cards) newLabels.push(c.label);
    }
    const merged = [...swapExcludeRef.current];
    for (const l of newLabels) {
      if (!merged.includes(l)) merged.push(l);
    }
    const max = CONFIG.swapCards.excludeWindow;
    swapExcludeRef.current = merged.length > max ? merged.slice(merged.length - max) : merged;
  }, [swaps]);

  // Derived state
  const hasGeneratedResult = currentResult !== null;
  const isThinking  = museState === 'thinking';
  // 词卡区是否展开：必须确认了方向且没被折叠
  const cloudExpanded = pathConfirmed && !cloudCollapsed;
  const canGenerate = selectedTags.length >= CONFIG.generation.minTagsToGenerate && !isThinking && pathConfirmed;

  // ── Swap 真接口 ──────────────────────────────────────────────────────────
  // 故事路径：走 refine-smart（含 swapInstructions），LLM 一次返回新故事 + 新 recipe + 新 swaps
  // 角色 / 世界观：走老接口 refineResult（patch 协议）+ 自动 refresh-swaps 刷新词卡
  const handleSwapSend = useCallback(async (
    tagsToSend: ChipTag[], textToSend: string,
  ) => {
    if (!recipe) return;
    if (currentPath === 'story') {
      await refine(textToSend, {
        currentRecipe: recipe,
        swapInstructions: tagsToSend.map(t => ({ field: t.field, label: t.label })),
        excludeSwapTexts: [...swapExcludeRef.current],
      });
      return;
    }
    // 角色 / 世界观：把 swap 翻译成自然语言指令喂给 refineResult
    // 例如 [{identity:冒牌公主},{wound:童年阴影}] + 文字 "再黑暗一点"
    //   → "把身份改成「冒牌公主」；把创伤改成「童年阴影」；再黑暗一点；其它字段顺势保持连贯。"
    const swapPhrases = tagsToSend.map(t => {
      const slotLabel = metaForField(currentPath, t.field).label || t.field;
      return `把${slotLabel}改成「${t.label}」`;
    });
    const composed = [
      ...swapPhrases,
      textToSend.trim() ? textToSend.trim() : '',
      '其它字段顺势保持连贯，不要凭空抹掉原设定。',
    ].filter(Boolean).join('；');
    await refine(composed);
    // 替换完成后，词卡也要刷新（refineResult 不返回新 swaps，自己拉一次）。
    // 改成 await（去掉 setTimeout 时序耦合 hack）：refine 完成后 currentResult 已写新值，
    // 这时 refreshSwapsAction 内部读 currentResultRef 拿到的就是新结果。
    await refreshSwapsAction([...swapExcludeRef.current]);
  }, [recipe, currentPath, refine, refreshSwapsAction]);

  const handleSwapRefresh = useCallback(async () => {
    if (swapRefreshing) return;
    setSwapRefreshing(true);
    try {
      const next = await refreshSwapsAction([...swapExcludeRef.current]);
      if (!next) {
        // 降级：给个轻量提示，但不打扰
        console.warn('[muse] refreshSwaps degraded, keeping current swaps');
      }
    } finally {
      setSwapRefreshing(false);
    }
  }, [refreshSwapsAction, swapRefreshing]);

  // ── Restart：调味期 → 回到撒网期。故事卡留在聊天流里，不删 ─────────────
  const handleRestart = useCallback(() => {
    if (isThinking) return;
    setCurrentResult(null);
    resetChapters();
    inflightRef.current?.abort();
    clearPending();
    resetCloudForPath(currentPath);
    invalidateCache();
    swapExcludeRef.current = [];
    // 重选 = 回到首次未选方向的起点：清 pathConfirmed + 折叠词卡区，重新引导
    setPathConfirmed(false);
    setCloudCollapsed(true);
  }, [
    isThinking, setCurrentResult, resetChapters, clearPending,
    resetCloudForPath, currentPath, invalidateCache,
  ]);

  // 包一层 refreshBatch：消费蓄水池 + 调 hook 内部的 refresh
  // 蓄水池逻辑已封装在 consumeFromCache（C4）
  const refreshBatch = useCallback((escMode = false) => {
    // 不在 escape 模式且蓄水池有词时，从池子取 N 张注入 hook
    if (!escMode && !escape && aiTagCache.length > 0) {
      const aiTake = consumeFromCache(AI_PER_REFRESH);
      refreshBatchInternal({
        escMode,
        aiInjection: aiTake,
      });
      return;
    }
    refreshBatchInternal({ escMode });
  }, [escape, aiTagCache.length, AI_PER_REFRESH, consumeFromCache, refreshBatchInternal]);

  // 召唤精灵 ✨：撒网期专属，独立路径调一次 dynamic-cloud 拉 18 张全 AI 词。
  // 状态：summoning -> 按钮 disabled + IconRefresh 旋转。完成后用户可继续选词，
  // 或按 🔄 换一批回到漏斗规则混搭模式。
  const handleSummonFairy = useCallback(async () => {
    if (summoning) return;
    setSummoning(true);
    // ⚠️ 把 ctrl 挂 inflightRef，重选/切路径/新生成都能 abort 它
    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    try {
      await summonFairy(ctrl.signal);
    } finally {
      setSummoning(false);
    }
  }, [summoning, summonFairy]);

  // Auto-scroll
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), CONFIG.ui.inputFocusDelayMs);
  }, [open]);

  // ── Pet click ──────────────────────────────────────────────────────────────
  const handlePetClick = useCallback(() => {
    setFlash(true);
    spawnStars();
    setTimeout(() => setFlash(false), 350);
    if (!open) {
      setPanelAnim('enter');
      setOpen(true);
    } else {
      setPanelAnim('exit');
      setTimeout(() => { setOpen(false); setPanelAnim(null); }, 180);
    }
  }, [open, spawnStars]);

  // ── 桌宠拖拽 + 面板锚点 + 双击恢复 ────────────────────────────────────
  // 拖拽距离 > 5px 才视为拖拽（吞掉 click），否则当作点击打开 / 关闭面板。
  // 面板锚点根据精灵在视口的象限自动翻转（避免画到屏幕外）。
  // 双击精灵 → 清 localStorage + 归位到右下角默认位置。
  const petDrag = usePetDrag({
    expanded: open,
    onClick: handlePetClick,
  });

  // ── Switch path ────────────────────────────────────────────────────────────
  const switchPath = useCallback((newPath: CreationPath) => {
    if (isThinking) return;
    setCurrentPath(newPath);
    // 词云重置交给 hook
    resetCloudForPath(newPath);
    // 切路径后跨路径 refine 会用错路径调后端 —— 直接清掉，让用户重新生成
    setCurrentResult(null);
    resetChapters();
    inflightRef.current?.abort();
    // 旧路径预取的 AI 词卡不再适用，让蓄水池清空 + 节流 + abort
    invalidateCache();
    // 调味词卡的滑动窗口跟随路径走，切路径要清空避免把旧路径的词喂给新路径的 AI exclude
    swapExcludeRef.current = [];
  }, [isThinking, resetCloudForPath, invalidateCache, setCurrentResult, resetChapters]);

  // ── Tab 点击分流（折叠 + 首次确认逻辑）─────────────────────────────────
  // 三种情况：
  //  A. 首次未确认方向（pathConfirmed=false）→ 确认 + 展开（不动 result/章节）
  //  B. 已确认 + 点击当前 tab → 切换折叠状态
  //  C. 已确认 + 点击其他 tab → 走 switchPath（清 result）+ 展开
  const handleTabClick = useCallback((p: CreationPath) => {
    if (isThinking) return;
    if (!pathConfirmed) {
      // A：首次确认。currentPath 内部默认是 'story'，这里要按用户点的设
      setCurrentPath(p);
      setPathConfirmed(true);
      setCloudCollapsed(false);
      // 如果用户点的不是默认 'story'，词云要切到正确路径（避免显示故事路径词）
      if (p !== currentPath) {
        resetCloudForPath(p);
        invalidateCache();
      }
      return;
    }
    if (p === currentPath) {
      // B：再点当前 tab，切折叠状态
      setCloudCollapsed(prev => !prev);
      return;
    }
    // C：切到其他 tab → 原有 switchPath 行为 + 展开
    switchPath(p);
    setCloudCollapsed(false);
  }, [
    isThinking, pathConfirmed, currentPath,
    switchPath, resetCloudForPath, invalidateCache,
  ]);


  // ── Add custom tag ─────────────────────────────────────────────────────────
  const addCustomTag = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    if (hasGeneratedResult) { sendMessage(); return; }
    addSelectedFromInput(text);
    setInput('');
  }, [input, hasGeneratedResult, addSelectedFromInput]);

  // ── Send message: 薄路由 ──────────────────────────────────────────────────
  // generate / refine / chapter 生成的实现都在 hooks 里。
  // 这里只做：意图解析 + 用户消息回显 + 路由分发。
  const sendMessage = useCallback(async () => {
    if (isThinking) return;

    // ── Swap 模式：输入框走 ChipAwareInput，发送 pendingTags + pendingText
    if (hasGeneratedResult && swapReady) {
      const tagsToSend: ChipTag[] = pendingTags;
      const textToSend = pendingText.trim();
      if (tagsToSend.length === 0 && !textToSend) return;

      // 走 swap 路径还是纯 refine 路径？
      // 调味期点 ↑ 不回显用户消息到聊天流（产品决策）：
      // 调味动作的语义已经被 StageHint 副标题 + 词卡选中态表达了，
      // 再在聊天流里塞一条"冒牌公主 失忆刺客"会污染对话历史。
      if (tagsToSend.length > 0) {
        // 调味替换：story 路径走 refine-smart 含 swapInstructions；
        // 其它路径在 handleSwapSend 内会显示暂未接入提示。
        await handleSwapSend(tagsToSend, textToSend);
      } else {
        // 没 tag 但有文字：走原 refine（保留 parseIntent 行为）
        // 纯文字 refine 仍然需要回显（保持与撒网期 refine 一致）
        appendMessage({
          id: mid(), role: 'user', content: textToSend,
          createdAt: new Date().toISOString(),
        });
        const intent = parseIntent(textToSend);
        if (intent.kind === 'chapters') {
          await generateChapters(intent.count);
        } else if (intent.kind === 'refine') {
          await refine(intent.text);
        } else if (intent.kind === 'invalid') {
          appendMessage({
            id: mid(), role: 'muse', resultType: 'hint',
            content: `（${intent.reason}）`,
            createdAt: new Date().toISOString(),
          });
        }
      }
      clearPending();
      return;
    }

    // ── 旧路径：还在撒网阶段，或后端没返回 recipe ──────────────────────
    const text = input.trim();
    if (text.length < 2) return; // "嗯" "好" 不该触发后端
    if (!currentResult) {
      setInput('');
      return;
    }

    const intent = parseIntent(text);
    if (intent.kind === 'empty') return;

    // 错误意图：提示，不发请求
    if (intent.kind === 'invalid') {
      setInput('');
      appendMessages([
        { id: mid(), role: 'user', content: text, createdAt: new Date().toISOString() },
        {
          id: mid(), role: 'muse', resultType: 'hint',
          content: `（${intent.reason}）`,
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    // 用户消息回显 + 清输入
    setInput('');
    appendMessage({
      id: mid(), role: 'user', content: text,
      createdAt: new Date().toISOString(),
    });

    // 路由
    if (intent.kind === 'chapters') {
      await generateChapters(intent.count);
      return;
    }
    if (intent.kind === 'refine') {
      await refine(intent.text);
      return;
    }
  }, [
    input, isThinking, currentResult,
    hasGeneratedResult, swapReady, pendingTags, pendingText, clearPending,
    appendMessage, appendMessages,
    generateChapters, refine, handleSwapSend,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') hasGeneratedResult ? sendMessage() : addCustomTag();
  };

  const petClass = ['muse-pet', open ? 'expanded' : '', museState !== 'idle' ? museState : '']
    .filter(Boolean).join(' ');

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Dialog ─────────────────────────────────────────────────────────── */}
      {open && (
        <div
          className={`muse-panel-${panelAnim ?? 'enter'}`}
          style={{
            position: 'fixed',
            // 面板位置跟随桌宠：4 象限自动翻转（usePetDrag.panelAnchor）
            left:   petDrag.panelAnchor.left,
            top:    petDrag.panelAnchor.top,
            right:  petDrag.panelAnchor.right,
            bottom: petDrag.panelAnchor.bottom,
            width: 352, maxHeight: '84vh',
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            boxShadow: '0 12px 44px rgba(0,0,0,.65)',
            zIndex: 999998,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Title bar */}
          <div style={{
            padding: '10px 14px 9px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: C.p, boxShadow: `0 0 6px ${C.p}`,
              display: 'inline-block', flexShrink: 0,
            }}/>
            <span style={{ color: C.p, fontSize: 13, fontWeight: 700, letterSpacing: '.04em' }}>
              oiioii Muse
            </span>
            <span style={{ color: C.sub, fontSize: 11 }}>{selectedTags.length}/20</span>
            {canGenerate && !hasGeneratedResult && (
              <button onClick={generate} style={{
                marginLeft: 'auto', padding: '3px 11px',
                borderRadius: 6, border: `1px solid ${C.p}`,
                background: C.p, color: '#fff',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}>
                {T.fairy.btnGenerate}{PATH_META[currentPath].desc}
              </button>
            )}
          </div>

          {/* Locked tags —— 撒网期显示用户已选词；调味期复用此位置显示 pendingTags */}
          {!swapReady && selectedTags.length > 0 && (
            <div style={{
              padding: '7px 12px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex', flexWrap: 'wrap', gap: 5,
              flexShrink: 0,
            }}>
              {selectedTags.map(tag => {
                const TagIcon = PATH_META[tag.path].Icon;
                return (
                  <button key={tag.text} onClick={() => removeSelected(tag.text)} title={PATH_META[tag.path].label} style={{
                    padding: '3px 8px', borderRadius: 5, border: 'none',
                    background: C.p, color: '#fff',
                    fontSize: 11, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span style={{ opacity: .6, display: 'inline-flex' }}>
                      <TagIcon size={10} />
                    </span>
                    {tag.text}
                    <span style={{ opacity: .5, fontSize: 9 }}>✕</span>
                  </button>
                );
              })}
            </div>
          )}
          {swapReady && pendingTags.length > 0 && (
            <div style={{
              padding: '7px 12px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex', flexWrap: 'wrap', gap: 5,
              flexShrink: 0,
            }}>
              {pendingTags.map(t => {
                const TagIcon = PATH_META[currentPath].Icon;
                return (
                  <button
                    key={`${t.field}:${t.label}`}
                    onClick={() => togglePendingTag(t.field, t.label)}
                    title={t.field}
                    style={{
                      padding: '3px 8px', borderRadius: 5, border: 'none',
                      background: C.p, color: '#fff',
                      fontSize: 11, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <span style={{ opacity: .6, display: 'inline-flex' }}>
                      <TagIcon size={10} />
                    </span>
                    {t.label}
                    <span style={{ opacity: .5, fontSize: 9 }}>✕</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Path navigation + tabbed card (SVG concave-fillet) */}
          <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
            <TabbedHead
              current={currentPath}
              onChange={handleTabClick}
              disabled={isThinking}
              width={352 - 24}
              dimmed={!cloudExpanded}
            >
              <StageHint
                stage={stage}
                analysis={analysis}
                isDegraded={isDegraded}
                swapMode={swapReady}
                swapPreview={lastPickedCard?.preview ?? null}
              />
              {swapReady && recipe && swaps ? (
                <SwapCloud
                  recipe={recipe}
                  swaps={swaps}
                  path={currentPath}
                  pendingTags={pendingTags}
                  onCardClick={togglePendingTag}
                />
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {batch.map((tag, i) => {
                    const sel = selectedTags.some(t => t.text === tag.text);
                    const sz  = tagFontSize(tag.text);
                    const colors = tagColors(tag, sel);
                    return (
                      <button
                        key={tag.id}
                        className="muse-tag-in"
                        onClick={() => toggleTag(tag, {
                          // 选中池子里某张 AI 词，从池子移除避免下次刷新重复
                          onSelectFromCache: removeFromCache,
                        })}
                        title={tag.source === 'ai' ? T.fairy.tagTitleAi : T.fairy.tagTitleLocal}
                        style={{
                          animationDelay: `${i * 20}ms`,
                          padding: `${sz.py}px ${sz.px}px`,
                          borderRadius: 6,
                          border: `1px solid ${colors.border}`,
                          background: colors.background,
                          color: colors.color,
                          fontSize: sz.fs,
                          cursor: 'pointer',
                          transition: 'all .15s ease',
                          fontWeight: colors.fontWeight,
                        }}
                      >
                        {tag.text}
                      </button>
                    );
                  })}
                </div>
              )}
            </TabbedHead>
          </div>

          {/* 欢迎引导卡 —— 只在用户尚未确认过方向时显示（首次进入 / 重选后）。
              主动折叠不显示，避免老用户被反复"欢迎"。*/}
          {!pathConfirmed && <WelcomeGuide />}

          {/* 选题期 StageHint —— 只要词卡区折叠（未展开）就显示。
              视觉上"主动折叠"和"首次未选"统一为选题期。*/}
          {!cloudExpanded && (
            <div style={{ padding: '0 14px 0', flexShrink: 0 }}>
              <StageHint
                stage={stage}
                analysis={null}
                isDegraded={false}
                selectMode={true}
              />
            </div>
          )}

          {/* 折叠条 —— 用户主动折叠后显示（首次未确认方向不显示，那时 dimmed tab 已引导）*/}
          {pathConfirmed && cloudCollapsed && (
            <div
              onClick={() => setCloudCollapsed(false)}
              role="button"
              title="展开词卡"
              style={{
                margin: '6px 12px 0',
                padding: '6px 0',
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: 'rgba(255,255,255,.03)',
                color: C.sub,
                fontSize: 11,
                textAlign: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all .15s ease',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.color = C.p;
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,45,120,.4)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.color = C.sub;
                (e.currentTarget as HTMLDivElement).style.borderColor = C.border;
              }}
            >
              展开词卡
            </div>
          )}

          {/* Controls (moved outside card) —— 折叠时整块隐藏（召唤精灵/换一批跟词卡区一起收起）*/}
          {cloudExpanded && (
          <div style={{
            padding: '8px 14px 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span style={{ color: C.sub, fontSize: 10 }}>
              {swapReady ? '' : (
                selectedTags.length < 2
                  ? T.fairy.hintNeed(2 - selectedTags.length)
                  : canGenerate ? T.fairy.hintReady : ''
              )}
            </span>
            <div style={{ display: 'flex', gap: 5 }}>
              {swapReady ? (
                <>
                  <button
                    onClick={handleRestart}
                    title="清空当前故事，回到选词重新开始"
                    style={ctrlBtn}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#FF9500'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#FF9500'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.sub; (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; }}
                  >
                    重选
                  </button>
                  <button
                    onClick={handleSwapRefresh}
                    disabled={swapRefreshing}
                    style={{
                      ...ctrlBtn,
                      cursor: swapRefreshing ? 'wait' : 'pointer',
                      opacity: swapRefreshing ? .6 : 1,
                    }}
                    onMouseEnter={e => {
                      if (swapRefreshing) return;
                      (e.currentTarget as HTMLButtonElement).style.color = theme.swapPrimary;
                      (e.currentTarget as HTMLButtonElement).style.borderColor = theme.swapPrimary;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.color = C.sub;
                      (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
                    }}
                  >
                    <span className={swapRefreshing ? 'muse-spin' : undefined}>
                      <IconRefresh size={12} />
                    </span>
                    {T.fairy.btnRefresh}
                  </button>
                </>
              ) : (
                <>
                  {(() => {
                    const canSummon = selectedTags.length > 0 && !summoning;
                    const summonDisabled = !canSummon;
                    return (
                      <button
                        onClick={handleSummonFairy}
                        disabled={summonDisabled}
                        title={selectedTags.length === 0
                          ? '先选 1 个词，AI 才有方向可推'
                          : T.fairy.titleSummon}
                        style={{
                          ...ctrlBtn,
                          cursor: summoning ? 'wait' : (canSummon ? 'pointer' : 'not-allowed'),
                          opacity: summonDisabled ? .35 : 1,
                        }}
                        onMouseEnter={e => {
                          if (!canSummon) return;
                          (e.currentTarget as HTMLButtonElement).style.color = '#4CAF50';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = '#4CAF50';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.color = C.sub;
                          (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
                        }}
                      >
                        <span className={summoning ? 'muse-spin' : undefined}>
                          {summoning ? <IconRefresh size={12} /> : <span style={{ fontSize: 12 }}>✨</span>}
                        </span>
                        {T.fairy.btnSummon}
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => refreshBatch(false)}
                    style={ctrlBtn}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.p; (e.currentTarget as HTMLButtonElement).style.borderColor = C.p; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.sub; (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; }}
                  >
                    <IconRefresh size={12} />
                    {T.fairy.btnRefresh}
                  </button>
                </>
              )}
            </div>
          </div>
          )}

          {/* Messages */}
          {(messages.length > 0 || isThinking) && (() => {
            // 找到最近一条章节消息：只有它渲染最新章节状态并响应删除/插入
            let lastChaptersMsgId = '';
            // 同时找到最近一条带有 muse 结果的消息（story/character/worldview）：
            // 只在它底部渲染 RecipeBar，历史结果不挂配方栏。
            let lastResultMsgId = '';
            for (let i = messages.length - 1; i >= 0; i--) {
              const rt = messages[i].resultType;
              if (!lastChaptersMsgId && rt === 'chapters') {
                lastChaptersMsgId = messages[i].id;
              }
              if (!lastResultMsgId && (rt === 'story' || rt === 'character' || rt === 'worldview')) {
                lastResultMsgId = messages[i].id;
              }
              if (lastChaptersMsgId && lastResultMsgId) break;
            }
            return (
            <div style={{
              flex: 1, overflowY: 'auto', padding: '10px 12px',
              display: 'flex', flexDirection: 'column', gap: 8,
              scrollbarWidth: 'none', minHeight: 0,
            }}>
              {messages.map(msg => (
                <div key={msg.id} className="muse-msg" style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  {msg.role === 'user' ? (
                    <div style={{
                      maxWidth: '90%', padding: '8px 12px',
                      borderRadius: '12px 12px 3px 12px',
                      background: 'rgba(255,45,120,.13)',
                      border: `1px solid rgba(255,45,120,.24)`,
                      color: '#FFB3D0', fontSize: 13, lineHeight: 1.6,
                    }}>
                      {msg.content}
                    </div>
                  ) : msg.resultType === 'character' && msg.characterResult ? (
                    <div style={{ maxWidth: '95%' }}>
                      <CharacterCard r={msg.characterResult} />
                    </div>
                  ) : msg.resultType === 'worldview' && msg.worldviewResult ? (
                    <div style={{ maxWidth: '95%' }}>
                      <WorldviewCard r={msg.worldviewResult} />
                    </div>
                  ) : msg.resultType === 'chapters' && msg.chapters ? (
                    <div style={{ maxWidth: '95%' }}>
                      <ChapterListCard
                        chapters={
                          msg.id === lastChaptersMsgId ? chapters : msg.chapters
                        }
                        onDelete={handleDeleteChapter}
                        onInsertAfter={handleInsertChapterAfter}
                        busy={chapterBusy || msg.id !== lastChaptersMsgId}
                        degraded={
                          msg.id === lastChaptersMsgId
                            ? chaptersDegraded
                            : !!msg.chaptersDegraded
                        }
                      />
                    </div>
                  ) : msg.resultType === 'hint' ? (
                    <div style={{
                      maxWidth: '92%', padding: '6px 10px',
                      borderRadius: 8,
                      background: 'rgba(255,45,120,.08)',
                      border: '1px dashed rgba(255,45,120,.28)',
                      color: '#FFB3D0', fontSize: 12, lineHeight: 1.55,
                    }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div style={{
                      maxWidth: '92%', padding: '8px 12px',
                      borderRadius: '12px 12px 12px 3px',
                      background: 'rgba(255,255,255,.05)',
                      border: `1px solid rgba(255,255,255,.07)`,
                      color: '#E8E8E8', fontSize: 13, lineHeight: 1.65,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                      {/* 仅 muse 输出的实质内容（story 文本）显示复制；hint 已走前面分支不会到这里 */}
                      <CopyButton getText={() => msg.content} />
                    </div>
                  )}
                </div>
              ))}
              {isThinking && (
                <div className="muse-msg" style={{ display: 'flex' }}>
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '12px 12px 12px 3px',
                    background: 'rgba(255,255,255,.05)',
                    border: `1px solid rgba(255,255,255,.07)`,
                  }}>
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={msgEndRef}/>
            </div>
            );
          })()}

          {/* Input */}
          <div style={{
            padding: '8px 10px 10px',
            borderTop: messages.length > 0 || isThinking ? `1px solid ${C.border}` : 'none',
            display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={swapReady ? pendingText : input}
              onChange={e => swapReady ? setPendingText(e.target.value) : setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isThinking}
              placeholder={
                isThinking
                  ? T.fairy.inputPlaceholderThinking
                  : hasGeneratedResult
                    ? (
                      currentResult?.resultType === 'story'
                        ? (chapters.length > 0
                            ? T.fairy.inputPlaceholderRefineWithChapters
                            : T.fairy.inputPlaceholderStoryNoChapters)
                        : T.fairy.inputPlaceholderRefine
                    )
                    : T.fairy.inputPlaceholderPickWord
              }
              style={{
                flex: 1, background: 'rgba(255,255,255,.04)',
                border: `1px solid ${C.border}`, borderRadius: 8,
                padding: '6px 10px', color: C.text, fontSize: 13, outline: 'none',
                transition: 'border-color .15s ease',
                opacity: isThinking ? 0.5 : 1,
                cursor: isThinking ? 'not-allowed' : 'text',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(255,45,120,.45)')}
              onBlur={e  => (e.target.style.borderColor = C.border)}
            />
            {hasGeneratedResult ? (
              <button
                onClick={sendMessage}
                disabled={!pathConfirmed || isThinking || (swapReady ? (pendingTags.length === 0 && !pendingText.trim()) : !input.trim())}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none', flexShrink: 0,
                  background: isThinking
                    ? 'rgba(255,45,120,.15)'
                    : (swapReady ? (pendingTags.length > 0 || pendingText.trim()) : input.trim()) ? C.p : 'rgba(255,45,120,.15)',
                  color: isThinking
                    ? 'rgba(255,45,120,.7)'
                    : (swapReady ? (pendingTags.length > 0 || pendingText.trim()) : input.trim()) ? '#fff' : 'rgba(255,45,120,.3)',
                  cursor: isThinking
                    ? 'wait'
                    : (swapReady ? (pendingTags.length > 0 || pendingText.trim()) : input.trim()) ? 'pointer' : 'default',
                  fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .15s ease',
                }}>
                {isThinking ? (
                  <span className="muse-spin"><IconRefresh size={14} /></span>
                ) : '↑'}
              </button>
            ) : (
              <button
                onClick={pathConfirmed ? (input.trim() ? addCustomTag : canGenerate ? generate : undefined) : undefined}
                disabled={!pathConfirmed}
                title={!pathConfirmed ? '请先在上方选一个方向' : ''}
                style={{
                  height: 32, padding: '0 10px', borderRadius: 8, border: 'none', flexShrink: 0,
                  background: !pathConfirmed ? 'rgba(255,255,255,.06)'
                    : canGenerate && !input.trim() ? C.p
                    : input.trim() ? 'rgba(255,45,120,.2)' : 'rgba(255,255,255,.06)',
                  color: !pathConfirmed ? 'rgba(255,255,255,.25)'
                    : canGenerate && !input.trim() ? '#fff'
                    : input.trim() ? C.p : C.sub,
                  cursor: !pathConfirmed ? 'not-allowed' : (canGenerate || input.trim() ? 'pointer' : 'default'),
                  fontSize: 11, fontWeight: 700, transition: 'all .15s ease', whiteSpace: 'nowrap',
                }}
              >
                {canGenerate && !input.trim() ? T.fairy.btnGenerate : input.trim() ? T.fairy.btnAddCustom : T.fairy.btnPlus}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Pet ──────────────────────────────────────────────────────────────── */}
      <div
        className={petClass}
        role="button"
        aria-label="oiioii Muse"
        style={{
          ...petDrag.petStyle,
          // 拖拽中暂停 CSS 动画（避免 transform 抖动）+ 改光标
          ...(petDrag.dragging ? {
            cursor: 'grabbing',
            animationPlayState: 'paused',
          } : {}),
          touchAction: 'none',  // 移动端阻止滚动冲突
        }}
        {...petDrag.handlers}
      >
        {flash && <div className="muse-pet-flash"/>}
        {stars.map(s => (
          <div key={s.id} className="muse-pet-star" style={{
            top: '50%', left: '50%', marginTop: -2.5, marginLeft: -2.5,
            '--tx': `${s.x}px`, '--ty': `${s.y}px`,
          } as React.CSSProperties}/>
        ))}
        {/* 历史上有 museState !== 'loading' 守卫，但 'loading' 从未被设过 ——
            等价于永远显示。C6' 清掉 'loading' 状态时保留这个无条件渲染的行为。 */}
        <><div className="muse-pet-eye left"/><div className="muse-pet-eye right"/></>
      </div>
    </>
  );
}

const ctrlBtn: React.CSSProperties = {
  padding: '3px 9px', borderRadius: 6,
  border: `1px solid ${C.border}`,
  background: 'transparent', color: C.sub,
  fontSize: 11, cursor: 'pointer',
  transition: 'all .15s ease',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
