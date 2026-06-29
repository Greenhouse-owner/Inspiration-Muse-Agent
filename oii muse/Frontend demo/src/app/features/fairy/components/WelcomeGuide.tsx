// WelcomeGuide —— 首次进入面板的引导卡（选题期专属）。
//
// 视觉：仿照"截图样式"——中间一行小字 + IconTap 手指 icon，上下浅灰横线包夹。
//   字号与 StageHint "选题期·..." 一致（11px），保证视觉层级统一。
//   不做 3 路径详细标签 —— tab 头本身已有路径名 + icon，重复引导反而啰嗦。
//
// 触发：pathConfirmed=false 时渲染（Fairy.tsx 控制）。
// 不可点击：用户必须通过上方 tab 选方向。
// 不做动画：保持设计克制。

import { theme as C } from '../../../theme';
import { T } from '../../../i18n/zh';
import { IconTap } from '../../../components/icons';

export function WelcomeGuide() {
  const divider = (
    <div style={{
      height: 1,
      background: 'rgba(255,255,255,.06)',
      margin: 0,
    }} />
  );

  return (
    <div
      data-testid="welcome-guide"
      style={{
        flexShrink: 0,
        // 上下都留出与 tab 区 / 选题期 hint 的间距，避免横线撞到旁边的元素
        margin: '14px 14px 12px',
      }}
    >
      {divider}
      <div style={{
        padding: '22px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        // 暗一档，跟 selectMode StageHint 副标题保持同色阶
        color: 'rgba(255,255,255,.35)',
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        <span style={{
          display: 'inline-flex',
          flexShrink: 0,
          color: 'rgba(255,255,255,.35)',
        }}>
          <IconTap size={15} />
        </span>
        <span>
          {T.fairy.welcomeHeadline}
        </span>
      </div>
      {divider}
    </div>
  );
}
