// HoverPreview —— 输入框上方一行灰字，hover 词卡时浮出，移开消失。
//
// 设计纪律（产品文档第 5.1 条）：
//   1. 永远只显示一条（最新 hover 中的那张词卡）
//   2. 不属于对话流，不进聊天历史
//   3. 鼠标移开 / 点击词卡 → 消失（点击后由父组件主动清 hoveredCard）
//   4. 占位行：card=null 时保留固定高度 18px，避免输入框上下抖动

import type { HoveredCard } from '../hooks/useRecipe';
import { theme } from '../../../theme';

export interface HoverPreviewProps {
  card: HoveredCard | null;
}

export function HoverPreview({ card }: HoverPreviewProps) {
  return (
    <div
      data-testid="hover-preview"
      className={card ? 'muse-hover-preview-active' : undefined}
      style={{
        height: 18,
        padding: '0 12px',
        fontSize: 11,
        lineHeight: '18px',
        color: card ? 'rgba(232,232,232,.5)' : 'transparent',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'color .1s ease',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {card ? (
        <>
          <span style={{ color: theme.primary, opacity: .7 }}>{card.label}</span>
          {'  ·  '}
          {card.preview}
        </>
      ) : ' '}
    </div>
  );
}
