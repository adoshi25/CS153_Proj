import { useState } from 'react';
import type { Orchestrator, Coalition } from '../types';

interface OrchestratorPanelProps {
  orchestrator: Orchestrator | null;
}

function SentimentBar({ value }: { value: number }) {
  // value from -1 to 1, center = 0
  const clamped = Math.max(-1, Math.min(1, value));
  const percent = ((clamped + 1) / 2) * 100;
  const color = clamped <= -0.3 ? '#ef4444' : clamped >= 0.3 ? '#22c55e' : '#eab308';

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: '#64748b',
        marginBottom: '4px',
      }}>
        <span>Negative</span>
        <span>{clamped.toFixed(2)}</span>
        <span>Positive</span>
      </div>
      <div style={{
        height: '8px',
        backgroundColor: '#1e293b',
        borderRadius: '4px',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* center line */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: '2px',
          backgroundColor: '#334155',
          transform: 'translateX(-50%)',
        }} />
        <div style={{
          position: 'absolute',
          left: clamped < 0 ? `${percent}%` : '50%',
          width: clamped < 0 ? `${50 - percent}%` : `${percent - 50}%`,
          top: 0,
          bottom: 0,
          backgroundColor: color,
          borderRadius: '4px',
          transition: 'all 0.5s ease',
        }} />
      </div>
    </div>
  );
}

function CoalitionCard({ coalition }: { coalition: Coalition }) {
  const [expanded, setExpanded] = useState(false);
  const dirColor =
    coalition.sentiment_direction === 'positive' ? '#22c55e'
    : coalition.sentiment_direction === 'negative' ? '#ef4444'
    : '#eab308';
  const dirBg =
    coalition.sentiment_direction === 'positive' ? '#052e16'
    : coalition.sentiment_direction === 'negative' ? '#2d0000'
    : '#1c1200';
  const dirBorder =
    coalition.sentiment_direction === 'positive' ? '#166534'
    : coalition.sentiment_direction === 'negative' ? '#7f1d1d'
    : '#713f12';

  return (
    <div style={{
      backgroundColor: dirBg,
      border: `1px solid ${dirBorder}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '8px 10px',
          background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: dirColor }}>{coalition.name}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: dirColor,
            backgroundColor: `${dirColor}22`, borderRadius: 10, padding: '1px 6px',
          }}>{coalition.size} members</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: '#475569' }}>T{coalition.formed_at_tick}</span>
          <span style={{ fontSize: 9, color: '#475569' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {coalition.shared_concerns.map(c => (
              <span key={c} style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 10,
                backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
              }}>{c}</span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>
            {coalition.member_names.slice(0, 5).join(', ')}
            {coalition.member_names.length > 5 && ` +${coalition.member_names.length - 5} more`}
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentationBar({ score }: { score: number }) {
  const pct = Math.min(1, score / 0.7) * 100;
  const color = score < 0.25 ? '#22c55e' : score < 0.5 ? '#eab308' : '#ef4444';
  const label = score < 0.25 ? 'Converging' : score < 0.5 ? 'Diverging' : 'Fragmented';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
        <span>Belief Fragmentation</span>
        <span style={{ color, fontWeight: 700 }}>{label} ({score.toFixed(2)})</span>
      </div>
      <div style={{ height: 5, backgroundColor: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, backgroundColor: color,
          borderRadius: 3, transition: 'all 0.6s ease',
        }} />
      </div>
    </div>
  );
}

export default function OrchestratorPanel({ orchestrator }: OrchestratorPanelProps) {
  return (
    <div style={{
      position: 'absolute',
      top: '76px',
      left: '12px',
      width: '280px',
      backgroundColor: 'rgba(15, 23, 42, 0.88)',
      backdropFilter: 'blur(8px)',
      borderRadius: '10px',
      border: '1px solid #1e293b',
      padding: '16px',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    }}>
      <div style={{
        fontSize: '13px',
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        Community Pulse
      </div>

      {!orchestrator || !orchestrator.summary ? (
        <p style={{ fontSize: '13px', color: '#475569', fontStyle: 'italic' }}>
          No data yet. Inject a shock to start the simulation.
        </p>
      ) : (
        <>
          <p style={{
            fontSize: '13px',
            color: '#cbd5e1',
            lineHeight: 1.6,
          }}>
            {orchestrator.summary}
          </p>

          {orchestrator.top_concerns.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 600 }}>
                TOP CONCERNS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {orchestrator.top_concerns.map((concern) => (
                  <span
                    key={concern}
                    style={{
                      padding: '3px 10px',
                      backgroundColor: '#1e3a5f',
                      border: '1px solid #2563eb44',
                      borderRadius: '20px',
                      fontSize: '12px',
                      color: '#93c5fd',
                      fontWeight: 500,
                    }}
                  >
                    {concern}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 600 }}>
              CONSENSUS SENTIMENT
            </div>
            <SentimentBar value={orchestrator.consensus_sentiment} />
          </div>

          {typeof orchestrator.belief_fragmentation_score === 'number' && (
            <FragmentationBar score={orchestrator.belief_fragmentation_score} />
          )}

          {orchestrator.coalitions?.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 600 }}>
                COALITIONS ({orchestrator.coalitions.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {orchestrator.coalitions.map(c => (
                  <CoalitionCard key={c.name + c.formed_at_tick} coalition={c} />
                ))}
              </div>
            </div>
          )}

          {orchestrator.belief_clusters?.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 600 }}>
                BELIEF CLUSTERS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {orchestrator.belief_clusters.map((bc, i) => (
                  <div key={i} style={{
                    backgroundColor: '#0f172a', borderRadius: 6,
                    border: '1px solid #1e293b', padding: '7px 10px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                        {bc.agent_count} agents
                      </span>
                      <span style={{ fontSize: 10, color: '#475569' }}>
                        {Math.round(bc.avg_certainty * 100)}% certain
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                      {bc.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
