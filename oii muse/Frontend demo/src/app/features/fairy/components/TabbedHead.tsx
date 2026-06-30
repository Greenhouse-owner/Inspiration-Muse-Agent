// 路径切换 Tab + 与卡片"连体"几何。
//
// 视觉效果：选中 tab "插"在卡片顶边上，连接处用两段反向圆弧无缝衔接——
// tab 底部两侧凸出一小段，卡片顶边对应位置凹进一小段，二者贴合形成衣领。
// 这是定制 SVG path，不是 CSS 能直接做的，所以单独抽出来。
//
// 修改几何参数 → 改 TAB_GEO；只动一处。

import { theme as C } from '../../../theme';
import { type CreationPath, PATHS, PATH_META } from '../../../data/localTags';

// Tab + 卡片连体凹陷圆角的几何参数。
// Tab 三个等宽，左右两端的 tab 与卡片左右描边垂直对齐。
const TAB_GEO = {
  height:  62,   // tab 总高（点击区高度，保持不变）
  rTop:    14,   // tab 顶部两侧大圆角
  fillet:  8,    // 连接处圆弧半径
  bumpH:   8,    // 卡片顶边向上桥接的高度
  cardR:   12,   // 卡片整体圆角
  gap:     8,    // tab 之间间距
  stroke:  1.4,  // 描边宽度
  idleGapBelow: 8, // 未选中 tab 底部与卡片顶边之间的视觉间隔
};

export function TabbedHead({
  current, onChange, disabled, width, children, dimmed = false,
}: {
  current: CreationPath;
  onChange: (p: CreationPath) => void;
  disabled?: boolean;
  width: number;
  children: React.ReactNode;
  /**
   * dimmed: 3 个 tab 全部以"未选中"样式渲染（视觉上无选中态），
   * 用于首次打开 + 折叠时让用户明确选方向。
   * 内部仍接受 current（路径默认值），只是视觉降级。
   */
  dimmed?: boolean;
}) {
  const { height: H, fillet: F, bumpH, cardR, gap, stroke, idleGapBelow } = TAB_GEO;
  const tabW = (width - gap * 2) / 3;
  const activeIdx = PATHS.indexOf(current);

  // 未选中 tab：四角全圆角的胶囊矩形；底部上移 idleGapBelow，
  // 与卡片顶边留出视觉间隔，避免灰框压住粉色卡片描边。
  const idleTabPath = () => {
    const r = 10;
    const bottom = H - idleGapBelow;
    return [
      `M ${r} 0`,
      `L ${tabW - r} 0`,
      `A ${r} ${r} 0 0 1 ${tabW} ${r}`,
      `L ${tabW} ${bottom - r}`,
      `A ${r} ${r} 0 0 1 ${tabW - r} ${bottom}`,
      `L ${r} ${bottom}`,
      `A ${r} ${r} 0 0 1 0 ${bottom - r}`,
      `L 0 ${r}`,
      `A ${r} ${r} 0 0 1 ${r} 0`,
      'Z',
    ].join(' ');
  };

  return (
    <div style={{
      width, position: 'relative', flexShrink: 0,
      opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
    }}>
      {/* Tabs row */}
      <div style={{
        display: 'flex', gap, height: H, position: 'relative', zIndex: 2,
      }}>
        {PATHS.map((p) => {
          const meta = PATH_META[p];
          // dimmed=true 时所有 tab 视觉降级（全部按未选中态画），用户必须主动点 tab
          const active = !dimmed && p === current;
          const Icon = meta.Icon;
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              disabled={disabled}
              style={{
                flex: 1, height: H, padding: 0, margin: 0,
                background: 'transparent', border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                position: 'relative',
                color: active ? C.primary : C.tabIdleTxt,
                transition: 'color .15s ease',
              }}
            >
              <svg
                width={tabW} height={H}
                viewBox={`0 0 ${tabW} ${H}`}
                style={{ display: 'block', position: 'absolute', inset: 0, overflow: 'visible' }}
              >
                {!active && (
                  <path d={idleTabPath()} fill="#29292B" stroke={C.tabIdleBd} strokeWidth={stroke} />
                )}
              </svg>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2,
                pointerEvents: 'none',
                // 未选中 tab 的可见胶囊高度比 button 短 idleGapBelow，
                // 把内容也上移 idleGapBelow/2，让图标+文字在胶囊里居中。
                transform: active ? undefined : `translateY(-${idleGapBelow / 2}px)`,
              }}>
                <Icon size={22} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Card body with custom top edge that bridges into the active tab.
          dimmed 时不渲染下方连接 + 卡片（视觉上 3 个 tab 独立浮着，等待用户选择）。
          children 仍交由 Fairy.tsx 决定渲不渲染（折叠/展开） */}
      {!dimmed && (
        <CardWithTabBridge
          width={width}
          activeIdx={activeIdx}
          tabW={tabW}
          gap={gap}
          cardR={cardR}
          fillet={F}
          bumpH={bumpH}
          stroke={stroke}
        >
          {children}
        </CardWithTabBridge>
      )}
    </div>
  );
}

