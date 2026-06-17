// 世界观规则卡：5 个字段 + 冲突钩子数组。
// 配色用绿色（与角色卡的粉色区分）。

import { theme as C } from '../../../theme';
import { T } from '../../../i18n/zh';
import type { WorldviewResult } from '../../../types';
import { CopyButton } from './CopyButton';

export function WorldviewCard({ r }: { r: WorldviewResult }) {
  const buildCopyText = () => {
    const lines: string[] = [T.cards.worldview.title];
    for (const [label, key] of T.cards.worldview.rows) {
      lines.push(`${label}：${r[key as Exclude<keyof WorldviewResult, 'conflictHooks'>]}`);
    }
    lines.push(`${T.cards.worldview.conflictHooksLabel}：`);
    for (const h of r.conflictHooks) lines.push(`- ${h}`);
    return lines.join('\n');
  };
  return (
    <div style={{
      background: 'rgba(76,175,80,.05)', border: `1px solid rgba(76,175,80,.2)`,
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ color: '#4CAF50', fontSize: 11, fontWeight: 700, marginBottom: 10, letterSpacing: '.06em' }}>
        {T.cards.worldview.title}
      </div>
      {T.cards.worldview.rows.map(([label, key]) => (
        <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
          <span style={{ color: C.sub, fontSize: 11, minWidth: 52, flexShrink: 0, paddingTop: 1 }}>{label}</span>
          <span style={{ color: '#E8E8E8', fontSize: 12, lineHeight: 1.55 }}>
            {r[key as Exclude<keyof WorldviewResult, 'conflictHooks'>]}
          </span>
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <div style={{ color: C.sub, fontSize: 11, marginBottom: 5 }}>{T.cards.worldview.conflictHooksLabel}</div>
        {r.conflictHooks.map((h, i) => (
          <div key={i} style={{
            color: '#E8E8E8', fontSize: 12, lineHeight: 1.55,
            padding: '3px 0 3px 10px',
            borderLeft: `2px solid rgba(76,175,80,.35)`,
            marginBottom: 4,
          }}>
            {h}
          </div>
        ))}
      </div>
      <CopyButton getText={buildCopyText} />
    </div>
  );
}
