import { useEffect, useState } from 'react';
import type { HistoryPoint } from '../types';

const BACKEND_URL = 'http://localhost:8000';

const GROUP_COLORS: Record<string, string> = {
  'Retirees':           '#f59e0b',
  'Government & Policy':'#6366f1',
  'Education':          '#10b981',
  'Healthcare':         '#ec4899',
  'Finance & Tech':     '#3b82f6',
  'Local Business':     '#f97316',
  'Public Safety':      '#a855f7',
  'Trades & Services':  '#64748b',
  'Sports & Fitness':   '#22c55e',
  'Community':          '#14b8a6',
  'Arts & Environment': '#e879f9',
  'Residents':          '#94a3b8',
};

// Chart geometry
const ML = 22; // margin left
const MR = 6;  // margin right
const MT = 6;  // margin top
const MB = 16; // margin bottom
const PW = 244; // plot width
const PH = 90;  // plot height

function toX(tick: number, maxTick: number) {
  return ML + (maxTick > 0 ? (tick / maxTick) * PW : 0);
}

function toY(s: number) {
  return MT + ((1 - s) / 2) * PH;
}

interface Props {
  currentTick: number;
}

export default function SentimentChart({ currentTick }: Props) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    if (currentTick < 0) return;
    fetch(`${BACKEND_URL}/history`)
      .then(r => r.json())
      .then((data: HistoryPoint[]) => setHistory(data))
      .catch(() => {});
  }, [currentTick]);

  if (history.length < 2) return null;

  const maxTick = history[history.length - 1]?.tick ?? 1;
  const allGroups = Array.from(new Set(history.flatMap(p => Object.keys(p.groups))));

  const svgW = ML + PW + MR;
  const svgH = MT + PH + MB;

  const makePath = (group: string) => {
    const pts = history
      .filter(p => group in p.groups)
      .map(p => `${toX(p.tick, maxTick).toFixed(1)},${toY(p.groups[group]).toFixed(1)}`);
    return pts.length > 1 ? `M ${pts.join(' L ')}` : '';
  };

  const xLabels = [0, Math.round(maxTick / 2), maxTick].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
      <div style={{
        fontSize: 11, color: '#64748b', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
      }}>
        Sentiment by Group
      </div>

      <svg width={svgW} height={svgH} style={{ display: 'block', width: '100%', height: 'auto' }}>
        {/* Y grid + labels */}
        {[-1, -0.5, 0, 0.5, 1].map(v => (
          <g key={v}>
            <line
              x1={ML} y1={toY(v)} x2={ML + PW} y2={toY(v)}
              stroke={v === 0 ? '#334155' : '#1a2540'}
              strokeWidth={v === 0 ? 1.5 : 0.75}
              strokeDasharray={v === 0 ? undefined : '2,3'}
            />
            <text
              x={ML - 3} y={toY(v) + 3}
              fontSize={7} fill="#334155" textAnchor="end"
            >
              {v > 0 ? '+' : ''}{v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* X axis tick labels */}
        {xLabels.map(t => (
          <text key={t}
            x={toX(t, maxTick)} y={MT + PH + 11}
            fontSize={7} fill="#334155" textAnchor="middle"
          >
            T{t}
          </text>
        ))}

        {/* Group lines */}
        {allGroups.map(group => {
          const d = makePath(group);
          return d ? (
            <path
              key={group}
              d={d}
              fill="none"
              stroke={GROUP_COLORS[group] ?? '#94a3b8'}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          ) : null;
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 7 }}>
        {allGroups.map(group => (
          <div key={group} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 8, height: 2, borderRadius: 1,
              backgroundColor: GROUP_COLORS[group] ?? '#94a3b8',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 9, color: '#475569', lineHeight: 1 }}>{group}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
