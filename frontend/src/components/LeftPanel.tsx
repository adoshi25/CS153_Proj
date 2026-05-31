import { useState, useMemo, useEffect, useRef } from 'react';
import type { Agent, ShockOption } from '../types';

interface Props {
  shockOptions: ShockOption[];
  shockOptionsLoading: boolean;
  agents: Agent[];
  shockLoading: boolean;
  currentShock: string;
  selectedShockOption: ShockOption | null;
  onShockOptionSelect: (option: ShockOption | null) => void;
  onShockSubmit: (text: string) => void;
  onResetShock: () => void;
  onAgentSelect: (agent: Agent) => void;
  onNewCity: () => void;
}

function stanceColor(stance: 'agree' | 'disagree' | 'neutral'): string {
  if (stance === 'agree') return '#22c55e';
  if (stance === 'disagree') return '#ef4444';
  return '#d4a927';
}

function stanceBg(stance: 'agree' | 'disagree' | 'neutral'): string {
  if (stance === 'agree') return 'rgba(34,197,94,0.12)';
  if (stance === 'disagree') return 'rgba(239,68,68,0.12)';
  return 'rgba(212,169,39,0.12)';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();
}

interface AgentCardProps {
  agent: Agent;
  onSelect: (agent: Agent) => void;
}

