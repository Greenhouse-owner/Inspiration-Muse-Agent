// 章节列表卡片：展示章节、提供"删除"和"在第 N 章后插入"按钮。
// busy 状态会禁用所有按钮（章节生成 / 插入请求中时）。

import type React from 'react';
import { theme as C } from '../../../theme';
import { T } from '../../../i18n/zh';
import type { StoryChapter } from '../../../types';

export function ChapterListCard({
  chapters, onDelete, onInsertAfter, busy,
}: {
  chapters: StoryChapter[];
  onDelete: (index: number) => void;
  onInsertAfter: (afterIndex: number) => void;
  busy: boolean;
}) {
  if (chapters.length === 0) return null;
  const btnStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid rgba(255,45,120,.32)',
    color: '#FFB3D0',
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 999,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.5 : 1,
    lineHeight: 1.4,
  };
  const insertBtn: React.CSSProperties = {
    ...btnStyle,
    border: '1px dashed rgba(255,45,120,.28)',
    color: '#FF8FB7',
    width: '100%',
    padding: '4px 8px',
    fontSize: 10,
  };
  return (
    <div style={{
      background: 'rgba(255,45,120,.06)',
      border: `1px solid rgba(255,45,120,.2)`,
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{
        color: C.primary, fontSize: 11, fontWeight: 700,
        marginBottom: 10, letterSpacing: '.06em',
      }}>
        {T.chapters.title(chapters.length)}
      </div>

      {/* 顶端插入 */}
      <button
        type="button"
        disabled={busy}
        onClick={() => onInsertAfter(0)}
        style={{ ...insertBtn, marginBottom: 6 }}
      >
        {T.chapters.insertAtTop}
      </button>

      {chapters.map((c, i) => (
        <div key={`${c.index}-${i}`}>
          <div style={{
            background: 'rgba(0,0,0,.18)',
            border: '1px solid rgba(255,255,255,.06)',
            borderRadius: 8, padding: '8px 10px',
            marginBottom: 6,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 5, gap: 6,
            }}>
              <span style={{ color: '#FFD7E5', fontSize: 12, fontWeight: 600 }}>
                {T.chapters.chapterHeading(c.index, c.title)}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(c.index)}
                style={btnStyle}
                aria-label={T.chapters.ariaDelete(c.index)}
              >
                {T.chapters.btnDelete}
              </button>
            </div>
            <div style={{
              color: '#E8E8E8', fontSize: 12, lineHeight: 1.62,
              whiteSpace: 'pre-wrap',
            }}>
              {c.summary}
            </div>
          </div>

          {/* 章节之间插入 */}
          <button
            type="button"
            disabled={busy}
            onClick={() => onInsertAfter(c.index)}
            style={{ ...insertBtn, marginBottom: 6 }}
          >
            {T.chapters.insertAfter(c.index)}
          </button>
        </div>
      ))}
    </div>
  );
}
