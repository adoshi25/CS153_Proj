import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent } from '../types';

interface GameMapProps {
  agents: Agent[];
  onAgentSelect: (agent: Agent) => void;
  selectedAgentId: string | null;
  queryQuestion?: string | null;
  queryLoading?: boolean;
}

const BOUNDS = {
  latMax: 40.7355,
  latMin: 40.7245,
  lonMin: -74.0010,
  lonMax: -73.9890,
};
const IMG_W = 2048;
const IMG_H = 2048;

function latLonToPixel(lat: number, lon: number) {
  const x = ((lon - BOUNDS.lonMin) / (BOUNDS.lonMax - BOUNDS.lonMin)) * IMG_W;
  const y = ((BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin)) * IMG_H;
  return { x, y };
}

function sentimentColor(s: number) {
  if (s <= -0.3) return '#ef4444';
  if (s >= 0.3) return '#22c55e';
  return '#eab308';
}

function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  cw: number,
  ch: number,
): { x: number; y: number } {
  // How far the map extends beyond the container on each side
  const maxX = Math.max(0, (IMG_W * zoom - cw) / 2);
  const maxY = Math.max(0, (IMG_H * zoom - ch) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}

export default function GameMap({ agents, onAgentSelect, selectedAgentId, queryQuestion, queryLoading }: GameMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.5); // will be overridden on mount
  const isDragging = useRef(false);
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // On mount (and resize): cover the container — no blank bars ever
  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const coverZoom = Math.max(width / IMG_W, height / IMG_H);
      setZoom(coverZoom);
      setPan({ x: 0, y: 0 });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const getContainerSize = () => {
    const el = containerRef.current;
    if (!el) return { cw: 800, ch: 800 };
    const r = el.getBoundingClientRect();
    return { cw: r.width, ch: r.height };
  };

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.agentid) return;
    isDragging.current = true;
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const { cw, ch } = getContainerSize();
      const raw = {
        x: dragOrigin.current.px + (e.clientX - dragOrigin.current.mx),
        y: dragOrigin.current.py + (e.clientY - dragOrigin.current.my),
      };
      setPan(prev => clampPan(raw, zoom, cw, ch));
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [zoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { cw, ch } = getContainerSize();
      const minZoom = Math.max(cw / IMG_W, ch / IMG_H); // never zoom out past cover
      setZoom(z => {
        const next = Math.max(minZoom, Math.min(4, z * (e.deltaY < 0 ? 1.1 : 0.9)));
        setPan(p => clampPan(p, next, cw, ch));
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      style={{
        width: '100%', height: '100%', overflow: 'hidden',
        cursor: isDragging.current ? 'grabbing' : 'grab',
        backgroundColor: '#111827', userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Query banner */}
      {queryQuestion && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, backgroundColor: 'rgba(99,102,241,0.92)', borderRadius: 8,
          padding: '8px 16px', maxWidth: '65%', pointerEvents: 'none',
          boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
            Neighborhood Poll
          </div>
          <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, lineHeight: 1.4 }}>
            "{queryQuestion}"
          </div>
        </div>
      )}

      {/* Zoom hint */}
      <div style={{
        position: 'absolute', bottom: 12, right: 16, zIndex: 5, pointerEvents: 'none',
        fontSize: 11, color: 'rgba(255,255,255,0.18)',
      }}>
        scroll to zoom · drag to pan
      </div>

      {/* Map world */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: IMG_W, height: IMG_H,
        transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
        transformOrigin: 'center center',
      }}>
        <img
          src="/city-map.png"
          width={IMG_W} height={IMG_H}
          draggable={false}
          style={{ display: 'block', imageRendering: 'crisp-edges', opacity: 0.4 }}
          alt="city map"
        />

        {/* Agent dots */}
        {agents.map((agent) => {
          const { x, y } = latLonToPixel(agent.lat, agent.lon);
          const color = sentimentColor(agent.sentiment);
          const isSelected = agent.id === selectedAgentId;
          const dotSize = isSelected ? 52 : 38;
          const firstName = agent.name.split(' ')[0];

          return (
            <div
              key={agent.id}
              style={{
                position: 'absolute',
                left: x, top: y,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                zIndex: isSelected ? 20 : 10,
              }}
            >
              {/* Dot wrapper — spin/pulse rings are children so they align perfectly */}
              <div style={{ position: 'relative', width: dotSize, height: dotSize, flexShrink: 0 }}>
                {/* Spinning ring while querying */}
                {queryLoading && (
                  <div style={{
                    position: 'absolute',
                    top: -6, left: -6,
                    width: dotSize + 12, height: dotSize + 12,
                    borderRadius: '50%',
                    border: `3px solid transparent`,
                    borderTopColor: color,
                    borderRightColor: `${color}44`,
                    animation: 'spin 0.85s linear infinite',
                    pointerEvents: 'none',
                  }} />
                )}

                {/* Pulse ring for selected */}
                {isSelected && !queryLoading && (
                  <div style={{
                    position: 'absolute',
                    top: -(dotSize * 0.28), left: -(dotSize * 0.28),
                    width: dotSize * 1.56, height: dotSize * 1.56,
                    borderRadius: '50%',
                    border: `2px solid ${color}`,
                    opacity: 0.5,
                    animation: 'pulse 1.5s ease-out infinite',
                    pointerEvents: 'none',
                  }} />
                )}

                {/* Dot */}
                <div
                  data-agentid={agent.id}
                  onClick={(e) => { e.stopPropagation(); onAgentSelect(agent); }}
                  title={agent.name}
                  style={{
                    width: dotSize, height: dotSize,
                    borderRadius: '50%',
                    background: `radial-gradient(circle at 35% 35%, ${color}ff, ${color}77)`,
                    border: isSelected ? `3px solid #fff` : `2px solid ${color}cc`,
                    cursor: 'pointer',
                    boxShadow: isSelected
                      ? `0 0 0 5px ${color}33, 0 0 24px ${color}aa`
                      : `0 0 16px ${color}66, 0 2px 6px rgba(0,0,0,0.6)`,
                    transition: 'background 0.8s ease, box-shadow 0.8s ease',
                  }}
                />
              </div>

              {/* Name label */}
              <div style={{
                fontSize: isSelected ? 17 : 14,
                color: '#fff',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                letterSpacing: '0.02em',
                backgroundColor: isSelected ? `${color}35` : 'rgba(5,10,20,0.82)',
                padding: '3px 9px',
                borderRadius: 5,
                border: isSelected ? `1px solid ${color}88` : '1px solid rgba(255,255,255,0.14)',
                lineHeight: 1.5,
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              }}>
                {firstName}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%   { transform: scale(1);   opacity: 0.55; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
