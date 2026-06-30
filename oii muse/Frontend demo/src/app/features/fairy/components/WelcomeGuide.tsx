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
        // 抵消 TabbedHead 内部 idleGapBelow=8 的视觉间隔，让 tab 上下间距对称
        margin: '2px 14px 12px',
      }}
    >
      {divider}
      <div style={{
        padding: '22px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        // 暗一档，跟 selectMode StageHint 副标题保持同色阶
        color: 'rgba(255,255,255,.35)',
        // 字号 + 字重跟上方 tab 文字（13/600）一致
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.5,
      }}>
        <span style={{
          display: 'inline-flex',
          flexShrink: 0,
          // icon 单独提亮一档，让"点击"动作更醒目，文字保持暗一档
          color: 'rgba(255,255,255,.5)',
        }}>
          <IconTap size={20} strokeWidth={1.8} />
        </span>
        <span>
          {T.fairy.welcomeHeadline}
        </span>
      </div>
      {divider}
    </div>
  );
}
