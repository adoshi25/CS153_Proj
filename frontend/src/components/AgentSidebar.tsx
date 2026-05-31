import { useEffect, useRef, useState, useMemo } from 'react';
import type { Agent } from '../types';
import type { POI } from '../types';

const BACKEND_WS = 'ws://localhost:8000';

function parseLocText(text: string, pois: POI[]): { text: string; poi: POI | null }[] {
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

function LocationText({ text, pois, onSpotlight }: { text: string; pois: POI[]; onSpotlight: (poi: POI) => void }) {
  const segs = useMemo(() => parseLocText(text, pois), [text, pois]);
  return (
    <>
      {segs.map((seg, i) =>
        seg.poi ? (
          <span key={i} title={`Show ${seg.poi.name} on map`}
            onClick={() => onSpotlight(seg.poi!)}
            style={{ color: '#818cf8', fontWeight: 600, cursor: 'pointer', borderBottom: '1px dotted rgba(129,140,248,0.55)', transition: 'color 0.1s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#a5b4fc'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#818cf8'; }}
          >{seg.text}</span>
        ) : <span key={i}>{seg.text}</span>
      )}
    </>
  );
}

interface AgentSidebarProps {
  agent: Agent;
  onClose: () => void;
  shockLoading: boolean;
  currentShock: string;
  pois?: POI[];
  onPOISpotlight?: (poi: POI) => void;
}

export default function AgentSidebar({ agent, onClose, currentShock, pois, onPOISpotlight }: AgentSidebarProps) {
  const [streamedText, setStreamedText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const agentIdRef = useRef<string | null>(null);

  const [displayedRationale, setDisplayedRationale] = useState('');
  const [rationalePhase, setRationalePhase] = useState<'idle' | 'thinking' | 'typing'>('idle');
  const rationaleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (agent.id === agentIdRef.current) return;
    agentIdRef.current = agent.id;
    wsRef.current?.close();
    setStreamedText('');
    setStreaming(true);

    const ws = new WebSocket(`${BACKEND_WS}/ws/think/${agent.id}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { token?: string; done?: boolean; error?: string };
        if (msg.token) setStreamedText(prev => prev + msg.token);
        if (msg.done || msg.error) setStreaming(false);
      } catch { /* ignore */ }
    };
    ws.onclose = () => setStreaming(false);
    ws.onerror = () => setStreaming(false);
    return () => {
      ws.close();
      agentIdRef.current = null;
    };
  }, [agent.id]);

  // Typewriter effect for rationale — with a visible "thinking" phase before text appears
  useEffect(() => {
    if (rationaleTimerRef.current) clearTimeout(rationaleTimerRef.current);
    setDisplayedRationale('');
    setRationalePhase('idle');
    if (!agent.shock_rationale) return;

    const text = agent.shock_rationale;
    let i = 0;
    const THINKING_MS = 1400; // show "Thinking…" this long before typing begins
    const CHAR_MS = 12;        // ms per character once typing starts

    setRationalePhase('thinking');
    rationaleTimerRef.current = setTimeout(() => {
      setRationalePhase('typing');
      const tick = () => {
        i++;
        setDisplayedRationale(text.slice(0, i));
        if (i < text.length) rationaleTimerRef.current = setTimeout(tick, CHAR_MS);
      };
      tick();
    }, THINKING_MS);

    return () => { if (rationaleTimerRef.current) clearTimeout(rationaleTimerRef.current); };
  }, [agent.id, agent.shock_rationale]);

  const renderShockSection = () => {
    if (!currentShock) return null;

    if (agent.shock_stance === null) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16 }}>
          <span style={{
            display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
            border: '2px solid #1e293b', borderTopColor: '#475569',
            animation: 'agent-spin 0.8s linear infinite', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#475569' }}>Processing response…</span>
        </div>
      );
    }

    const stanceMap = {
      agree:    { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', border: 'rgba(34,197,94,0.3)',   text: 'Agrees' },
      disagree: { bg: 'rgba(239,68,68,0.12)',    color: '#ef4444', border: 'rgba(239,68,68,0.3)',    text: 'Disagrees' },
      neutral:  { bg: 'rgba(212,169,39,0.12)',   color: '#d4a927', border: 'rgba(212,169,39,0.3)',   text: 'Neutral' },
    };
    const stance = stanceMap[agent.shock_stance];

    return (
      <>
        <span style={{
          background: '#1e293b', borderRadius: 6, padding: '4px 10px',
          fontSize: 11, color: '#64748b', margin: '16px 16px 10px', display: 'block',
        }}>
          {currentShock}
        </span>
        <span style={{
          background: stance.bg, color: stance.color, border: `1px solid ${stance.border}`,
          borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700,
          display: 'inline-block', margin: '0 16px 10px',
        }}>
          {stance.text}
        </span>
        {rationalePhase === 'thinking' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 16px', color: '#475569', fontSize: 12 }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
              border: '2px solid #1e293b', borderTopColor: '#6366f1',
              animation: 'agent-spin 0.75s linear infinite',
            }} />
            Thinking…
          </div>
        )}
        {rationalePhase !== 'thinking' && displayedRationale && (
          <p style={{
            fontStyle: 'italic', fontSize: 13, color: '#94a3b8',
            lineHeight: 1.7, padding: '0 16px 16px', margin: 0,
          }}>
            {displayedRationale}
            {rationalePhase === 'typing' && (
              <span style={{ animation: 'agent-blink 0.8s step-end infinite' }}>▋</span>
            )}
          </p>
        )}
      </>
    );
  };

  return (
    <>
      <style>{`
        @keyframes agent-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes agent-spin  { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 300,
        background: 'rgba(10,12,24,0.93)', borderLeft: '1px solid #1e293b',
        overflowY: 'auto', zIndex: 20, fontFamily: 'system-ui, sans-serif',
      }}>
        {/* Section 1: Identity */}
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{agent.name}</span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}
            >✕</button>
          </div>
          {(agent.age || agent.occupation) && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {[agent.age, agent.occupation].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        {agent.bio && (
          <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, padding: '0 16px', margin: '12px 0 0' }}>
            {pois?.length && onPOISpotlight
              ? <LocationText text={agent.bio} pois={pois} onSpotlight={onPOISpotlight} />
              : agent.bio}
          </p>
        )}

        {/* Section 2: Pre-shock — day in my life stream */}
        {!currentShock && (
          <>
            <div style={{
              fontSize: 10, textTransform: 'uppercase', color: '#475569',
              fontWeight: 700, letterSpacing: '0.08em', padding: '16px 16px 8px',
            }}>
              A day in my life
            </div>
            <div style={{
              background: '#0d1425', border: '1px solid #1e293b', borderRadius: 8,
              padding: '12px 14px', margin: '0 12px',
              fontFamily: 'ui-monospace, monospace', fontSize: 12,
              color: '#c7d2fe', lineHeight: 1.6, minHeight: 80,
            }}>
              {pois?.length && onPOISpotlight
                ? <LocationText text={streamedText} pois={pois} onSpotlight={onPOISpotlight} />
                : streamedText}
              {streaming && <span style={{ animation: 'agent-blink 0.8s step-end infinite' }}>▋</span>}
            </div>
          </>
        )}

        {/* Section 2b: Post-shock — raw agent data */}
        {currentShock && (
          <>
            <div style={{
              fontSize: 10, textTransform: 'uppercase', color: '#475569',
              fontWeight: 700, letterSpacing: '0.08em', padding: '16px 16px 8px',
            }}>
              Agent data
            </div>
            <div style={{
              background: '#0d1425', border: '1px solid #1e293b', borderRadius: 8,
              padding: '12px 14px', margin: '0 12px',
              fontFamily: 'ui-monospace, monospace', fontSize: 11,
              color: '#64748b', lineHeight: 1.7,
            }}>
              {[
                ['id',          agent.id],
                ['age',         agent.age ?? '—'],
                ['occupation',  agent.occupation ?? '—'],
                ['lat',         agent.lat?.toFixed(5)],
                ['lon',         agent.lon?.toFixed(5)],
                ['stance',      agent.shock_stance ?? 'pending…'],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <span style={{ color: '#334155' }}>"</span>
                  <span style={{ color: '#818cf8' }}>{k}</span>
                  <span style={{ color: '#334155' }}>"</span>
                  <span style={{ color: '#475569' }}>: </span>
                  <span style={{ color: '#94a3b8' }}>"{v}"</span>
                  <span style={{ color: '#334155' }}>,</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Section 3: Shock response */}
        {renderShockSection()}
      </div>
    </>
  );
}