function AgentCard({ agent, onSelect }: AgentCardProps) {
  const [hovered, setHovered] = useState(false);
  const stance = (agent.shock_stance ?? 'neutral') as 'agree' | 'disagree' | 'neutral';
  const color = stanceColor(stance);

  return (
    <div
      onClick={() => onSelect(agent)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        padding: '8px 10px',
        borderLeft: `3px solid ${color}`,
        background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.12s',
        borderRadius: '0 6px 6px 0',
        marginBottom: 2,
      }}
    >
      {/* Avatar */}
      <div style={{
        flexShrink: 0,
        width: 28, height: 28, borderRadius: '50%',
        background: stanceBg(stance),
        border: `1px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color,
      }}>
        {getInitials(agent.name)}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{agent.name}</span>
          {agent.occupation && (
            <span style={{ fontSize: 11, color: '#475569' }}>{agent.occupation}</span>
          )}
        </div>
        {agent.shock_rationale && (
          <div style={{
            fontSize: 11, fontStyle: 'italic', color: '#64748b',
            lineHeight: 1.45, marginTop: 2,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {agent.shock_rationale}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeftPanel({
  shockOptions, shockOptionsLoading, agents, shockLoading, currentShock,
  selectedShockOption, onShockOptionSelect, onShockSubmit, onResetShock, onAgentSelect,
  onNewCity,
}: Props) {
  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  const [searchText, setSearchText]   = useState('');
  const [modalOpen, setModalOpen]     = useState(false);
  const [modalText, setModalText]     = useState('');
  const modalTextareaRef              = useRef<HTMLTextAreaElement>(null);

  const hasStances  = agents.some(a => a.shock_stance !== null);
  const showResults = currentShock !== '' && hasStances;

  const forAgents     = agents.filter(a => a.shock_stance === 'agree');
  const againstAgents = agents.filter(a => a.shock_stance === 'disagree');
  const neutralAgents = agents.filter(a => a.shock_stance === 'neutral');
  const totalWithStance = forAgents.length + againstAgents.length + neutralAgents.length;

  // Filter suggestions by search text
  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return shockOptions;
    return shockOptions.filter(o =>
      o.title.toLowerCase().includes(q) || o.description.toLowerCase().includes(q)
    );
  }, [searchText, shockOptions]);

  const isCustom   = searchText.trim().length > 0 && filtered.length === 0;
  const activeText = isCustom
    ? searchText.trim()
    : selectedShockOption?.title ?? '';
  const canInject  = activeText.length > 0;
  const isDisabled = !canInject || shockLoading;

  const handleInject = () => {
    if (isDisabled) return;
    onShockSubmit(activeText);
  };

  const handleSearch = (val: string) => {
    setSearchText(val);
    // Clear card selection when user starts typing
    if (val.trim()) onShockOptionSelect(null);
  };

  useEffect(() => {
    if (modalOpen) {
      setTimeout(() => modalTextareaRef.current?.focus(), 50);
    }
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (modalText.trim()) {
          onShockSubmit(modalText.trim());
          setModalOpen(false);
          setModalText('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, modalText, onShockSubmit]);

  const handleModalInject = () => {
    if (!modalText.trim()) return;
    onShockSubmit(modalText.trim());
    setModalOpen(false);
    setModalText('');
  };

  return (
    <>
      <style>{`
        @keyframes _spin    { to { transform: rotate(360deg); } }
        @keyframes _shimmer { 0%,100%{opacity:0.5} 50%{opacity:1} }
      `}</style>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 300,
        background: 'rgba(10,12,24,0.93)', borderRight: '1px solid #1e293b',
        overflowY: 'auto', zIndex: 20, fontFamily: 'system-ui, sans-serif',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px 11px',
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#6366f1' }}>Society</span>
            <span style={{ color: '#e2e8f0' }}>Sim</span>
          </div>
          <button
            onClick={onNewCity}
            style={{
              background: 'none', border: '1px solid #1e293b', borderRadius: 6,
              color: '#475569', padding: '4px 10px', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#a5b4fc'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#475569'; }}
          >
            ↩ Change City
          </button>
        </div>

        {showResults ? (
          /* ── AFTER SHOCK ──────────────────────────────────────────── */
          <>
            {/* Stats bar */}
            <div style={{ padding: '16px 12px 0' }}>
              {/* Three stat cards */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {([
                  { count: forAgents.length,     label: 'For',     color: '#22c55e', accent: 'rgba(34,197,94,0.18)' },
                  { count: againstAgents.length,  label: 'Against', color: '#ef4444', accent: 'rgba(239,68,68,0.18)' },
                  { count: neutralAgents.length,  label: 'Neutral', color: '#d4a927', accent: 'rgba(212,169,39,0.18)' },
                ] as const).map(({ count, label, color, accent }) => (
                  <div key={label} style={{
                    flex: 1, background: '#0f172a', borderRadius: 8,
                    border: '1px solid #1e293b',
                    padding: '10px 8px 0',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    overflow: 'hidden',
                  }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{count}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3, marginBottom: 8 }}>{label}</div>
                    {/* Accent bar at bottom */}
                    <div style={{ width: '100%', height: 3, background: accent, borderTop: `2px solid ${color}` }} />
                  </div>
                ))}
              </div>

              {/* Segmented progress bar */}
              {totalWithStance > 0 && (
                <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                  {forAgents.length > 0 && (
                    <div style={{ flex: forAgents.length, background: '#22c55e' }} />
                  )}
                  {againstAgents.length > 0 && (
                    <div style={{ flex: againstAgents.length, background: '#ef4444' }} />
                  )}
                  {neutralAgents.length > 0 && (
                    <div style={{ flex: neutralAgents.length, background: '#d4a927' }} />
                  )}
                </div>
              )}
            </div>

            {/* Shock text */}
            <div style={{
              background: 'rgba(30,41,59,0.6)', border: '1px solid #1e293b',
              borderRadius: 6, padding: '6px 10px',
              fontSize: 11, fontStyle: 'italic', color: '#94a3b8',
              margin: '0 12px 12px', lineHeight: 1.45,
            }}>
              {currentShock}
            </div>

            {/* Agent list grouped by stance */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
              {([
                { label: 'For', color: '#22c55e', list: forAgents },
                { label: 'Against', color: '#ef4444', list: againstAgents },
                { label: 'Neutral', color: '#d4a927', list: neutralAgents },
              ] as const).map(({ label, color, list }) =>
                list.length > 0 && (
                  <div key={label} style={{ marginBottom: 10 }}>
                    {/* Section header */}
                    <div style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.08em', color,
                      padding: '4px 10px 6px',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                      {label}
                      <span style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', borderRadius: 10, fontSize: 10, color: '#64748b', padding: '1px 6px' }}>{list.length}</span>
                    </div>
                    {list.map(a => (
                      <AgentCard key={a.id} agent={a} onSelect={onAgentSelect} />
                    ))}
                  </div>
                )
              )}
            </div>

            <div style={{ padding: '4px 12px 14px', flexShrink: 0 }}>
              <button
                onClick={onResetShock}
                style={{
                  background: 'rgba(99,102,241,0.1)', border: '1px solid #4f46e5',
                  color: '#a5b4fc', borderRadius: 8, padding: '11px 14px',
                  fontSize: 12, fontWeight: 700, width: '100%',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.18)')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.1)')}
              >
                ↺ Test a new scenario
              </button>
            </div>
          </>
        ) : (
          /* ── BEFORE SHOCK ─────────────────────────────────────────── */
          <>
            <div style={{ padding: '18px 12px 10px' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 10 }}>
                Inject a Shock
              </div>

              {/* Scenario selection CTA */}
              {!selectedShockOption && !searchText.trim() ? (
                <div style={{
                  background: 'rgba(99,102,241,0.06)',
                  borderLeft: '3px solid #4f46e5',
                  borderRadius: '0 6px 6px 0',
                  padding: '10px 14px',
                  fontSize: 12, color: '#818cf8',
                  marginBottom: 10,
                  lineHeight: 1.5,
                }}>
                  <span style={{ opacity: 0.7 }}>↓</span> Pick a scenario below to
                  inject into the simulation
                </div>
              ) : selectedShockOption ? (
                <div style={{
                  background: 'rgba(34,197,94,0.07)',
                  borderLeft: '3px solid #22c55e',
                  borderRadius: '0 6px 6px 0',
                  padding: '10px 14px',
                  fontSize: 12, color: '#22c55e',
                  marginBottom: 10,
                  lineHeight: 1.5,
                }}>
                  <span>✓</span> {selectedShockOption.title}
                </div>
              ) : null}

              {/* Search / custom input */}
              <div style={{ position: 'relative' }}>
                <svg
                  width="13" height="13" viewBox="0 0 13 13" fill="none"
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                >
                  <circle cx="5.5" cy="5.5" r="4" stroke="#475569" strokeWidth="1.4" />
                  <line x1="8.5" y1="8.5" x2="12" y2="12" stroke="#475569" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <input
                  value={searchText}
                  onChange={e => handleSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && canInject) handleInject(); }}
                  placeholder="Search or type your own shock…"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#0d1425', border: '1px solid #1e293b', borderRadius: 8,
                    padding: '9px 11px 9px 30px', fontSize: 12, color: '#e2e8f0',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#4f46e5')}
                  onBlur={e => (e.target.style.borderColor = '#1e293b')}
                />
                {searchText && (
                  <button
                    onClick={() => { setSearchText(''); onShockOptionSelect(null); }}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
                  >✕</button>
                )}
              </div>
            </div>

            {/* Option list */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '0 12px' }}>
              {shockOptionsLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ height: 13, borderRadius: 4, background: '#1e293b', marginBottom: 6, width: `${60 + (i % 3) * 15}%`, animation: '_shimmer 1.4s ease-in-out infinite' }} />
                      <div style={{ height: 10, borderRadius: 4, background: '#1e293b', width: '90%', animation: '_shimmer 1.4s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
                    </div>
                  ))
                : isCustom
                  ? (
                    /* Custom text card — when search matches nothing */
                    <div
                      onClick={handleInject}
                      style={{
                        background: 'rgba(99,102,241,0.08)', border: '1px solid #6366f1',
                        borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Custom shock</div>
                      <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{searchText.trim()}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>Press Enter or click Inject to use this</div>
                    </div>
                  )
                  : filtered.length === 0
                    ? <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', padding: '24px 0' }}>No matching scenarios</div>
                    : filtered.map(option => {
                        const sel = selectedShockOption?.id === option.id;
                        const hov = hoveredId === option.id;
                        return (
                          <div
                            key={option.id}
                            onClick={() => { onShockOptionSelect(sel ? null : option); setSearchText(''); }}
                            onMouseEnter={() => setHoveredId(option.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            style={{
                              background: sel ? 'rgba(99,102,241,0.08)' : '#0f172a',
                              border: `1px solid ${sel ? '#6366f1' : hov ? '#334155' : '#1e293b'}`,
                              borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                              transition: 'border-color 0.15s, background 0.15s',
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{option.title}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.5 }}>{option.description}</div>
                          </div>
                        );
                      })
              }
            </div>

            {/* Inject button */}
            <div style={{ padding: 12 }}>
              {shockOptionsLoading && (
                <div style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginBottom: 8 }}>
                  Generating scenarios…
                </div>
              )}
              <button
                onClick={() => setModalOpen(true)}
                style={{
                  width: '100%', background: 'transparent',
                  border: '1px dashed #1e293b', borderRadius: 8, padding: '9px 12px',
                  fontSize: 12, color: '#475569',
                  cursor: 'pointer', fontFamily: 'inherit',
                  marginBottom: 8, transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#334155'; (e.currentTarget as HTMLButtonElement).style.color = '#64748b'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e293b'; (e.currentTarget as HTMLButtonElement).style.color = '#475569'; }}
              >
                ＋ Write your own shock
              </button>
              <button
                onClick={handleInject}
                disabled={isDisabled}
                style={{
                  width: '100%', background: isDisabled ? '#1e1b4b' : '#4f46e5',
                  color: isDisabled ? '#6366f1' : '#fff',
                  border: 'none', borderRadius: 8, padding: 12,
                  fontSize: 14, fontWeight: 700,
                  cursor: isDisabled ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.15s',
                }}
              >
                {shockLoading && (
                  <span style={{ width: 12, height: 12, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: '_spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                )}
                {shockLoading ? 'Injecting…' : canInject ? 'Inject Shock →' : 'Select a scenario first'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Custom shock modal */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            backgroundColor: 'rgba(2,8,23,0.72)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 480, maxWidth: '92vw',
              background: '#0b1120', border: '1px solid #334155',
              borderRadius: 14, padding: '24px 24px 20px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Write your own shock</span>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}
              >✕</button>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px', lineHeight: 1.6 }}>
              Describe any policy change, infrastructure event, or disruption that affects this neighborhood.
            </p>
            <textarea
              ref={modalTextareaRef}
              value={modalText}
              onChange={e => setModalText(e.target.value)}
              rows={4}
              placeholder="e.g. The city announces a 20% property tax increase to fund public transit expansion…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0d1425', border: '1px solid #1e293b', borderRadius: 8,
                padding: '9px 11px', fontSize: 13, color: '#e2e8f0',
                outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6,
                marginBottom: 14,
              }}
              onFocus={e => (e.target.style.borderColor = '#4f46e5')}
              onBlur={e => (e.target.style.borderColor = '#1e293b')}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setModalOpen(false); setModalText(''); }}
                style={{
                  background: 'transparent', border: '1px solid #1e293b',
                  borderRadius: 8, padding: '9px 18px', fontSize: 13, color: '#475569',
                  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleModalInject}
                disabled={!modalText.trim()}
                style={{
                  background: modalText.trim() ? '#4f46e5' : '#1e1b4b',
                  color: modalText.trim() ? '#fff' : '#6366f1',
                  border: 'none', borderRadius: 8, padding: '9px 18px',
                  fontSize: 13, fontWeight: 700,
                  cursor: modalText.trim() ? 'pointer' : 'default',
                  fontFamily: 'inherit', transition: 'background 0.15s',
                }}
              >
                Inject Shock →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
