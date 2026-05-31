import { useState, useEffect, useRef } from 'react';
import type { CityLayout, CityDistrict, CityLandmark } from '../types';

const MAP = 2048;
const SCAN_DURATION_MS = 2400;

type Rect = { x: number; y: number; w: number; h: number };

// ── Zone slot templates (normalized 0–1) ────────────────────────────────────
const SLOTS: Record<string, Rect[]> = {
  park:        [{ x: .01, y: .01, w: .25, h: .33 }, { x: .74, y: .01, w: .25, h: .33 }],
  government:  [{ x: .38, y: .37, w: .24, h: .22 }],
  commercial:  [{ x: .08, y: .42, w: .28, h: .18 }, { x: .64, y: .42, w: .28, h: .18 }],
  industrial:  [{ x: .01, y: .67, w: .27, h: .31 }, { x: .72, y: .67, w: .27, h: .31 }],
  residential: [{ x: .01, y: .34, w: .09, h: .32 }, { x: .90, y: .34, w: .09, h: .32 }, { x: .29, y: .67, w: .41, h: .31 }],
  mixed:       [{ x: .27, y: .01, w: .46, h: .31 }],
};

// ── Color palette per district type ─────────────────────────────────────────
const STYLE: Record<string, { fill: string; stroke: string; label: string; accent: string }> = {
  park:        { fill: '#021a0d', stroke: '#15803d', label: '#4ade80', accent: '#166534' },
  government:  { fill: '#0d0b2e', stroke: '#4338ca', label: '#a5b4fc', accent: '#3730a3' },
  commercial:  { fill: '#021b18', stroke: '#0d9488', label: '#2dd4bf', accent: '#0f766e' },
  industrial:  { fill: '#1a0800', stroke: '#b45309', label: '#fbbf24', accent: '#92400e' },
  residential: { fill: '#050e24', stroke: '#1d4ed8', label: '#93c5fd', accent: '#1e40af' },
  mixed:       { fill: '#0f0620', stroke: '#7c3aed', label: '#c4b5fd', accent: '#6d28d9' },
};
const DEFAULT_STYLE = STYLE.mixed;

// ── Road backbone (normalized 0–1) ──────────────────────────────────────────
const MAJOR_ROADS = [
  { x1: 0, y1: .40, x2: 1, y2: .40, vertical: false },
  { x1: .37, y1: 0, x2: .37, y2: 1, vertical: true },
];
const MINOR_ROADS = [
  { x1: 0, y1: .20, x2: 1, y2: .20, vertical: false },
  { x1: 0, y1: .65, x2: 1, y2: .65, vertical: false },
  { x1: .16, y1: 0, x2: .16, y2: 1, vertical: true },
  { x1: .63, y1: 0, x2: .63, y2: 1, vertical: true },
];

