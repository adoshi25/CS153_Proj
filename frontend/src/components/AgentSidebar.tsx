import { useEffect, useRef, useState } from 'react';
import type { Agent } from '../types';

function Sparkline({ history }: { history: number[] }) {
  if (history.length < 2) return null;
  const W = 240, H = 44;
  const pad = 4;
  const xStep = (W - pad * 2) / (history.length - 1);
  const toY = (v: number) => pad + ((1 - (v + 1) / 2) * (H - pad * 2));
  const points = history.map((v, i) => `${pad + i * xStep},${toY(v)}`).join(' ');
  const last = history[history.length - 1];
  const color = last <= -0.3 ? '#ef4444' : last >= 0.3 ? '#22c55e' : '#eab308';
  const zeroY = toY(0);
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="#334155" strokeWidth={1} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      {history.map((v, i) => (
        <circle key={i} cx={pad + i * xStep} cy={toY(v)} r={2} fill={color} />
      ))}
    </svg>
  );
}

const BACKEND_WS = 'ws://localhost:8000';

interface AgentSidebarProps {
  agent: Agent | null;
  onClose: () => void;
  sentimentHistory: number[];
}

function SentimentGauge({ value }: { value: number }) {
  const clamped = Math.max(-1, Math.min(1, value));
  const percent = ((clamped + 1) / 2) * 100;
  const color = clamped <= -0.3 ? '#ef4444' : clamped >= 0.3 ? '#22c55e' : '#eab308';
  const label = clamped <= -0.3 ? 'Negative' : clamped >= 0.3 ? 'Positive' : 'Neutral';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
          Sentiment
        </span>
        <span style={{ fontSize: '12px', color, fontWeight: 700 }}>
          {label} ({clamped.toFixed(2)})
        </span>
      </div>
      <div style={{
        height: '10px',
        backgroundColor: '#1e293b',
        borderRadius: '5px',
        overflow: 'hidden',
        position: 'relative',
      }}>
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
          borderRadius: '5px',
          transition: 'all 0.5s ease',
        }} />
      </div>
    </div>
  );
}

export default function AgentSidebar({ agent, onClose, sentimentHistory }: AgentSidebarProps) {
  const [streamedText, setStreamedText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const prevAgentId = useRef<string | null>(null);

  useEffect(() => {
    if (!agent) {
      wsRef.current?.close();
      setStreamedText('');
      setStreaming(false);
      prevAgentId.current = null;
      return;
    }

    if (agent.id === prevAgentId.current) return;
    prevAgentId.current = agent.id;

    wsRef.current?.close();
    setStreamedText('');
    setStreaming(true);

    const ws = new WebSocket(`${BACKEND_WS}/ws/think/${agent.id}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { token?: string; done?: boolean; error?: string };
        if (msg.token) setStreamedText((prev) => prev + msg.token);
        if (msg.done || msg.error) setStreaming(false);
      } catch {
        // ignore
      }
    };

    ws.onclose = () => setStreaming(false);
    ws.onerror = () => setStreaming(false);

    return () => {
      ws.close();
    };
  }, [agent?.id]);

  return (
    <div style={{
      width: '340px',
      minWidth: '340px',
      height: '100vh',
      backgroundColor: '#0b1120',
      borderLeft: '1px solid #1e293b',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 700,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          Agent Details
        </div>
        {agent && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#475569',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: 1,
              padding: '0 2px',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>

      {!agent ? (
        <p style={{ fontSize: '13px', color: '#475569', fontStyle: 'italic' }}>
          Click an agent on the map to view their live thinking.
        </p>
      ) : (
        <>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#e2e8f0' }}>{agent.name}</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{agent.move_to || 'home'}</div>
          </div>

          <SentimentGauge value={agent.sentiment} />

          {sentimentHistory.length >= 2 && (
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
                Belief Trajectory
              </div>
              <Sparkline history={sentimentHistory} />
            </div>
          )}

          {/* Live streaming thought */}
          <div style={{
            backgroundColor: '#1e293b',
            borderLeft: `3px solid ${streaming ? '#f59e0b' : '#3b82f6'}`,
            borderRadius: '4px',
            padding: '10px 12px',
            minHeight: '80px',
          }}>
            <div style={{
              fontSize: '11px',
              color: streaming ? '#f59e0b' : '#64748b',
              fontWeight: 600,
              textTransform: 'uppercase',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              {streaming ? '⟳ Thinking live...' : 'Thought'}
            </div>
            <p style={{
              fontSize: '13px',
              color: '#cbd5e1',
              fontStyle: 'italic',
              lineHeight: 1.6,
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}>
              {streamedText || (agent.thought ? `"${agent.thought}"` : '')}
              {streaming && <span style={{ animation: 'none', opacity: 0.7 }}>▋</span>}
            </p>
          </div>

          {agent.action && (
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                Last Action
              </div>
              <p style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.5, margin: 0 }}>
                {agent.action}
              </p>
            </div>
          )}

          {agent.move_to && agent.move_to !== 'home' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#0f2847',
              border: '1px solid #1e3a5f',
              borderRadius: '6px',
              padding: '8px 12px',
            }}>
              <span style={{ fontSize: '14px' }}>→</span>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>HEADING TO</div>
                <div style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 500 }}>{agent.move_to}</div>
              </div>
            </div>
          )}

          <div style={{ fontSize: '12px', color: '#475569' }}>
            Lat: {agent.lat.toFixed(4)} · Lon: {agent.lon.toFixed(4)}
          </div>
        </>
      )}
    </div>
  );
}
