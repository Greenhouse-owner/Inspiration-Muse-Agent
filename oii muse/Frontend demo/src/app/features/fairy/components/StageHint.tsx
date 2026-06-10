// 阶段提示行：显示当前漏斗阶段（撒网/拼接/收束）+ AI 给出的 currentGoal + missing。
// 当 analysis 为 null（还没拉到）时只显示阶段标签。

import { theme as C } from '../../../theme';
import { STAGE_META, type FunnelStage } from '../../../data/localTags';
import type { DynamicTagAnalysis } from '../../../types';

export function StageHint({ stage, analysis }: { stage: FunnelStage; analysis: DynamicTagAnalysis | null }) {
  const meta = STAGE_META[stage];
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: analysis ? 4 : 0 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: meta.color, display: 'inline-block', flexShrink: 0,
        }}/>
        <span style={{ color: meta.color, fontSize: 11, fontWeight: 700 }}>{meta.label}</span>
        {analysis && (
          <span style={{ color: C.sub, fontSize: 11, marginLeft: 2, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            · {analysis.currentGoal}
          </span>
        )}
      </div>
      {analysis && analysis.missing.length > 0 && (
        <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 10, paddingLeft: 12 }}>
          缺口：{analysis.missing.join('、')}
        </div>
      )}
    </div>
  );
}