// ── Landmark placement zones ──────────────────────────────────────────────
const LM_HOME: Record<string, Rect> = {
  school:     { x: .29, y: .67, w: .41, h: .31 },
  hospital:   { x: .08, y: .42, w: .28, h: .18 },
  government: { x: .38, y: .37, w: .24, h: .22 },
  industry:   { x: .01, y: .67, w: .27, h: .31 },
  business:   { x: .64, y: .42, w: .28, h: .18 },
  community:  { x: .27, y: .01, w: .46, h: .31 },
  park:       { x: .01, y: .01, w: .25, h: .33 },
  transit:    { x: .08, y: .38, w: .56, h: .04 },
  other:      { x: .27, y: .01, w: .46, h: .31 },
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
interface PlacedDistrict extends CityDistrict { rect: Rect; seed: string }
interface PlacedLandmark extends CityLandmark { px: number; py: number }

function buildLayout(layout: CityLayout, seed: string) {
  const rand = seededRand(seed);
  const usage: Record<string, number> = {};
  const jitter = () => (rand() - 0.5) * 0.04;

  const districts: PlacedDistrict[] = layout.districts.map((d, i) => {
    const type = d.type in SLOTS ? d.type : 'mixed';
    const slots = SLOTS[type];
    const idx = usage[type] ?? 0;
    usage[type] = idx + 1;
    const base = slots[idx % slots.length];
    return {
      ...d,
      seed: seed + i,
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

// ── District interior content ─────────────────────────────────────────────────
function ParkInterior({ rx, ry, rw, rh, rand }: { rx:number; ry:number; rw:number; rh:number; rand:()=>number }) {
  const trees = Array.from({ length: 18 }, (_) => ({
    cx: rx + 0.08 * rw + rand() * rw * 0.84,
    cy: ry + 0.08 * rh + rand() * rh * 0.64,
    r: 9 + rand() * 14,
    shade: rand() > 0.5,
  }));
  const pondCx = rx + rw * (0.3 + rand() * 0.35);
  const pondCy = ry + rh * (0.35 + rand() * 0.25);
  const pondRx = rw * 0.11, pondRy = rh * 0.08;
  const pathX1 = rx + rw * 0.05, pathY1 = ry + rh * 0.75;
  const pathX2 = rx + rw * 0.45, pathY2 = ry + rh * 0.45;
  const pathX3 = rx + rw * 0.9, pathY3 = ry + rh * 0.6;

  return (
    <>
      {/* Pond */}
      <ellipse cx={pondCx} cy={pondCy} rx={pondRx} ry={pondRy} fill="#0c4a6e" fillOpacity="0.55" />
      <ellipse cx={pondCx - pondRx * 0.1} cy={pondCy - pondRy * 0.2} rx={pondRx * 0.7} ry={pondRy * 0.6}
        fill="#0369a1" fillOpacity="0.25" />
      {/* Walking path */}
      <path d={`M ${pathX1} ${pathY1} Q ${pathX2} ${pathY2} ${pathX3} ${pathY3}`}
        stroke="#a3e635" strokeWidth="4" fill="none" strokeOpacity="0.3" strokeDasharray="12 6" strokeLinecap="round" />
      {/* Trees */}
      {trees.map((t, i) => (
        <g key={i}>
          <circle cx={t.cx} cy={t.cy} r={t.r} fill={t.shade ? '#14532d' : '#166534'} fillOpacity="0.55" />
          <circle cx={t.cx - t.r * 0.2} cy={t.cy - t.r * 0.2} r={t.r * 0.45}
            fill="#15803d" fillOpacity="0.3" />
        </g>
      ))}
      {/* Bench dots */}
      {[0.2, 0.6, 0.8].map((pos, i) => (
        <rect key={i} x={rx + rw * pos - 6} y={ry + rh * 0.82} width={12} height={4}
          fill="#4ade80" fillOpacity="0.3" rx="1" />
      ))}
    </>
  );
}

function ResidentialInterior({ rx, ry, rw, rh, rand }: { rx:number; ry:number; rw:number; rh:number; rand:()=>number }) {
  const cols = Math.min(5, Math.floor(rw / 50));
  const rows = Math.min(4, Math.floor(rh / 55));
  if (cols < 1 || rows < 1) return null;
  const cw = (rw * 0.9) / cols;
  const ch = (rh * 0.82) / rows;

  return (
    <>
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => {
          const hx = rx + rw * 0.05 + cw * col + cw * 0.5;
          const hy = ry + rh * 0.08 + ch * row + ch * 0.5;
          const hw = cw * 0.55, hh = ch * 0.42;
          const roofH = hh * 0.45;
          const hasLight = rand() > 0.5;
          return (
            <g key={`${row}-${col}`}>
              {/* Shadow */}
              <rect x={hx - hw / 2 + 3} y={hy + 3} width={hw} height={hh}
                fill="#000" fillOpacity="0.25" rx="1" />
              {/* Body */}
              <rect x={hx - hw / 2} y={hy} width={hw} height={hh}
                fill="#1e3a8a" fillOpacity="0.45" rx="1" />
              {/* Roof */}
              <polygon
                points={`${hx - hw / 2 - 3},${hy} ${hx + hw / 2 + 3},${hy} ${hx},${hy - roofH}`}
                fill="#1d4ed8" fillOpacity="0.45"
              />
              {/* Window */}
              <rect x={hx - hw * 0.18} y={hy + hh * 0.28} width={hw * 0.36} height={hh * 0.32}
                fill={hasLight ? '#bfdbfe' : '#1e40af'} fillOpacity={hasLight ? '0.6' : '0.3'} rx="1" />
              {/* Door */}
              <rect x={hx - hw * 0.1} y={hy + hh * 0.62} width={hw * 0.2} height={hh * 0.38}
                fill="#1d4ed8" fillOpacity="0.5" rx="1" />
            </g>
          );
        })
      )}
    </>
  );
}

function CommercialInterior({ rx, ry, rw, rh, rand }: { rx:number; ry:number; rw:number; rh:number; rand:()=>number }) {
  const count = Math.max(4, Math.min(8, Math.floor(rw / 55)));
  const bw = (rw * 0.88) / count;

  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const bh = rh * (0.3 + rand() * 0.55);
        const bx = rx + rw * 0.06 + bw * i;
        const by = ry + rh - bh - rh * 0.04;
        const floors = Math.max(2, Math.floor(bh / 28));
        const floorH = bh / (floors + 0.5);
        const lit = rand() > 0.35;

        return (
          <g key={i}>
            {/* Shadow */}
            <rect x={bx + bw * 0.05 + 4} y={by + 4} width={bw * 0.82} height={bh}
              fill="#000" fillOpacity="0.3" rx="2" />
            {/* Body */}
            <rect x={bx + bw * 0.05} y={by} width={bw * 0.82} height={bh}
              fill="#134e4a" fillOpacity="0.5" rx="2" />
            {/* Roof lip */}
            <rect x={bx + bw * 0.03} y={by} width={bw * 0.86} height={Math.max(4, rh * 0.03)}
              fill="#0f766e" fillOpacity="0.6" rx="2" />
            {/* Windows grid */}
            {Array.from({ length: Math.min(floors, 7) }, (_, f) =>
              [0.18, 0.55].map((wx, wi) => (
                <rect key={`${f}-${wi}`}
                  x={bx + bw * 0.05 + bw * 0.82 * wx}
                  y={by + floorH * (f + 0.25)}
                  width={bw * 0.22}
                  height={Math.max(5, floorH * 0.45)}
                  fill={lit ? '#5eead4' : '#0d9488'}
                  fillOpacity={lit ? '0.65' : '0.25'}
                  rx="1"
                />
              ))
            )}
          </g>
        );
      })}
    </>
  );
}

