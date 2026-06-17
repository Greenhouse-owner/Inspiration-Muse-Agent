// 复制按钮 —— 卡片右下角淡淡的 "copy" 小字，hover 加亮，点击复制 + 短暂变 "copied"。
// 优先用 navigator.clipboard.writeText（HTTPS / 现代浏览器），失败时降级到
// document.execCommand('copy')（兼容老 webview / http 环境）。

import { useCallback, useState } from 'react';
import { T } from '../../../i18n/zh';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  // 兜底：textarea + execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ getText, align = 'right' }: {
  getText: () => string;
  align?: 'left' | 'right';
}) {
  const [done, setDone] = useState(false);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(getText());
    if (ok) {
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    }
  }, [getText]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      marginTop: 6,
    }}>
      <span
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick(e as unknown as React.MouseEvent); }}
        style={{
          fontSize: 11,
          color: done ? '#FFB3D0' : 'rgba(255,255,255,.28)',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'color .15s ease',
          letterSpacing: '.04em',
        }}
        onMouseEnter={e => { if (!done) (e.currentTarget as HTMLSpanElement).style.color = 'rgba(255,179,208,.7)'; }}
        onMouseLeave={e => { if (!done) (e.currentTarget as HTMLSpanElement).style.color = 'rgba(255,255,255,.28)'; }}
      >
        {done ? T.fairy.copyDone : T.fairy.copy}
      </span>
    </div>
  );
}
