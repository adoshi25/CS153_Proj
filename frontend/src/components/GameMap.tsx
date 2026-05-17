import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent } from '../types';

interface GameMapProps {
  agents: Agent[];
  onAgentSelect: (agent: Agent) => void;
  selectedAgentId: string | null;
}

// The image is 1080x1080. Define what geographic bounding box it covers.
// Agents are clustered around lat 40.730, lon -73.995.
const BOUNDS = {
  latMax: 40.7355,
  latMin: 40.7245,
  lonMin: -74.0010,
  lonMax: -73.9890,
};
const IMG_W = 1080;
const IMG_H = 1080;

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

const INITIAL_ZOOM = 0.85;

export default function GameMap({ agents, onAgentSelect, selectedAgentId }: GameMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const isDragging = useRef(false);
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.agentid) return; // let dot clicks through
    isDragging.current = true;
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setPan({
        x: dragOrigin.current.px + (e.clientX - dragOrigin.current.mx),
        y: dragOrigin.current.py + (e.clientY - dragOrigin.current.my),
      });
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom(z => Math.max(0.3, Math.min(4, z * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isDragging.current ? 'grabbing' : 'grab',
        backgroundColor: '#111827',
        userSelect: 'none',
      }}
    >
      {/* Zoom hint */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '11px',
        color: 'rgba(255,255,255,0.3)',
        zIndex: 5,
        pointerEvents: 'none',
      }}>
        scroll to zoom · drag to pan
      </div>

      {/* Map world — panned and zoomed */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: IMG_W,
        height: IMG_H,
        transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
        transformOrigin: 'center center',
      }}>
        <img
          src="/city-map.png"
          width={IMG_W}
          height={IMG_H}
          draggable={false}
          style={{ display: 'block', imageRendering: 'crisp-edges' }}
          alt="city map"
        />

        {/* Agent dots */}
        {agents.map((agent) => {
          const { x, y } = latLonToPixel(agent.lat, agent.lon);
          const color = sentimentColor(agent.sentiment);
          const isSelected = agent.id === selectedAgentId;
          return (
            <div
              key={agent.id}
              data-agentid={agent.id}
              onClick={(e) => { e.stopPropagation(); onAgentSelect(agent); }}
              title={agent.name}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: isSelected ? 18 : 13,
                height: isSelected ? 18 : 13,
                borderRadius: '50%',
                backgroundColor: color,
                border: isSelected ? '3px solid #fff' : '2px solid rgba(255,255,255,0.8)',
                transform: 'translate(-50%, -50%)',
                cursor: 'pointer',
                zIndex: isSelected ? 20 : 10,
                boxShadow: isSelected
                  ? `0 0 0 3px ${color}55, 0 2px 8px rgba(0,0,0,0.6)`
                  : '0 1px 4px rgba(0,0,0,0.5)',
                transition: 'background-color 0.8s ease, width 0.2s, height 0.2s',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