function IndustrialInterior({ rx, ry, rw, rh }: { rx:number; ry:number; rw:number; rh:number }) {
  return (
    <>
      {/* Two large warehouses */}
      {[0, 1].map(i => {
        const wx = rx + rw * (0.04 + i * 0.48);
        const ww = rw * 0.44, wh = rh * 0.48;
        const wy = ry + rh * 0.35;
        return (
          <g key={i}>
            <rect x={wx + 4} y={wy + 4} width={ww} height={wh} fill="#000" fillOpacity="0.3" rx="3" />
            <rect x={wx} y={wy} width={ww} height={wh} fill="#78350f" fillOpacity="0.45" rx="3" />
            {/* Roof ridgeline */}
            <line x1={wx} y1={wy + wh * 0.18} x2={wx + ww} y2={wy + wh * 0.18}
              stroke="#b45309" strokeWidth="2" strokeOpacity="0.4" />
            {/* Loading dock */}
            <rect x={wx + ww * 0.3} y={wy + wh * 0.65} width={ww * 0.35} height={wh * 0.35}
              fill="#451a03" fillOpacity="0.6" rx="2" />
          </g>
        );
      })}
      {/* Silos */}
      {[0.15, 0.44, 0.73].map((pos, i) => (
        <g key={i}>
          <ellipse cx={rx + rw * pos} cy={ry + rh * 0.27} rx={rw * 0.055} ry={rh * 0.06}
            fill="#b45309" fillOpacity="0.5" />
          <rect x={rx + rw * pos - rw * 0.055} y={ry + rh * 0.27} width={rw * 0.11} height={rh * 0.2}
            fill="#92400e" fillOpacity="0.5" />
        </g>
      ))}
      {/* Chimney stack */}
      <rect x={rx + rw * 0.82} y={ry + rh * 0.08} width={rw * 0.04} height={rh * 0.35}
        fill="#78350f" fillOpacity="0.7" />
      <ellipse cx={rx + rw * 0.84} cy={ry + rh * 0.08} rx={rw * 0.04} ry={rh * 0.025}
        fill="#451a03" fillOpacity="0.8" />
    </>
  );
}

