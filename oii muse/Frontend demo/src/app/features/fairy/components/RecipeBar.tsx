// RecipeBar —— 故事/角色/世界观卡片底部一行粉色 chip，显示本次配方的 3 个槽位。
//
// 点击 chip：父组件负责"滚动到调味词卡区对应槽位"。
// 视觉：与项目原有"已选词条"风格对齐 —— 实心粉色 chip（border + bg + 文字 + icon）。
// 替换闪烁：父组件可通过 flashFields 触发 keyframe 高亮。

import type { CreationPath } from '../../../data/localTags';
import { metaForField } from '../../../data/recipeSlots';
import type { Recipe } from '../../../types';
import { theme } from '../../../theme';

export interface RecipeBarProps {
  recipe: Recipe;
  path: CreationPath;
  onChipClick?: (field: string) => void;
  flashFields?: string[]; // 替换后闪一下用，可同时高亮多个 field
}

export function RecipeBar({ recipe, path, onChipClick, flashFields }: RecipeBarProps) {
  const flashSet = flashFields && flashFields.length > 0 ? new Set(flashFields) : null;
  return (
    <div
      data-testid="recipe-bar"
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        marginTop: 8,
        fontSize: 11,
      }}
    >
      {recipe.slots.map(slot => {
        const meta = metaForField(path, slot.field);
        const isFlashing = !!flashSet?.has(slot.field);
        const Icon = meta.Icon;
        return (
          <button
            key={slot.field}
            data-recipe-field={slot.field}
            onClick={() => onChipClick?.(slot.field)}
            className={isFlashing ? 'muse-recipe-chip-flash' : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px',
              border: `1px solid ${theme.chipBd}`,
              borderRadius: 999,
              background: theme.chipBg,
              color: theme.chipTxt,
              fontSize: 11,
              lineHeight: 1.4,
              cursor: onChipClick ? 'pointer' : 'default',
              transition: 'border-color .15s ease, background .15s ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = theme.primary;
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,45,120,.28)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = theme.chipBd;
              (e.currentTarget as HTMLButtonElement).style.background = theme.chipBg;
            }}
            title={meta.label}
          >
            <span style={{ opacity: .7, display: 'inline-flex' }}>
              <Icon size={10} />
            </span>
            <span>{slot.value}</span>
          </button>
        );
      })}
    </div>
  );
}
