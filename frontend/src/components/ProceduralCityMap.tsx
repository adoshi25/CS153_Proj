import type { CityLayout, CityDistrict, CityLandmark } from '../types';

// Coordinate space matches city-map.png exactly (2048×2048)
const MAP = 2048;

type Rect = { x: number; y: number; w: number; h: number };

// ── Zone templates (normalized 0–1) ──────────────────────────────────────────
// Each type has ordered slots; districts are assigned left-to-right.
const SLOTS: Record<string, Rect[]> = {
  park:        [{ x:.01, y:.01, w:.25, h:.33 }, { x:.74, y:.01, w:.25, h:.33 }],
  government:  [{ x:.38, y:.37, w:.24, h:.22 }],
  commercial:  [{ x:.08, y:.42, w:.28, h:.18 }, { x:.64, y:.42, w:.28, h:.18 }],
  industrial:  [{ x:.01, y:.67, w:.27, h:.31 }, { x:.72, y:.67, w:.27, h:.31 }],
  residential: [{ x:.01, y:.34, w:.09, h:.32 }, { x:.90, y:.34, w:.09, h:.32 }, { x:.29, y:.67, w:.41, h:.31 }],
  mixed:       [{ x:.27, y:.01, w:.46, h:.31 }],
};

// ── Visual style per type ────────────────────────────────────────────────────
const STYLE: Record<string, { fill: string; stroke: string; label: string; dim: string }> = {
  park:        { fill: '#052e16', stroke: '#166534', label: '#4ade80', dim: '#166534' },
  government:  { fill: '#1e1b4b', stroke: '#4338ca', label: '#a5b4fc', dim: '#4338ca' },
  commercial:  { fill: '#052e16', stroke: '#0f766e', label: '#5eead4', dim: '#0f766e' },
  industrial:  { fill: '#431407', stroke: '#b45309', label: '#fbbf24', dim: '#b45309' },
  residential: { fill: '#0f1f35', stroke: '#1e40af', label: '#93c5fd', dim: '#1e40af' },
  mixed:       { fill: '#1a0a2e', stroke: '#6d28d9', label: '#c4b5fd', dim: '#6d28d9' },
};
const DEFAULT_STYLE = STYLE.mixed;

// ── Road backbone (normalized) ───────────────────────────────────────────────
const MAJOR_ROADS = [
  { x1: 0, y1: .40, x2: 1, y2: .40 },   // horizontal artery
  { x1: .37, y1: 0, x2: .37, y2: 1 },   // vertical artery
];
const MINOR_ROADS = [
  { x1: 0, y1: .20, x2: 1, y2: .20 },
  { x1: 0, y1: .65, x2: 1, y2: .65 },
  { x1: .16, y1: 0, x2: .16, y2: 1 },
  { x1: .63, y1: 0, x2: .63, y2: 1 },
];

// ── Landmark home zones per type ─────────────────────────────────────────────
const LM_HOME: Record<string, Rect> = {
  school:     { x:.29, y:.67, w:.41, h:.31 },
  hospital:   { x:.08, y:.42, w:.28, h:.18 },
  government: { x:.38, y:.37, w:.24, h:.22 },
  industry:   { x:.01, y:.67, w:.27, h:.31 },
  business:   { x:.64, y:.42, w:.28, h:.18 },
  community:  { x:.27, y:.01, w:.46, h:.31 },
  park:       { x:.01, y:.01, w:.25, h:.33 },
  transit:    { x:.08, y:.38, w:.56, h:.04 },
  other:      { x:.27, y:.01, w:.46, h:.31 },
};

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
function seededRand(seed: string) {
  let s = seed.split('').reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0) >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ── Layout builder ────────────────────────────────────────────────────────────
interface PlacedDistrict extends CityDistrict { rect: Rect }
interface PlacedLandmark extends CityLandmark { px: number; py: number }

function buildLayout(layout: CityLayout, seed: string) {
  const rand = seededRand(seed);
  const usage: Record<string, number> = {};
  const jitter = () => (rand() - 0.5) * 0.05;

  const districts: PlacedDistrict[] = layout.districts.map(d => {
    const type = d.type in SLOTS ? d.type : 'mixed';
    const slots = SLOTS[type];
    const i = usage[type] ?? 0;
    usage[type] = i + 1;
    const base = slots[i % slots.length];
    return {
      ...d,
      rect: {
        x: Math.max(0.005, base.x + jitter()),
        y: Math.max(0.005, base.y + jitter()),
        w: Math.max(0.08, base.w + Math.abs(jitter())),
        h: Math.max(0.08, base.h + Math.abs(jitter())),
      },
    };
  });

  const landmarks: PlacedLandmark[] = layout.landmarks.map(lm => {
    const home = LM_HOME[lm.type] ?? LM_HOME.other;
    return {
      ...lm,
      px: (home.x + rand() * home.w) * MAP,
      py: (home.y + rand() * home.h) * MAP,
    };
  });

  return { districts, landmarks };
}

