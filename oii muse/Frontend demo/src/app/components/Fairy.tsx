import { useState, useCallback, useRef, useEffect } from "react";
import "./fairy.css";
import { type CreationPath, PATH_META } from "../data/localTags";
import { parseIntent } from "../services/inputIntent";
import { T } from "../i18n/zh";
import { CONFIG } from "../config";
import { IconArrowUpRight, IconRefresh } from "./icons";

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
import { useTagCloud } from "../features/fairy/hooks/useTagCloud";
import { useAiCachePrefetch } from "../features/fairy/hooks/useAiCachePrefetch";
import { useChapters } from "../features/fairy/hooks/useChapters";
import { useGeneration } from "../features/fairy/hooks/useGeneration";

// ─── Main Fairy component ─────────────────────────────────────────────────────

export function Fairy() {
  const [open, setOpen]           = useState(false);
  const [panelAnim, setPanelAnim] = useState<'enter'|'exit'|null>(null);
  const [museState, setMuseState] = useState<MuseState>('idle');

  const [currentPath, setCurrentPath] = useState<CreationPath>('story');

  // ── 词云 / 选词 / 滑动窗口（C3 抽出）─────────────────────────────
  const cloud = useTagCloud({ open, currentPath });
  const {
    selectedTags, batch, escape, analysis, stage,
    setAnalysis,
    latestBatchRef, latestExcludeRef, latestTagStateKeyRef,
    toggleTag, removeSelected, addSelectedFromInput, refreshBatch: refreshBatchInternal,
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
    chapters, chapterBusy,
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
  const { currentResult, setCurrentResult, generate, refine } = generationHook;
  // 把 currentResultRef 暴露给 useChapters 的 getCurrentResult
  currentResultGetterRef.current = () => generationHook.currentResultRef.current;

  // Derived state
  const hasGeneratedResult = currentResult !== null;
  const isThinking  = museState === 'thinking';
  const canGenerate = selectedTags.length >= CONFIG.generation.minTagsToGenerate && !isThinking;

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
  }, [isThinking, resetCloudForPath, invalidateCache, setCurrentResult, resetChapters]);

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
    appendMessage, appendMessages,
    generateChapters, refine,
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
            position: 'fixed', bottom: 108, right: 28,
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

          {/* Locked tags */}
          {selectedTags.length > 0 && (
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

          {/* Path navigation + tabbed card (SVG concave-fillet) */}
          <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
            <TabbedHead
              current={currentPath}
              onChange={switchPath}
              disabled={isThinking}
              width={352 - 24}
            >
              <StageHint stage={stage} analysis={analysis} isDegraded={isDegraded} />
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
            </TabbedHead>
          </div>

          {/* Controls (moved outside card) */}
          <div style={{
            padding: '8px 14px 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span style={{ color: C.sub, fontSize: 10 }}>
              {selectedTags.length < 2
                ? T.fairy.hintNeed(2 - selectedTags.length)
                : canGenerate ? T.fairy.hintReady : ''}
            </span>
            <div style={{ display: 'flex', gap: 5 }}>
              <button
                onClick={() => refreshBatch(true)}
                title={T.fairy.titleEscape}
                style={ctrlBtn}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#FF9500'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#FF9500'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.sub; (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; }}
              >
                <IconArrowUpRight size={12} />
                {T.fairy.btnEscape}
              </button>
              <button
                onClick={() => refreshBatch(false)}
                style={ctrlBtn}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.p; (e.currentTarget as HTMLButtonElement).style.borderColor = C.p; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.sub; (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; }}
              >
                <IconRefresh size={12} />
                {T.fairy.btnRefresh}
              </button>
            </div>
          </div>

          {/* Messages */}
          {(messages.length > 0 || isThinking) && (() => {
            // 找到最近一条章节消息：只有它渲染最新章节状态并响应删除/插入
            let lastChaptersMsgId = '';
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].resultType === 'chapters') {
                lastChaptersMsgId = messages[i].id;
                break;
              }
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
              value={input}
              onChange={e => setInput(e.target.value)}
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
              <button onClick={sendMessage} disabled={!input.trim()} style={{
                width: 32, height: 32, borderRadius: 8, border: 'none', flexShrink: 0,
                background: input.trim() ? C.p : 'rgba(255,45,120,.15)',
                color: input.trim() ? '#fff' : 'rgba(255,45,120,.3)',
                cursor: input.trim() ? 'pointer' : 'default',
                fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .15s ease',
              }}>↑</button>
            ) : (
              <button
                onClick={input.trim() ? addCustomTag : canGenerate ? generate : undefined}
                style={{
                  height: 32, padding: '0 10px', borderRadius: 8, border: 'none', flexShrink: 0,
                  background: canGenerate && !input.trim() ? C.p
                    : input.trim() ? 'rgba(255,45,120,.2)' : 'rgba(255,255,255,.06)',
                  color: canGenerate && !input.trim() ? '#fff'
                    : input.trim() ? C.p : C.sub,
                  cursor: canGenerate || input.trim() ? 'pointer' : 'default',
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
      <div className={petClass} onClick={handlePetClick} role="button" aria-label="oiioii Muse">
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
