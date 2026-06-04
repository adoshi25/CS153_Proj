import { useMemo } from 'react';
import type { POI } from '../types';

export function parseLocText(text: string, pois: POI[]): { text: string; poi: POI | null }[] {
  if (!text || !pois.length) return [{ text, poi: null }];
  const sorted = pois.filter(p => p.name.length > 4).sort((a, b) => b.name.length - a.name.length);
  const segs: { text: string; poi: POI | null }[] = [];
  let pos = 0;
  const lower = text.toLowerCase();
  while (pos < text.length) {
    let best: { idx: number; poi: POI } | null = null;
    for (const poi of sorted) {
      const idx = lower.indexOf(poi.name.toLowerCase(), pos);
      if (idx !== -1 && (best === null || idx < best.idx || (idx === best.idx && poi.name.length > best.poi.name.length)))
        best = { idx, poi };
    }
    if (!best) { segs.push({ text: text.slice(pos), poi: null }); break; }
    if (best.idx > pos) segs.push({ text: text.slice(pos, best.idx), poi: null });
    segs.push({ text: text.slice(best.idx, best.idx + best.poi.name.length), poi: best.poi });
    pos = best.idx + best.poi.name.length;
  }
  return segs;
}

interface LocationTextProps {
  text: string;
  pois: POI[];
  onSpotlight: (poi: POI) => void;
}

export function LocationText({ text, pois, onSpotlight }: LocationTextProps) {
  const segs = useMemo(() => parseLocText(text, pois), [text, pois]);
  return (
    <>
      {segs.map((seg, i) =>
        seg.poi ? (
          <span
            key={i}
            title={`Show ${seg.poi.name} on map`}
            onClick={() => onSpotlight(seg.poi!)}
            style={{ color: '#818cf8', fontWeight: 600, cursor: 'pointer', borderBottom: '1px dotted rgba(129,140,248,0.55)', transition: 'color 0.1s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#a5b4fc'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#818cf8'; }}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}