// ── Landmark icon ─────────────────────────────────────────────────────────────
function LandmarkIcon({ type, cx, cy, color }: { type: string; cx: number; cy: number; color: string }) {
  const r = 10;
  switch (type) {
    case 'school':
      return <rect x={cx - r * .8} y={cy - r * .8} width={r * 1.6} height={r * 1.6} fill={color} fillOpacity=".9" rx="2" />;
    case 'hospital':
      return <>
        <rect x={cx - r * .9} y={cy - r * .3} width={r * 1.8} height={r * .6} fill={color} fillOpacity=".9" rx="1" />
        <rect x={cx - r * .3} y={cy - r * .9} width={r * .6} height={r * 1.8} fill={color} fillOpacity=".9" rx="1" />
      </>;
    case 'government':
      return <polygon points={`${cx},${cy - r} ${cx + r * .9},${cy + r * .5} ${cx - r * .9},${cy + r * .5}`}
        fill={color} fillOpacity=".9" />;
    case 'industry':
      return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
        fill={color} fillOpacity=".9" />;
    case 'park':
      return <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity=".8" />;
    default:
      return <circle cx={cx} cy={cy} r={r * .7} fill={color} fillOpacity=".8" />;
  }
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  layout: CityLayout;
  neighborhoodName: string;
  animationKey: number; // increment to re-trigger entrance animation
}

