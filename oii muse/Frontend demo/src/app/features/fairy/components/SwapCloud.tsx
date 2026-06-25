// SwapCloud —— 调味期 9 张词卡（3 行 × 3 张）。
//
// 寄生位置：TabbedHead 内部，撒网期渲染 batch、调味期渲染 SwapCloud（互斥）。
// 视觉：薄荷绿 #2ADFFF —— 跟撒网期 AI 绿 #4CAF50 区分，让用户视觉上立刻感知阶段切换。
// 选中态：实心薄荷绿 + 深字。
//
// 注意：本组件不渲染"换一批"按钮 —— 按钮跟撒网期 🌪/🔄 同位置，由 Fairy 主壳渲染。
//
// 交互：
//   - 点击词卡 → onCardClick(field, label, preview)
//     父组件做 toggle 语义；preview 用来更新 StageHint 副标题预览。
//   - 不再有 hover 行为（hover 灰字预览已废弃）

import type { CreationPath } from '../../../data/localTags';
import { metaForField } from '../../../data/recipeSlots';
import type { Recipe, SwapBatch } from '../../../types';
import type { ChipTag } from './ChipAwareInput';
import { swapCardColors } from '../helpers';

export interface SwapCloudProps {
  recipe: Recipe;
  swaps: SwapBatch;
  path: CreationPath;
  pendingTags: ChipTag[];
  onCardClick: (field: string, label: string, preview: string) => void;
}

export function SwapCloud({
  recipe, swaps, path,
  pendingTags, onCardClick,
}: SwapCloudProps) {
  return (
    <div data-testid="swap-cloud" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {recipe.slots.map(slot => {
        const meta = metaForField(path, slot.field);
        const cards = swaps.cards[slot.field] ?? [];
        const Icon = meta.Icon;
        return (
          <div
            key={slot.field}
            data-swap-row={slot.field}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}
          >
            {cards.map((card, j) => {
              const selected = pendingTags.some(
                t => t.field === slot.field && t.label === card.label
              );
              const colors = swapCardColors(selected);
              return (
                <button
                  key={`${slot.field}:${card.label}`}
                  className="muse-swap-card-in"
                  data-swap-card-field={slot.field}
                  data-swap-card-label={card.label}
                  onClick={() => onCardClick(slot.field, card.label, card.preview)}
                  style={{
                    animationDelay: `${j * 20}ms`,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: `1px solid ${colors.border}`,
                    background: colors.background,
                    color: colors.color,
                    fontWeight: colors.fontWeight,
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'border-color .15s ease, background .15s ease, color .15s ease',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <span style={{ opacity: .8, display: 'inline-flex' }}>
                    <Icon size={10} />
                  </span>
                  {card.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// 工具：滚动到对应槽位的行
export function scrollSwapRowIntoView(field: string, container?: HTMLElement | null) {
  const root: ParentNode = container ?? document;
  const row = root.querySelector<HTMLElement>(`[data-swap-row="${cssEscape(field)}"]`);
  if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cssEscape(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '\\$&');
}