function GovernmentInterior({ rx, ry, rw, rh }: { rx:number; ry:number; rw:number; rh:number }) {
  const bw = rw * 0.52, bh = rh * 0.55;
  const bx = rx + (rw - bw) / 2, by = ry + rh * 0.22;
  const colCount = 6;
  const colSpacing = bw / (colCount + 1);

  return (
    <>
      {/* Plaza */}
      <rect x={bx - bw * 0.18} y={by + bh * 0.88} width={bw * 1.36} height={rh * 0.15}
        fill="#4338ca" fillOpacity="0.12" />
      {/* Steps */}
      {[0, 1, 2].map(s => (
        <rect key={s}
          x={bx - bw * 0.06 - s * 6} y={by + bh * 0.88 - s * 5}
          width={bw * 1.12 + s * 12} height={6}
          fill="#4f46e5" fillOpacity="0.25 - s * 0.05" rx="1" />
      ))}
      {/* Building body */}
      <rect x={bx + 4} y={by + bh * 0.14 + 4} width={bw} height={bh * 0.74}
        fill="#000" fillOpacity="0.3" rx="2" />
      <rect x={bx} y={by + bh * 0.14} width={bw} height={bh * 0.74}
        fill="#1e1b4b" fillOpacity="0.55" rx="2" />
      {/* Columns */}
      {Array.from({ length: colCount }, (_, i) => (
        <rect key={i}
          x={bx + colSpacing * (i + 1) - 4} y={by + bh * 0.12}
          width={8} height={bh * 0.76}
          fill="#4f46e5" fillOpacity="0.4" rx="1" />
      ))}
      {/* Pediment */}
      <polygon
        points={`${bx - 6},${by + bh * 0.16} ${bx + bw + 6},${by + bh * 0.16} ${bx + bw / 2},${by}`}
        fill="#4338ca" fillOpacity="0.5"
      />
      {/* Windows in body */}
      {[0.2, 0.5, 0.8].map((wx, i) =>
        [0.3, 0.58].map((wy, j) => (
          <rect key={`${i}-${j}`}
            x={bx + bw * wx - bw * 0.06} y={by + bh * wy}
            width={bw * 0.12} height={bh * 0.12}
            fill="#a5b4fc" fillOpacity="0.4" rx="1" />
        ))
      )}
      {/* Flagpole */}
      <line x1={bx + bw / 2} y1={by - rh * 0.06} x2={bx + bw / 2} y2={by}
        stroke="#818cf8" strokeWidth="2.5" strokeOpacity="0.7" />
      <polygon
        points={`${bx + bw / 2},${by - rh * 0.06} ${bx + bw / 2 + rw * 0.06},${by - rh * 0.035} ${bx + bw / 2},${by - rh * 0.01}`}
        fill="#f87171" fillOpacity="0.65"
      />
    </>
  );
}