function CardWithTabBridge({
  width, activeIdx, tabW, gap, cardR, fillet: _fillet, stroke, children,
}: {
  width: number;
  activeIdx: number;
  tabW: number;
  gap: number;
  cardR: number;
  fillet: number;
  bumpH: number;
  stroke: number;
  children: React.ReactNode;
}) {
  // 顶部异形只负责选中 tab 与内容区顶边；动态内容高度交给下面 div border 完整包住。
  const tabLeft = activeIdx * (tabW + gap);
  const tabRight = tabLeft + tabW;
  const topH = TAB_GEO.height;
  const r = cardR;
  const topEdgeH = topH + r + 2;
  const leftNeckStart = Math.max(r, tabLeft - r);
  const rightNeckEnd = Math.min(width - r, tabRight + r);
  const leftSidePath = activeIdx === 0
    ? [
      `M 0 ${topEdgeH}`,
      `L 0 ${r}`,
      `A ${r} ${r} 0 0 1 ${r} 0`,
    ]
    : [
      `M 0 ${topEdgeH}`,
      `L 0 ${topH + r}`,
      `A ${r} ${r} 0 0 1 ${r} ${topH}`,
      `L ${leftNeckStart} ${topH}`,
      `Q ${tabLeft} ${topH} ${tabLeft} ${topH - r}`,
      `L ${tabLeft} ${r}`,
      `A ${r} ${r} 0 0 1 ${tabLeft + r} 0`,
    ];

  const isLastTab = tabRight >= width - r;
  const rightSidePath = isLastTab
    ? [
        `L ${tabRight - r} 0`,
        `A ${r} ${r} 0 0 1 ${tabRight} ${r}`,
        `L ${tabRight} ${topEdgeH}`,
      ]
    : [
        `L ${tabRight - r} 0`,
        `A ${r} ${r} 0 0 1 ${tabRight} ${r}`,
        `L ${tabRight} ${topH - r}`,
        `Q ${tabRight} ${topH} ${rightNeckEnd} ${topH}`,
        `L ${width - r} ${topH}`,
        `A ${r} ${r} 0 0 1 ${width} ${topH + r}`,
        `L ${width} ${topEdgeH}`,
      ];

  const topFillPath = [
    ...leftSidePath,
    ...rightSidePath,
    'Z',
  ].join(' ');

  const topStrokePath = [
    ...leftSidePath,
    ...rightSidePath,
  ].join(' ');

  return (
    <div style={{ position: 'relative', marginTop: -TAB_GEO.height }}>
      <svg
        width={width}
        height={topEdgeH}
        viewBox={`0 0 ${width} ${topEdgeH}`}
        style={{ display: 'block', position: 'relative', zIndex: 1, pointerEvents: 'none' }}
      >
        <path d={topFillPath} fill={C.cardFill} stroke="none" />
        <path d={topStrokePath} fill="none" stroke={C.cardBorder} strokeWidth={stroke} strokeLinejoin="round" />
      </svg>
      <div style={{
        marginTop: -stroke,
        borderLeft:   `${stroke}px solid ${C.cardBorder}`,
        borderRight:  `${stroke}px solid ${C.cardBorder}`,
        borderBottom: `${stroke}px solid ${C.cardBorder}`,
        borderBottomLeftRadius:  cardR,
        borderBottomRightRadius: cardR,
        background: C.cardFill,
        padding: '10px 14px 14px',
      }}>
        {children}
      </div>
    </div>
  );
}
