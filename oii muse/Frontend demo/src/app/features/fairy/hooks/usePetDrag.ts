// usePetDrag —— 桌宠拖拽 + 面板位置计算。
//
// 范围：
//   - 桌宠在视口里自由拖动（pointer events）
//   - 区分"点击" vs "拖拽"：移动 > 5px 才算拖
//   - 位置写 localStorage，下次打开记住
//   - 双击恢复默认（清掉 localStorage 并归位到右下）
//   - 窗口 resize 时把精灵 clamp 回可视区
//   - 计算面板锚点：根据精灵在视口的象限自动翻转
//
// 不在范围：
//   - 面板内部的拖拽 / resize（用户没要求）
//   - 移动端的"防滚动冲突"——pointer events + touch-action 已经基本足够
//
// 为什么不用 useState 给 transform：
//   现有 CSS 的呼吸/上浮动画用 transform: translateY，再叠 translate 会冲突。
//   我们直接改 inline left/top，覆盖 CSS 的 bottom/right。
//
// 数据形态：position = null → 用 CSS 默认（首次访问 / 双击重置）

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'muse-pet-pos';
const DRAG_THRESHOLD_PX = 5;
const PET_SIZE = 48;          // 与 fairy.css .muse-pet 一致
const PET_EXPANDED = 68;      // .muse-pet.expanded
const PANEL_W = 352;          // CONFIG.ui.panelWidth
const PANEL_GAP = 12;         // 精灵到面板的间距
const SAFE_MARGIN = 8;        // 距视口边缘最少留这么多

export interface PetPos {
  x: number;  // 相对视口左上角
  y: number;
}

export interface PanelAnchor {
  // 面板的 left / top（其中之一可能是 'auto'，配合 right/bottom 实现锚定）
  // 直接给可用于 style 的对象
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  // 哪个角对齐到精灵，"br"=精灵的右下角对面板的右下角（面板在精灵左上方展开），等等
  origin: 'br' | 'bl' | 'tr' | 'tl';
}

// 从 localStorage 读初始位置，clamp 到当前视口
function readStoredPos(): PetPos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null;
    return clampToViewport(parsed.x, parsed.y, PET_SIZE);
  } catch {
    return null;
  }
}

function clampToViewport(x: number, y: number, size: number): PetPos {
  const maxX = window.innerWidth - size - SAFE_MARGIN;
  const maxY = window.innerHeight - size - SAFE_MARGIN;
  return {
    x: Math.max(SAFE_MARGIN, Math.min(maxX, x)),
    y: Math.max(SAFE_MARGIN, Math.min(maxY, y)),
  };
}

// 基于精灵中心点的象限，决定面板从哪个方向展开
function computeAnchor(petX: number, petY: number, petSize: number): PanelAnchor {
  const cx = petX + petSize / 2;
  const cy = petY + petSize / 2;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isLeft = cx < vw / 2;
  const isTop = cy < vh / 2;

  // 4 个象限对应 4 种锚定方式：面板始终展开到精灵的"对角"
  if (isLeft && isTop) {
    // 精灵在左上 → 面板出现在右下方
    return { left: petX, top: petY + petSize + PANEL_GAP, origin: 'tl' };
  }
  if (!isLeft && isTop) {
    // 精灵在右上 → 面板出现在左下方
    return { right: vw - petX - petSize, top: petY + petSize + PANEL_GAP, origin: 'tr' };
  }
  if (isLeft && !isTop) {
    // 精灵在左下 → 面板出现在右上方
    return { left: petX, bottom: vh - petY + PANEL_GAP, origin: 'bl' };
  }
  // 精灵在右下 → 面板出现在左上方（默认）
  return { right: vw - petX - petSize, bottom: vh - petY + PANEL_GAP, origin: 'br' };
}

export function usePetDrag(opts: {
  expanded: boolean;
  /** 点击精灵（非拖拽）的回调 */
  onClick: () => void;
  /** 双击：恢复默认位置 */
  onDoubleClick?: () => void;
}) {
  const { expanded, onClick, onDoubleClick } = opts;

  // null = 用 CSS 默认（右下角）
  const [position, setPosition] = useState<PetPos | null>(() => readStoredPos());
  const [dragging, setDragging] = useState(false);

  const dragStateRef = useRef<{
    startX: number; startY: number;
    petStartX: number; petStartY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);

  // 当前实际精灵尺寸（点击展开后会变大）
  const petSize = expanded ? PET_EXPANDED : PET_SIZE;

  // ── pointerdown ──────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 仅左键 / 主指针
    if (e.button !== 0) return;
    const el = e.currentTarget;
    // 当前精灵真实位置（如果还没拖过，就用 getBoundingClientRect）
    const rect = el.getBoundingClientRect();
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      petStartX: rect.left,
      petStartY: rect.top,
      moved: false,
      pointerId: e.pointerId,
    };
    // 捕获 pointer，移出元素也能继续收到事件
    el.setPointerCapture(e.pointerId);
  }, []);

  // ── pointermove ──────────────────────────────────────────────────
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st || e.pointerId !== st.pointerId) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.moved) {
      // 还没越过阈值——继续等
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      st.moved = true;
      setDragging(true);
    }
    const nextX = st.petStartX + dx;
    const nextY = st.petStartY + dy;
    setPosition(clampToViewport(nextX, nextY, petSize));
  }, [petSize]);

  // ── pointerup ────────────────────────────────────────────────────
  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st || e.pointerId !== st.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* 已经释放就忽略 */ }
    dragStateRef.current = null;
    if (st.moved) {
      // 是拖拽：吞掉这次的 click（不打开面板）；写 localStorage
      setDragging(false);
      // 用 setState 函数式读最新的，避免闭包
      setPosition(curr => {
        if (curr) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(curr)); } catch { /* ignore */ }
        }
        return curr;
      });
      // 阻止后续 click 触发（React 同步合成事件，下面 onClick 里我们也守一道）
    } else {
      // 没移动：当成点击
      onClick();
    }
  }, [onClick]);

  // ── pointercancel ──（被系统打断，比如来电）─────────────────────
  const handlePointerCancel = useCallback(() => {
    dragStateRef.current = null;
    setDragging(false);
  }, []);

  // ── 双击恢复默认 ────────────────────────────────────────────────
  const handleDoubleClick = useCallback(() => {
    setPosition(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    onDoubleClick?.();
  }, [onDoubleClick]);

  // ── 窗口 resize 时 clamp 进可视区 ──────────────────────────────
  useEffect(() => {
    const onResize = () => {
      setPosition(curr => {
        if (!curr) return curr;
        const clamped = clampToViewport(curr.x, curr.y, petSize);
        if (clamped.x === curr.x && clamped.y === curr.y) return curr;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped)); } catch { /* ignore */ }
        return clamped;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [petSize]);

  // ── 计算面板锚点 ─────────────────────────────────────────────
  // position 为 null 时用 CSS 默认（右下角）→ anchor 用默认值
  const panelAnchor: PanelAnchor = position
    ? computeAnchor(position.x, position.y, petSize)
    : { right: 28, bottom: 108, origin: 'br' };

  // ── 暴露给精灵的 inline style ────────────────────────────────
  // position!==null 时用 left/top；为 null 时返回空对象走 CSS 默认
  const petStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : {};

  return {
    petStyle,
    panelAnchor,
    dragging,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp:   handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onDoubleClick: handleDoubleClick,
    },
  };
}
