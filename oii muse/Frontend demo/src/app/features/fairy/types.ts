// Fairy 模块内部共享类型。
// ChatMessage / MuseState 之前在 Fairy.tsx 里定义，C5 抽 hook 需要跨文件引用，
// 集中到这里。
//
// 这是模块内部类型（不是 wire format）—— wire format 在 src/app/types/index.ts。

import type { CharacterResult, WorldviewResult, StoryChapter } from '../../types';

// 'loading' / 'error' 在历史代码里定义过但从未被 setMuseState 写入。
// C6' 清理时移除，让 type 反映真实状态机。
export type MuseState = 'idle' | 'thinking' | 'success';

export interface ChatMessage {
  id: string;
  role: 'muse' | 'user';
  content: string;
  resultType?: 'story' | 'character' | 'worldview' | 'chapters' | 'hint';
  characterResult?: CharacterResult;
  worldviewResult?: WorldviewResult;
  chapters?: StoryChapter[];
  // 章节生成或插入时后端走 mock，前端在卡顶显示"AI 暂时离线"小字提示
  chaptersDegraded?: boolean;
  createdAt: string;
}
