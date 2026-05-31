import { useState } from 'react';
import type { NarrativeEntry, QueryResult, QueryGroup, CounterfactualResult } from '../types';
import NarrativeFeed from './NarrativeFeed';
import SentimentChart from './SentimentChart';
import CounterfactualPanel from './CounterfactualPanel';

export interface ResultsModalProps {
  open: boolean;
  onClose: () => void;
  activeTab: 'feed' | 'poll' | 'advanced';
  onTabChange: (tab: 'feed' | 'poll' | 'advanced') => void;
  narrativeEntries: NarrativeEntry[];
  queryResult: QueryResult | null;
  activeShock: string;
  onCounterfactual: (policy: string, nTicks: number) => Promise<CounterfactualResult | null>;
  counterfactualLoading: boolean;
  currentTick: number;
}

const SECTION: React.CSSProperties = {
  fontSize: 11, color: '#64748b', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 8,
};

function SentimentBar({ value }: { value: number }) {
  const pct = ((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100;
  const color = value <= -0.3 ? '#ef4444' : value >= 0.3 ? '#22c55e' : '#eab308';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, backgroundColor: '#1e293b', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: '#334155' }} />
        <div style={{
          position: 'absolute',
          left: value < 0 ? `${pct}%` : '50%',
          width: value < 0 ? `${50 - pct}%` : `${pct - 50}%`,
          top: 0, bottom: 0, backgroundColor: color, borderRadius: 3,
          transition: 'all 0.6s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>
        {value >= 0 ? '+' : ''}{value.toFixed(2)}
      </span>
    </div>
  );
}

function GroupCard({ group }: { group: QueryGroup }) {
  const [expanded, setExpanded] = useState(false);
  const color = group.avg_sentiment <= -0.3 ? '#ef4444' : group.avg_sentiment >= 0.3 ? '#22c55e' : '#eab308';
  return (
    <div style={{ marginBottom: 8, backgroundColor: '#0f172a', borderRadius: 6, border: '1px solid #1e293b', overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600 }}>{group.group}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#475569' }}>{group.count}</span>
          <span style={{ fontSize: 11, color, fontWeight: 700 }}>
            {group.avg_sentiment >= 0 ? '+' : ''}{group.avg_sentiment.toFixed(2)}
          </span>
          <span style={{ fontSize: 9, color: '#475569' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 10px 8px' }}>
          {group.members.map(m => (
            <div key={m.id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{m.name}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: m.sentiment <= -0.3 ? '#ef4444' : m.sentiment >= 0.3 ? '#22c55e' : '#eab308',
                }}>
                  {m.sentiment >= 0 ? '+' : ''}{m.sentiment.toFixed(2)}
                </span>
              </div>
              {m.opinion && (
                <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                  "{m.opinion}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResultsModal({
  open, onClose, activeTab, onTabChange,
  narrativeEntries, queryResult, activeShock,
  onCounterfactual, counterfactualLoading, currentTick,
}: ResultsModalProps) {
  const [policyText, setPolicyText] = useState('');
  const [nTicks, setNTicks] = useState(5);
  const [cfResult, setCfResult] = useState<CounterfactualResult | null>(null);

  if (!open) return null;

  const submitCounterfactual = async () => {
    if (!policyText.trim() || counterfactualLoading || !activeShock) return;
    const result = await onCounterfactual(policyText.trim(), nTicks);
    if (result) setCfResult(result);
  };

  const tabs: { id: 'feed' | 'poll' | 'advanced'; label: string }[] = [
    { id: 'feed', label: 'Live Feed' },
    { id: 'poll', label: 'Opinion Poll' },
    { id: 'advanced', label: 'Advanced' },
  ];

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(2, 8, 23, 0.80)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      {/* Modal card — stop propagation so clicking inside doesn't close */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '90vw', maxWidth: 900,
          maxHeight: '88vh',
          backgroundColor: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: 12,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* ── Modal header ─────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.01em' }}>
            Simulation Results
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4 }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: activeTab === tab.id ? '#1e293b' : 'transparent',
                  color: activeTab === tab.id ? '#e2e8f0' : '#475569',
                  fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid #1e293b', borderRadius: 6,
              color: '#475569', width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 14, flexShrink: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget).style.borderColor = '#6366f1'; (e.currentTarget).style.color = '#a5b4fc'; }}
            onMouseLeave={e => { (e.currentTarget).style.borderColor = '#1e293b'; (e.currentTarget).style.color = '#475569'; }}
          >
            ✕
          </button>
        </div>

        {/* ── Tab content (scrollable) ───────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* ── LIVE FEED TAB ─────────────────────────────────────── */}
          {activeTab === 'feed' && (
            <div>
              <div style={{ ...SECTION, marginBottom: 12 }}>Live Activity Feed</div>
              {narrativeEntries.length === 0 ? (
                <div style={{
                  backgroundColor: '#080d1c', border: '1px solid #1e293b', borderRadius: 8,
                  padding: '20px', fontSize: 12, color: '#334155', lineHeight: 1.65,
                  textAlign: 'center',
                }}>
                  <div style={{ color: '#475569', fontWeight: 600, marginBottom: 6 }}>No activity yet</div>
                  Inject a shock from the left panel to start the simulation. Agent conversations
                  and reactions will stream here in real time.
                </div>
              ) : (
                /* Expanded feed — no maxHeight cap in the modal */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {narrativeEntries.map((e, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 12, lineHeight: 1.6, padding: '8px 12px',
                        borderRadius: 6,
                        backgroundColor: '#080d1c',
                        borderLeft: `3px solid ${e.kind === 'conversation' ? '#3b82f6' : '#f59e0b'}`,
                        color: '#94a3b8',
                      }}
                    >
                      <span style={{
                        fontSize: 10, color: e.kind === 'conversation' ? '#3b82f6' : '#f59e0b',
                        fontWeight: 700, marginRight: 8, textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {e.kind === 'conversation' ? '💬' : '👤'} T{e.tick}
                      </span>
                      {e.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── OPINION POLL TAB ──────────────────────────────────── */}
          {activeTab === 'poll' && (
            <div>
              {!queryResult ? (
                <div style={{
                  backgroundColor: '#080d1c', border: '1px solid #1e293b', borderRadius: 8,
                  padding: '32px 20px', fontSize: 12, color: '#334155', lineHeight: 1.65,
                  textAlign: 'center',
                }}>
                  <div style={{ color: '#475569', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>No poll run yet</div>
                  Use the "Ask the Neighborhood" input in the left panel to poll all 40 residents.
                  Results will appear here, grouped by occupation and colored by sentiment.
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: '#475569', fontStyle: 'italic', marginBottom: 20, lineHeight: 1.6, borderLeft: '3px solid #334155', paddingLeft: 12 }}>
                    "{queryResult.question}"
                  </div>

                  {/* Support / Neutral / Oppose counts */}
                  {(() => {
                    const support = queryResult.all_responses.filter(r => r.sentiment >= 0.3).length;
                    const oppose  = queryResult.all_responses.filter(r => r.sentiment <= -0.3).length;
                    const neutral = queryResult.total_responses - support - oppose;
                    return (
                      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                        <div style={{ flex: 1, textAlign: 'center', backgroundColor: '#052e16', borderRadius: 10, padding: '12px 8px', border: '1px solid #166534' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e', lineHeight: 1 }}>{support}</div>
                          <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Support</div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center', backgroundColor: '#1c1200', borderRadius: 10, padding: '12px 8px', border: '1px solid #713f12' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: '#eab308', lineHeight: 1 }}>{neutral}</div>
                          <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Neutral</div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center', backgroundColor: '#2d0000', borderRadius: 10, padding: '12px 8px', border: '1px solid #7f1d1d' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>{oppose}</div>
                          <div style={{ fontSize: 10, color: '#f87171', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Oppose</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Overall sentiment bar */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Overall Consensus
                    </div>
                    <SentimentBar value={queryResult.overall_sentiment} />
                  </div>

                  {/* Group breakdown */}
                  <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Breakdown by group
                  </div>
                  {queryResult.groups.map(g => <GroupCard key={g.group} group={g} />)}
                </div>
              )}
            </div>
          )}

          {/* ── ADVANCED TAB ──────────────────────────────────────── */}
          {activeTab === 'advanced' && (
            <div>
              {/* Policy Counterfactual */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ ...SECTION }}>Policy Counterfactual</div>
                <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.65, margin: '0 0 12px' }}>
                  <strong style={{ color: '#64748b' }}>What if we added a policy on top of the shock?</strong>{' '}
                  Forks the simulation into two branches — one with just the shock, one with your policy added.
                  Compare how sentiment diverges across both timelines.{' '}
                  {activeShock
                    ? <span style={{ color: '#334155' }}>({nTicks} decision rounds × 2 branches)</span>
                    : <span style={{ color: '#ef4444' }}>Inject a shock first.</span>}
                </p>
                <textarea
                  value={policyText}
                  onChange={e => setPolicyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCounterfactual(); } }}
                  placeholder="e.g. The council offers £2M in community benefit to affected residents"
                  rows={2}
                  disabled={!activeShock}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                    backgroundColor: activeShock ? '#1e293b' : '#111827',
                    border: '1px solid #334155', borderRadius: 6,
                    color: activeShock ? '#e2e8f0' : '#334155',
                    fontSize: 13, resize: 'none', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.5,
                    cursor: activeShock ? 'text' : 'not-allowed',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, margin: '8px 0 10px', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#475569', marginRight: 4 }}>Rounds:</span>
                  {[3, 5, 10].map(n => (
                    <button key={n} onClick={() => setNTicks(n)} style={{
                      padding: '4px 12px', borderRadius: 5, border: 'none',
                      backgroundColor: nTicks === n ? '#334155' : '#1e293b',
                      color: nTicks === n ? '#e2e8f0' : '#475569',
                      fontSize: 12, cursor: 'pointer', fontWeight: nTicks === n ? 700 : 400,
                    }}>{n}</button>
                  ))}
                </div>
                <button
                  onClick={submitCounterfactual}
                  disabled={!policyText.trim() || counterfactualLoading || !activeShock}
                  style={{
                    padding: '9px 20px',
                    backgroundColor: policyText.trim() && !counterfactualLoading && activeShock ? '#0e7490' : '#1e293b',
                    border: 'none', borderRadius: 6,
                    color: policyText.trim() && !counterfactualLoading && activeShock ? '#fff' : '#475569',
                    fontSize: 13, fontWeight: 600,
                    cursor: policyText.trim() && !counterfactualLoading && activeShock ? 'pointer' : 'not-allowed',
                    transition: 'background-color 0.2s',
                  }}
                >
                  {counterfactualLoading ? `Running ${nTicks} rounds × 2 branches…` : activeShock ? 'Compare Timelines' : 'Inject a shock first'}
                </button>
                {cfResult && !counterfactualLoading && (
                  <div style={{ marginTop: 16 }}>
                    <CounterfactualPanel result={cfResult} />
                  </div>
                )}
              </div>

              {/* Sentiment over time chart */}
              <div>
                <div style={{ ...SECTION }}>Sentiment Over Time</div>
                <SentimentChart currentTick={currentTick} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
