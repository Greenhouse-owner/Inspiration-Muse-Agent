// 角色设定卡：8 个字段（姓名、身份、性格、创伤、欲望、恐惧、秘密、弧光）。
// 字段标签来自 i18n（T.cards.character.rows），可改 zh.ts 调整。

import { theme as C } from '../../../theme';
import { T } from '../../../i18n/zh';
import type { CharacterResult } from '../../../types';
import { CopyButton } from './CopyButton';

export function CharacterCard({ r }: { r: CharacterResult }) {
  const rows: [string, string][] = T.cards.character.rows.map(
    ([label, key]) => [label, r[key as keyof CharacterResult]] as [string, string]
  );
  const buildCopyText = () =>
    [T.cards.character.title, ...rows.map(([label, val]) => `${label}：${val}`)].join('\n');
  return (
    <div style={{
      background: 'rgba(255,45,120,.06)', border: `1px solid rgba(255,45,120,.2)`,
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ color: C.primary, fontSize: 11, fontWeight: 700, marginBottom: 10, letterSpacing: '.06em' }}>
        {T.cards.character.title}
      </div>
      {rows.map(([label, val]) => (
        <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
          <span style={{ color: C.sub, fontSize: 11, minWidth: 28, flexShrink: 0, paddingTop: 1 }}>{label}</span>
          <span style={{ color: '#E8E8E8', fontSize: 12, lineHeight: 1.55 }}>{val}</span>
        </div>
      ))}
      <CopyButton getText={buildCopyText} />
    </div>
  );
}
