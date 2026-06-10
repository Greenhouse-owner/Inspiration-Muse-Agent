// 三个跳动的小点 —— 用于"正在生成"的占位指示。
// 动画类 .muse-dot-1/2/3 定义在 fairy.css 里。

import { theme as C } from '../../../theme';

export function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '2px 0' }}>
      {[1, 2, 3].map(i => (
        <span key={i} className={`muse-dot-${i}`} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: C.primary, display: 'inline-block',
        }}/>
      ))}
    </div>
  );
}
