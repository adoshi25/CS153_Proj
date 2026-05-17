import type { Orchestrator } from '../types';

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
        </>
      )}
    </div>
  );
}