function MixedInterior({ rx, ry, rw, rh, rand }: { rx:number; ry:number; rw:number; rh:number; rand:()=>number }) {
  const count = Math.max(3, Math.min(6, Math.floor(rw / 80)));
  const bw = (rw * 0.9) / count;

  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const isResidential = rand() > 0.55;
        const bh = isResidential
          ? rh * (0.22 + rand() * 0.2)
          : rh * (0.35 + rand() * 0.4);
        const bx = rx + rw * 0.05 + bw * i;
        const by = ry + rh - bh - rh * 0.04;
        const floors = Math.max(1, Math.floor(bh / 32));
        const floorH = bh / (floors + 0.5);

        return (
          <g key={i}>
            <rect x={bx + bw * 0.05 + 3} y={by + 3} width={bw * 0.82} height={bh}
              fill="#000" fillOpacity="0.3" rx="2" />
            <rect x={bx + bw * 0.05} y={by} width={bw * 0.82} height={bh}
              fill={isResidential ? '#1e3a8a' : '#2d1b69'} fillOpacity="0.45" rx="2" />
            {isResidential && (
              <polygon
                points={`${bx + bw * 0.03},${by} ${bx + bw * 0.9},${by} ${bx + bw * 0.47},${by - bh * 0.35}`}
                fill="#3b0764" fillOpacity="0.4"
              />
            )}
            {Array.from({ length: Math.min(floors, 5) }, (_, f) =>
              [0.2, 0.58].map((wx, wi) => (
                <rect key={`${f}-${wi}`}
                  x={bx + bw * 0.05 + bw * 0.82 * wx}
                  y={by + floorH * (f + 0.3)}
                  width={bw * 0.18}
                  height={Math.max(5, floorH * 0.38)}
                  fill={rand() > 0.4 ? '#c4b5fd' : '#7c3aed'}
                  fillOpacity="0.4"
                  rx="1"
                />
              ))
            )}
          </g>
        );
      })}
    </>
  );
}

// ── District renderer (picks interior by type) ────────────────────────────────
function DistrictGroup({ d, ak }: { d: PlacedDistrict; ak: number }) {
  const s = STYLE[d.type] ?? DEFAULT_STYLE;
  const r = d.rect;
  const rand = seededRand(d.seed);
  const rx = r.x * MAP, ry = r.y * MAP;
  const rw = r.w * MAP, rh = r.h * MAP;
  const cx = rx + rw / 2, cy = ry + rh / 2;
  const fontSize = Math.max(14, Math.min(26, rw / 9));

  return (
    <g>
      {/* Base fill */}
      <rect x={rx} y={ry} width={rw} height={rh} rx="12" fill={s.fill} fillOpacity="0.88" />
      {/* Interior content */}
      <clipPath id={`clip-d-${ak}-${d.name.replace(/\s/g, '')}`}>
        <rect x={rx + 4} y={ry + 4} width={rw - 8} height={rh - 8} rx="10" />
      </clipPath>
      <g clipPath={`url(#clip-d-${ak}-${d.name.replace(/\s/g, '')})`}>
        {d.type === 'park'        && <ParkInterior       rx={rx} ry={ry} rw={rw} rh={rh} rand={rand} />}
        {d.type === 'residential' && <ResidentialInterior rx={rx} ry={ry} rw={rw} rh={rh} rand={rand} />}
        {d.type === 'commercial'  && <CommercialInterior  rx={rx} ry={ry} rw={rw} rh={rh} rand={rand} />}
        {d.type === 'industrial'  && <IndustrialInterior  rx={rx} ry={ry} rw={rw} rh={rh} />}
        {d.type === 'government'  && <GovernmentInterior  rx={rx} ry={ry} rw={rw} rh={rh} />}
        {(d.type === 'mixed' || !(d.type in STYLE)) && <MixedInterior rx={rx} ry={ry} rw={rw} rh={rh} rand={rand} />}
      </g>
      {/* Border */}
      <rect x={rx} y={ry} width={rw} height={rh} rx="12" fill="none"
        stroke={s.stroke} strokeWidth="1.8" strokeOpacity="0.55" />
      {/* Top highlight */}
      <rect x={rx + 2} y={ry + 2} width={rw - 4} height={Math.min(36, rh * 0.14)} rx="10"
        fill="white" fillOpacity="0.025" />
      {/* Label on semi-transparent pill */}
      <rect x={cx - fontSize * 2.4} y={cy - fontSize * 0.8} width={fontSize * 4.8} height={fontSize * 1.7}
        fill={s.fill} fillOpacity="0.75" rx="6" />
      <text x={cx} y={cy + fontSize * 0.12}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize} fontWeight="700" fill={s.label} fillOpacity="0.85"
        fontFamily="ui-monospace, 'Courier New', monospace" letterSpacing="0.04em">
        {d.name.toUpperCase()}
      </text>
      {/* Type sub-label */}
      <text x={cx} y={cy + fontSize * 0.95}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={Math.max(10, fontSize * 0.52)} fontWeight="400"
        fill={s.label} fillOpacity="0.4"
        fontFamily="ui-monospace, 'Courier New', monospace" letterSpacing="0.08em">
        [{d.type.toUpperCase()}]
      </text>
    </g>
  );
}

