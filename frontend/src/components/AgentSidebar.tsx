import { useEffect, useRef, useState } from 'react';
import type { Agent } from '../types';
import type { POI } from '../types';
import { LocationText } from './LocationText';

const BACKEND_WS = 'ws://localhost:8000';

interface AgentSidebarProps {
  agent: Agent;
  onClose: () => void;
  shockLoading: boolean;
  currentShock: string;
  pois?: POI[];
  onPOISpotlight?: (poi: POI) => void;
  simDay?: number;
  simDays?: number;
}

export default function AgentSidebar({ agent, onClose, currentShock, pois, onPOISpotlight, simDay = 0, simDays = 7 }: AgentSidebarProps) {
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

        {/* Section 4: Day-by-day journey timeline — spans full simulation length */}
        {agent.activated && currentShock && simDays > 0 && (
          <div style={{ margin: '0 0 4px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#475569', fontWeight: 700, letterSpacing: '0.08em', padding: '8px 16px 6px' }}>
              {simDays}-Day Timeline
            </div>
            <div style={{ margin: '0 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {(() => {
                const n = agent.total_journey_days;           // 0 = staying home
                const STAY = 2;                               // days at destination
                const startDay = agent.journey_start_day ?? 1;
                const arcEnd = n > 0 ? startDay + n * 2 + STAY - 1 : 0;
                const hasDestination = n > 0 && agent.destination_name;
                const convsByDay: Record<number, typeof agent.conversations_log[0]> = {};
                for (const c of agent.conversations_log ?? []) convsByDay[c.day] = c;

                const destPOI = (agent.destination_name && agent.destination_lat != null && agent.destination_lon != null)
                  ? { name: agent.destination_name, lat: agent.destination_lat, lon: agent.destination_lon, type: 'destination' }
                  : null;

                const DestLink = destPOI && onPOISpotlight
                  ? () => (
                      <span
                        title={`Show ${destPOI.name} on map`}
                        onClick={() => onPOISpotlight(destPOI)}
                        style={{ color: '#818cf8', fontWeight: 600, cursor: 'pointer', borderBottom: '1px dotted rgba(129,140,248,0.55)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#a5b4fc'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#818cf8'; }}
                      >{agent.destination_name}</span>
                    )
                  : () => <span>{agent.destination_name ?? ''}</span>;

                // Flavor text for days when the agent is at home
                const homeLabels = [
                  'Monitoring the situation',
                  'Discussing with neighbors',
                  'Following the news',
                  'Weighing next steps',
                  'Talking to family',
                  'Waiting to see what happens',
                  'Reflecting at home',
                ];

                return Array.from({ length: simDays }, (_, d) => {
                  const day = d + 1;
                  const isCurrent = day === simDay && simDay > 0;
                  const isPast    = day < simDay;
                  const isFuture  = simDay === 0 || day > simDay;
                  const conv      = convsByDay[day];

                  // Journey-relative day (positive only after departure)
                  const jDay = day - startDay + 1;

                  let labelNode: React.ReactNode;
                  if (!hasDestination || day < startDay) {
                    // Before departure or never traveling — rotating home label
                    labelNode = <span>{homeLabels[(day - 1) % homeLabels.length]}</span>;
                  } else if (jDay <= n) {
                    labelNode = jDay === 1
                      ? <><span>Left home → </span><DestLink /></>
                      : <><span>En route to </span><DestLink /></>;
                  } else if (jDay <= n + STAY) {
                    labelNode = jDay === n + 1
                      ? <><span>Arrived at </span><DestLink /></>
                      : <>{agent.movement_intent ? <span>{agent.movement_intent}</span> : <><span>At </span><DestLink /></>}</>;
                  } else if (day <= arcEnd) {
                    labelNode = <span>Heading home</span>;
                  } else {
                    // Back home — rotating flavor
                    labelNode = <span>{homeLabels[(day - 1) % homeLabels.length]}</span>;
                  }

                  return (
                    <div key={day} style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start',
                      opacity: isFuture ? 0.3 : 1,
                      transition: 'opacity 0.3s',
                    }}>
                      {/* Timeline dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 2 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: isCurrent ? '#818cf8' : isPast ? '#334155' : '#1e293b',
                          border: isCurrent ? '2px solid #6366f1' : '2px solid transparent',
                          boxShadow: isCurrent ? '0 0 6px #6366f188' : 'none',
                        }} />
                        {day < simDays && <div style={{ width: 1, height: 14, background: '#1e293b', marginTop: 2 }} />}
                      </div>
                      {/* Content */}
                      <div style={{ paddingBottom: 4, flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 11, color: isCurrent ? '#c7d2fe' : isPast ? '#475569' : '#334155', fontWeight: isCurrent ? 700 : 400, lineHeight: 1.4 }}>
                            {labelNode}
                          </span>
                          <span style={{ fontSize: 9, color: '#334155', flexShrink: 0, marginLeft: 4 }}>D{day}</span>
                        </div>
                        {conv && (
                          <div style={{ marginTop: 3, fontSize: 10, color: '#64748b', fontStyle: 'italic' }}>
                            Met <span style={{ color: '#818cf8', fontStyle: 'normal', fontWeight: 600 }}>{conv.partner_name}</span> — {conv.my_takeaway}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Section 5: People met */}
        {agent.conversations_log && agent.conversations_log.length > 0 && (
          <div style={{ margin: '0 0 4px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#475569', fontWeight: 700, letterSpacing: '0.08em', padding: '8px 16px 6px' }}>
              People met · {agent.conversations_log.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '0 12px' }}>
              {agent.conversations_log.map((conv, i) => (
                <div key={i} style={{ background: '#0d1425', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8' }}>{conv.partner_name}</span>
                      {conv.partner_occupation && (
                        <span style={{ fontSize: 10, color: '#475569', marginLeft: 6 }}>{conv.partner_occupation}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 9, color: '#334155', flexShrink: 0 }}>Day {conv.day}</span>
                  </div>
                  {/* One representative exchange line */}
                  {conv.exchanges?.[0] && (
                    <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', lineHeight: 1.45, marginBottom: 4 }}>
                      <span style={{ color: '#475569', fontStyle: 'normal', fontWeight: 600 }}>{conv.exchanges[0].speaker}: </span>
                      {conv.exchanges[0].line}
                    </div>
                  )}
                  {conv.my_takeaway && (
                    <div style={{ fontSize: 11, color: '#94a3b8', borderTop: '1px solid #1e293b', paddingTop: 5, lineHeight: 1.45 }}>
                      {conv.my_takeaway}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 6: Past shock history (persists across shocks) */}
        <div style={{ margin: '0 0 16px' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#475569', fontWeight: 700, letterSpacing: '0.08em', padding: '8px 16px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
            Past shocks
            {agent.experience_log?.length > 0 && (
              <span style={{ background: 'rgba(99,102,241,0.18)', color: '#818cf8', borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>
                {agent.experience_log.length}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '0 12px' }}>
            {(!agent.experience_log || agent.experience_log.length === 0) ? (
              <div style={{
                border: '1px dashed #1e293b', borderRadius: 7, padding: '10px 12px',
                fontSize: 11, color: '#334155', lineHeight: 1.5, textAlign: 'center',
              }}>
                No previous shocks — history appears here after each simulation completes.
              </div>
            ) : agent.experience_log.slice().reverse().map((exp, i) => (
              <div key={i} style={{
                background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)',
                borderRadius: 7, padding: '8px 11px',
                fontSize: 11, color: '#64748b', lineHeight: 1.5,
              }}>
                {exp}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
