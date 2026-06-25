// 调味词卡 v1：三路径的槽位字段池 + 显示元数据
//
// 每路径钦定 3 个方向（不再随机抽）：
//   故事:   character / conflict / worldview （故事三件套）
//   角色:   identity / wound / desire        （他是谁 / 他被什么困住 / 他想要什么）
//   世界观: coreRule / taboo / conflictHooks （运行规则 / 边界 / 矛盾源）
//
// 数据形态严格匹配后端 schemas/result.py 的 Recipe.slots[i].field。
//
// Icon：复用 PATH_META 的 Icon。每路径 3 个方向共享所在路径的总 icon
// —— v1 不为每个子方向配独立图标，靠方向 label 中文做区分。

import { PATH_META, type CreationPath } from './localTags';
import type { IconProps } from '../components/icons';
import type { ComponentType } from 'react';

export interface SlotMeta {
  field: string;
  label: string;
  Icon: ComponentType<IconProps>;
}

const CharIcon  = PATH_META.character.Icon;
const StoryIcon = PATH_META.story.Icon;
const WorldIcon = PATH_META.worldview.Icon;

export const SLOT_POOL: Record<CreationPath, SlotMeta[]> = {
  story: [
    { field: 'character', label: '角色',   Icon: CharIcon  },
    { field: 'conflict',  label: '冲突',   Icon: StoryIcon },
    { field: 'worldview', label: '世界观', Icon: WorldIcon },
  ],
  // 角色路径钦定 3 槽：从 7 字段池选最能改方向的 3 个
  character: [
    { field: 'identity', label: '身份', Icon: CharIcon },
    { field: 'wound',    label: '创伤', Icon: CharIcon },
    { field: 'desire',   label: '欲望', Icon: CharIcon },
  ],
  // 世界观路径钦定 3 槽：从 5 字段池选最戏剧化的 3 个
  worldview: [
    { field: 'coreRule',      label: '核心法则', Icon: WorldIcon },
    { field: 'taboo',         label: '禁忌',     Icon: WorldIcon },
    { field: 'conflictHooks', label: '冲突源',   Icon: WorldIcon },
  ],
};

const FALLBACK_META: SlotMeta = { field: '', label: '', Icon: CharIcon };

export function metaForField(path: CreationPath, field: string): SlotMeta {
  return SLOT_POOL[path].find(s => s.field === field) ?? { ...FALLBACK_META, field };
}