// ── Road renderer ─────────────────────────────────────────────────────────────
function Road({ road, isMajor, label, ak }: {
  road: { x1:number; y1:number; x2:number; y2:number; vertical:boolean };
  isMajor: boolean;
  label?: string;
  ak: number;
}) {
  const x1 = road.x1 * MAP, y1 = road.y1 * MAP;
  const x2 = road.x2 * MAP, y2 = road.y2 * MAP;
  const roadW = isMajor ? 10 : 6;
  const sidewalkW = isMajor ? 16 : 10;
  const id = `road-${ak}-${Math.round(x1)}-${Math.round(y1)}`;
  const dashLen = road.vertical ? MAP : MAP;

  const labelX = road.vertical
    ? x1 + 14
    : (x1 + x2) * 0.12;
  const labelY = road.vertical
    ? (y1 + y2) * 0.22
    : y1 - 8;
  const labelRot = road.vertical ? `rotate(-90, ${labelX}, ${labelY})` : undefined;

  return (
    <g>
      {/* Sidewalk strip */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#1e293b" strokeWidth={sidewalkW} />
      {/* Road body */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={isMajor ? '#0f172a' : '#0d1117'} strokeWidth={roadW}
        strokeDasharray={dashLen} strokeDashoffset={dashLen}
        id={id}
      />
      <style>{`
        #${id} {
          animation: roadReveal-${id} 0.8s ease forwards;
          animation-delay: 0ms;
        }
        @keyframes roadReveal-${id} {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
      {/* Center line */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={isMajor ? '#334155' : '#1e293b'}
        strokeWidth={isMajor ? 1.5 : 1}
        strokeDasharray={isMajor ? '18 10' : '12 8'}
        strokeOpacity="0.7"
      />
      {/* Glow for major roads */}
      {isMajor && (
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#3b82f6" strokeWidth="22" strokeOpacity="0.04"
          strokeLinecap="round"
        />
      )}
      {/* Road name */}
      {label && (
        <text x={labelX} y={labelY}
          textAnchor="middle"
          fontSize={isMajor ? 19 : 14}
          fill={isMajor ? '#475569' : '#334155'}
          fillOpacity="0.8"
          fontFamily="ui-monospace, 'Courier New', monospace"
          fontWeight="500"
          transform={labelRot}
        >
          {label}
        </text>
      )}
    </g>
  );
}

// ── Landmark icon + halo ──────────────────────────────────────────────────────
function LandmarkMarker({ lm, ak }: { lm: PlacedLandmark; ak: number }) {
  const styleMap: Record<string, string> = {
    school: '#93c5fd', hospital: '#f87171', government: '#a5b4fc',
    industry: '#fbbf24', business: '#2dd4bf', community: '#4ade80',
    park: '#86efac', transit: '#fde68a', other: '#c4b5fd',
  };
  const color = styleMap[lm.type] ?? '#c4b5fd';
  const r = 13;
  const id = `lm-${ak}-${lm.name.replace(/\s/g, '')}`;

  return (
    <g id={id}>
      <style>{`
        #${id} {
          opacity: 0;
          animation: lmAppear-${id} 0.4s ease forwards;
        }
        @keyframes lmAppear-${id} {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      {/* Outer halo */}
      <circle cx={lm.px} cy={lm.py} r={r * 2.8} fill={color} fillOpacity="0.06" />
      <circle cx={lm.px} cy={lm.py} r={r * 1.8} fill={color} fillOpacity="0.1" />
      {/* Icon */}
      {lm.type === 'hospital' && <>
        <circle cx={lm.px} cy={lm.py} r={r} fill={color} fillOpacity="0.25" />
        <rect x={lm.px - r * 0.65} y={lm.py - r * 0.22} width={r * 1.3} height={r * 0.44}
          fill={color} fillOpacity="0.85" rx="1" />
        <rect x={lm.px - r * 0.22} y={lm.py - r * 0.65} width={r * 0.44} height={r * 1.3}
          fill={color} fillOpacity="0.85" rx="1" />
      </>}
      {lm.type === 'school' && <>
        <rect x={lm.px - r} y={lm.py - r * 0.7} width={r * 2} height={r * 1.4}
          fill={color} fillOpacity="0.25" rx="2" />
        <rect x={lm.px - r * 0.7} y={lm.py - r * 0.7} width={r * 1.4} height={r * 1.0}
          fill={color} fillOpacity="0.7" rx="1" />
        <polygon points={`${lm.px - r},${lm.py - r * 0.7} ${lm.px + r},${lm.py - r * 0.7} ${lm.px},${lm.py - r * 1.4}`}
          fill={color} fillOpacity="0.6" />
      </>}
      {lm.type === 'government' && <>
        <polygon points={`${lm.px},${lm.py - r * 1.3} ${lm.px + r * 1.2},${lm.py + r * 0.7} ${lm.px - r * 1.2},${lm.py + r * 0.7}`}
          fill={color} fillOpacity="0.7" />
        <polygon points={`${lm.px},${lm.py - r * 1.3} ${lm.px + r * 1.2},${lm.py + r * 0.7} ${lm.px - r * 1.2},${lm.py + r * 0.7}`}
          fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.5" />
      </>}
      {(lm.type === 'park' || lm.type === 'community') && (
        <circle cx={lm.px} cy={lm.py} r={r} fill={color} fillOpacity="0.7" />
      )}
      {(lm.type === 'industry' || lm.type === 'business' || lm.type === 'transit') && (
        <polygon points={`${lm.px},${lm.py - r} ${lm.px + r},${lm.py} ${lm.px},${lm.py + r} ${lm.px - r},${lm.py}`}
          fill={color} fillOpacity="0.7" />
      )}
      {!['hospital','school','government','park','community','industry','business','transit'].includes(lm.type) && (
        <circle cx={lm.px} cy={lm.py} r={r * 0.8} fill={color} fillOpacity="0.7" />
      )}
      {/* Outer ring */}
      <circle cx={lm.px} cy={lm.py} r={r * 1.35} fill="none"
        stroke={color} strokeWidth="1.5" strokeOpacity="0.4" />
      {/* Label */}
      <text x={lm.px} y={lm.py + r * 2.2}
        textAnchor="middle"
        fontSize="15" fontWeight="600" fill={color} fillOpacity="0.8"
        fontFamily="ui-monospace, 'Courier New', monospace"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}
      >
        {lm.name}
      </text>
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  layout: CityLayout;
  neighborhoodName: string;
  animationKey: number;
}

export default function ProceduralCityMap({ layout, neighborhoodName, animationKey }: Props) {
  const [scanPct, setScanPct] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setScanPct(0);
    startRef.current = null;
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const pct = Math.min(1, (ts - startRef.current) / SCAN_DURATION_MS);
      setScanPct(pct);
      if (pct < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animationKey]);

  const { districts, landmarks } = buildLayout(layout, neighborhoodName + animationKey);
  const scanX = scanPct * MAP;
  const ak = animationKey;

  return (
    <svg
      width={MAP} height={MAP}
      viewBox={`0 0 ${MAP} ${MAP}`}
      style={{ display: 'block', opacity: 0.9 }}
    >
      <defs>
        {/* Dot grid */}
        <pattern id={`grid-${ak}`} width="64" height="64" patternUnits="userSpaceOnUse">
          {[0, 64].flatMap(cx => [0, 64].map(cy =>
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.2" fill="#1e293b" />
          ))}
        </pattern>
        {/* Clip to revealed (scanned) area */}
        <clipPath id={`scan-clip-${ak}`}>
          <rect x={0} y={0} width={scanX} height={MAP} />
        </clipPath>
        {/* Scan beam glow */}
        <filter id={`beam-glow-${ak}`} x="-200%" y="-5%" width="500%" height="110%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* ── Background (always visible) ── */}
      <rect width={MAP} height={MAP} fill="#060b18" />
      <rect width={MAP} height={MAP} fill={`url(#grid-${ak})`} opacity="0.6" />

      {/* ── Everything below clipped to scan progress ── */}
      <g clipPath={`url(#scan-clip-${ak})`}>

        {/* Minor roads (bottom layer) */}
        {MINOR_ROADS.map((r, i) => (
          <Road key={i} road={r} isMajor={false}
            label={layout.roads?.[i + MAJOR_ROADS.length]}
            ak={ak}
          />
        ))}

        {/* Districts */}
        {districts.map(d => (
          <DistrictGroup key={d.name} d={d} ak={ak} />
        ))}

        {/* Major roads (on top of districts) */}
        {MAJOR_ROADS.map((r, i) => (
          <Road key={i} road={r} isMajor={true}
            label={layout.roads?.[i]}
            ak={ak}
          />
        ))}

        {/* Landmarks */}
        {landmarks.map(lm => (
          <LandmarkMarker key={lm.name} lm={lm} ak={ak} />
        ))}

        {/* Neighborhood title */}
        <text x={MAP * 0.5} y={MAP * 0.965}
          textAnchor="middle"
          fontSize="28" fontWeight="700"
          fill="#334155" fillOpacity="0.7"
          fontFamily="ui-monospace, 'Courier New', monospace"
          letterSpacing="0.12em"
        >
          {neighborhoodName.toUpperCase()}
        </text>

      </g>

      {/* ── Scan beam (always on top) ── */}
      {scanPct > 0 && scanPct < 1 && (
        <>
          {/* Wide soft glow */}
          <rect x={scanX - 30} y={0} width={60} height={MAP}
            fill="#38bdf8" fillOpacity="0.04"
            filter={`url(#beam-glow-${ak})`}
          />
          {/* Beam core */}
          <line x1={scanX} y1={0} x2={scanX} y2={MAP}
            stroke="#38bdf8" strokeWidth="2.5" strokeOpacity="0.75"
          />
          {/* Bright leading edge */}
          <line x1={scanX} y1={0} x2={scanX} y2={MAP}
            stroke="white" strokeWidth="1" strokeOpacity="0.35"
          />
          {/* Scan progress label */}
          <rect x={scanX + 6} y={MAP * 0.5 - 14} width={90} height={26}
            fill="#0c1a2e" fillOpacity="0.85" rx="4" />
          <text x={scanX + 51} y={MAP * 0.5 + 5}
            textAnchor="middle"
            fontSize="13" fill="#38bdf8" fillOpacity="0.9"
            fontFamily="ui-monospace, 'Courier New', monospace"
          >
            {Math.round(scanPct * 100)}% SCANNED
          </text>
        </>
      )}

      {/* ── Completion flash ── */}
      {scanPct >= 1 && (
        <style>{`
          @keyframes completionFlash-${ak} {
            0%   { opacity: 0.35; }
            100% { opacity: 0; }
          }
          .completion-flash-${ak} {
            animation: completionFlash-${ak} 0.6s ease forwards;
          }
        `}</style>
      )}
      {scanPct >= 1 && (
        <rect width={MAP} height={MAP}
          fill="#38bdf8" fillOpacity="0.08"
          className={`completion-flash-${ak}`}
        />
      )}
    </svg>
  );
}
