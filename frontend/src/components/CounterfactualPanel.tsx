import type { CounterfactualResult } from '../types';

// ── SVG chart geometry ────────────────────────────────────────────────────
const ML = 22, MR = 6, MT = 6, MB = 16;
const PW = 244, PH = 80;

function toX(tick: number, maxTick: number) {
  return ML + (maxTick > 0 ? (tick / maxTick) * PW : 0);
}
function toY(s: number) {
  return MT + ((1 - Math.max(-1, Math.min(1, s))) / 2) * PH;
}
function makePath(pts: { tick: number; val: number }[], maxTick: number) {
  if (pts.length < 2) return '';
  return pts.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(p.tick, maxTick).toFixed(1)},${toY(p.val).toFixed(1)}`
  ).join(' ');
}

// Compute aggregate (mean across all groups) per tick
function aggregateSeries(series: { tick: number; groups: Record<string, number> }[]) {
  return series.map(point => {
    const vals = Object.values(point.groups);
    return { tick: point.tick, val: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 };
  });
}

interface Props {
  result: CounterfactualResult;
}

export default function CounterfactualPanel({ result }: Props) {
  const maxTick = result.n_ticks - 1;
  const baseAgg = aggregateSeries(result.baseline);
  const policyAgg = aggregateSeries(result.with_policy);

  const svgW = ML + PW + MR;
  const svgH = MT + PH + MB;

  const basePath = makePath(baseAgg, maxTick);
  const policyPath = makePath(policyAgg, maxTick);

  // Sort delta by absolute magnitude, largest first
  const sortedDelta = Object.entries(result.delta_by_group)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  const xLabels = maxTick > 0
    ? [0, Math.round(maxTick / 2), maxTick].filter((v, i, a) => a.indexOf(v) === i)
    : [0];

  return (
    <div style={{ marginTop: 10 }}>
      {/* Policy label */}
      <div style={{
        fontSize: 10, color: '#475569', fontStyle: 'italic',
        marginBottom: 8, lineHeight: 1.4,
        padding: '4px 6px', backgroundColor: '#0a0f1e',
        borderRadius: 4, border: '1px solid #1e293b',
      }}>
        "{result.policy}"
      </div>

      {/* Aggregate trajectory chart */}
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span>Overall community sentiment</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width={18} height={6}><line x1={0} y1={3} x2={18} y2={3} stroke="#64748b" strokeWidth={1.5} strokeDasharray="3,2"/></svg>
          Baseline
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width={18} height={6}><line x1={0} y1={3} x2={18} y2={3} stroke="#6366f1" strokeWidth={2}/></svg>
          With policy
        </span>
      </div>

      <svg width={svgW} height={svgH} style={{ display: 'block', width: '100%', height: 'auto' }}>
        {/* Y grid */}
        {[-1, 0, 1].map(v => (
          <g key={v}>
            <line
              x1={ML} y1={toY(v)} x2={ML + PW} y2={toY(v)}
              stroke={v === 0 ? '#334155' : '#1a2540'}
              strokeWidth={v === 0 ? 1.5 : 0.75}
              strokeDasharray={v === 0 ? undefined : '2,3'}
            />
            <text x={ML - 3} y={toY(v) + 3} fontSize={7} fill="#334155" textAnchor="end">
              {v > 0 ? '+' : ''}{v.toFixed(0)}
            </text>
          </g>
        ))}
        {/* X labels */}
        {xLabels.map(t => (
          <text key={t} x={toX(t, maxTick)} y={MT + PH + 11} fontSize={7} fill="#334155" textAnchor="middle">
            T{t}
          </text>
        ))}
        {/* Baseline (dashed gray) */}
        {basePath && (
          <path d={basePath} fill="none" stroke="#475569" strokeWidth={1.5}
            strokeDasharray="4,3" strokeLinecap="round" />
        )}
        {/* With policy (solid indigo) */}
        {policyPath && (
          <path d={policyPath} fill="none" stroke="#6366f1" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>

      {/* Delta by group */}
      {sortedDelta.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            fontSize: 10, color: '#64748b', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
          }}>
            Impact by Group (policy vs. baseline)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sortedDelta.map(([group, delta]) => {
              const isPositive = delta >= 0;
              const color = Math.abs(delta) < 0.02
                ? '#475569'
                : isPositive ? '#22c55e' : '#ef4444';
              const barPct = Math.min(100, Math.abs(delta) * 100);
              return (
                <div key={group} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 80, fontSize: 9, color: '#64748b', textAlign: 'right', flexShrink: 0 }}>
                    {group}
                  </div>
                  <div style={{ flex: 1, height: 5, backgroundColor: '#1e293b', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      position: 'absolute',
                      left: isPositive ? '50%' : `${50 - barPct / 2}%`,
                      width: `${barPct / 2}%`,
                      top: 0, bottom: 0,
                      backgroundColor: color,
                      borderRadius: 2,
                    }} />
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: '#334155' }} />
                  </div>
                  <div style={{ fontSize: 9, color, fontWeight: 700, width: 36, textAlign: 'right', flexShrink: 0 }}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