export default function ProceduralCityMap({ layout, neighborhoodName, animationKey }: Props) {
  const { districts, landmarks } = buildLayout(layout, neighborhoodName + animationKey);

  const n = (v: number) => v * MAP; // normalize → pixel

  return (
    <svg
      width={MAP}
      height={MAP}
      viewBox={`0 0 ${MAP} ${MAP}`}
      style={{ display: 'block', opacity: 0.85 }}
    >
      <defs>
        {/* Dot grid */}
        <pattern id={`grid-${animationKey}`} width="64" height="64" patternUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r="1.2" fill="#1e293b" />
          <circle cx="64" cy="0" r="1.2" fill="#1e293b" />
          <circle cx="0" cy="64" r="1.2" fill="#1e293b" />
          <circle cx="64" cy="64" r="1.2" fill="#1e293b" />
        </pattern>
        {/* Road glow filter */}
        <filter id={`glow-${animationKey}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Per-district clip + animation */}
        {districts.map((d, i) => (
          <style key={i}>{`
            @keyframes fadeInDistrict${animationKey}_${i} {
              from { opacity: 0; transform: scale(0.96); }
              to   { opacity: 1; transform: scale(1); }
            }
            .d${animationKey}_${i} {
              animation: fadeInDistrict${animationKey}_${i} 0.5s ease forwards;
              animation-delay: ${i * 80}ms;
              opacity: 0;
              transform-origin: ${n(d.rect.x + d.rect.w / 2)}px ${n(d.rect.y + d.rect.h / 2)}px;
            }
          `}</style>
        ))}
        <style>{`
          @keyframes roadDraw${animationKey} {
            from { stroke-dashoffset: 3000; }
            to   { stroke-dashoffset: 0; }
          }
          .road-major-${animationKey} {
            stroke-dasharray: 3000;
            animation: roadDraw${animationKey} 1.2s ease forwards;
            animation-delay: ${districts.length * 80 + 100}ms;
          }
          .road-minor-${animationKey} {
            stroke-dasharray: 3000;
            animation: roadDraw${animationKey} 0.9s ease forwards;
            animation-delay: ${districts.length * 80 + 300}ms;
          }
          @keyframes lmPop${animationKey} {
            from { opacity: 0; transform: scale(0); }
            to   { opacity: 1; transform: scale(1); }
          }
          .lm-${animationKey} {
            animation: lmPop${animationKey} 0.35s ease forwards;
            opacity: 0;
          }
        `}</style>
      </defs>

      {/* ── Background ── */}
      <rect width={MAP} height={MAP} fill="#0a0f1e" />
      <rect width={MAP} height={MAP} fill={`url(#grid-${animationKey})`} />

      {/* ── Districts ── */}
      {districts.map((d, i) => {
        const s = STYLE[d.type] ?? DEFAULT_STYLE;
        const rx = n(d.rect.x), ry = n(d.rect.y);
        const rw = n(d.rect.w), rh = n(d.rect.h);
        const cx = rx + rw / 2, cy = ry + rh / 2;
        const fontSize = Math.max(16, Math.min(28, rw / 8));
        return (
          <g key={d.name} className={`d${animationKey}_${i}`}>
            {/* Fill */}
            <rect x={rx} y={ry} width={rw} height={rh} rx="12" ry="12"
              fill={s.fill} fillOpacity=".85" stroke={s.stroke} strokeWidth="1.5" strokeOpacity=".6" />
            {/* Inner highlight */}
            <rect x={rx + 2} y={ry + 2} width={rw - 4} height={Math.min(40, rh * .18)} rx="10" ry="10"
              fill="white" fillOpacity=".03" />
            {/* Detail marks — small building-like rects for commercial/government */}
            {(d.type === 'commercial' || d.type === 'government') && Array.from({ length: 4 }).map((_, j) => (
              <rect key={j}
                x={rx + rw * (.15 + j * .2)} y={ry + rh * .55}
                width={rw * .1} height={rh * (.15 + (j % 2) * .1)}
                fill={s.stroke} fillOpacity=".25" rx="2" />
            ))}
            {/* Tree dots for parks */}
            {d.type === 'park' && Array.from({ length: 8 }).map((_, j) => (
              <circle key={j}
                cx={rx + rw * (.1 + (j % 4) * .25)} cy={ry + rh * (.2 + Math.floor(j / 4) * .45)}
                r="14" fill={s.stroke} fillOpacity=".3" />
            ))}
            {/* Label */}
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
              fontSize={fontSize} fontWeight="600" fill={s.label} fillOpacity=".7"
              fontFamily="system-ui, sans-serif" letterSpacing=".04em">
              {d.name}
            </text>
          </g>
        );
      })}

      {/* ── Minor roads ── */}
      {MINOR_ROADS.map((r, i) => (
        <line key={i}
          className={`road-minor-${animationKey}`}
          x1={r.x1 * MAP} y1={r.y1 * MAP} x2={r.x2 * MAP} y2={r.y2 * MAP}
          stroke="#1e293b" strokeWidth="6" />
      ))}

      {/* ── Major roads — glow + road ── */}
      {MAJOR_ROADS.map((r, i) => (
        <g key={i}>
          <line
            x1={r.x1 * MAP} y1={r.y1 * MAP} x2={r.x2 * MAP} y2={r.y2 * MAP}
            stroke="#3b82f6" strokeWidth="14" strokeOpacity=".08"
            filter={`url(#glow-${animationKey})`}
          />
          <line
            className={`road-major-${animationKey}`}
            x1={r.x1 * MAP} y1={r.y1 * MAP} x2={r.x2 * MAP} y2={r.y2 * MAP}
            stroke="#334155" strokeWidth="8" />
          <line
            className={`road-major-${animationKey}`}
            x1={r.x1 * MAP} y1={r.y1 * MAP} x2={r.x2 * MAP} y2={r.y2 * MAP}
            stroke="#475569" strokeWidth="2" strokeOpacity=".6" />
          {/* Road name label */}
          {layout.roads?.[i] && (
            <text
              x={r.x1 === 0 ? MAP * .12 : MAP * .44}
              y={r.y1 === r.y2 ? r.y1 * MAP - 10 : r.x1 * MAP - 10}
              fontSize="18" fill="#64748b" fillOpacity=".7"
              fontFamily="system-ui, sans-serif" fontWeight="500"
              transform={r.x1 === r.x2 ? `rotate(-90, ${r.x1 * MAP - 10}, ${MAP * .3})` : undefined}
            >
              {layout.roads[i]}
            </text>
          )}
        </g>
      ))}

      {/* ── Landmarks ── */}
      {landmarks.map((lm, i) => {
        const s = STYLE[
          lm.type === 'school' ? 'residential'
          : lm.type === 'hospital' ? 'commercial'
          : lm.type === 'government' ? 'government'
          : lm.type === 'industry' ? 'industrial'
          : lm.type === 'park' ? 'park'
          : 'mixed'
        ] ?? DEFAULT_STYLE;
        return (
          <g key={lm.name}
            className={`lm-${animationKey}`}
            style={{ animationDelay: `${districts.length * 80 + 600 + i * 60}ms`, transformOrigin: `${lm.px}px ${lm.py}px` }}
          >
            <LandmarkIcon type={lm.type} cx={lm.px} cy={lm.py} color={s.label} />
            <text x={lm.px} y={lm.py + 22} textAnchor="middle"
              fontSize="14" fill={s.label} fillOpacity=".65"
              fontFamily="system-ui, sans-serif" fontWeight="500">
              {lm.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
