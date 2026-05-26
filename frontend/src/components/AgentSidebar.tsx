import { useEffect, useRef, useState } from 'react';
import type { Agent, QueryMember } from '../types';

const BACKEND_WS = 'ws://localhost:8000';

interface AgentSidebarProps {
  agent: Agent;
  onClose: () => void;
  queryOpinion: QueryMember | null;
}

function SentimentGauge({ value }: { value: number }) {
  const clamped = Math.max(-1, Math.min(1, value));
  const percent = ((clamped + 1) / 2) * 100;
  const color = clamped <= -0.3 ? '#ef4444' : clamped >= 0.3 ? '#22c55e' : '#eab308';
  const label = clamped <= -0.3 ? 'Oppose' : clamped >= 0.3 ? 'Support' : 'Neutral';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sentiment</span>
        <span style={{ fontSize: 12, color, fontWeight: 700 }}>{label} ({clamped >= 0 ? '+' : ''}{clamped.toFixed(2)})</span>
      </div>
      <div style={{ height: 8, backgroundColor: '#1e293b', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: '#334155', transform: 'translateX(-50%)' }} />
        <div style={{
          position: 'absolute',
          left: clamped < 0 ? `${percent}%` : '50%',
          width: clamped < 0 ? `${50 - percent}%` : `${percent - 50}%`,
          top: 0, bottom: 0, backgroundColor: color, borderRadius: 4,
          transition: 'all 0.5s ease',
        }} />
      </div>
    </div>
  );
}

export default function AgentSidebar({ agent, onClose, queryOpinion }: AgentSidebarProps) {
  const [streamedText, setStreamedText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const prevAgentId = useRef<string | null>(null);

  useEffect(() => {
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
        if (msg.token) setStreamedText(prev => prev + msg.token);
        if (msg.done || msg.error) setStreaming(false);
      } catch { /* ignore */ }
    };
    ws.onclose = () => setStreaming(false);
    ws.onerror = () => setStreaming(false);
    return () => {
      ws.close();
      prevAgentId.current = null; // reset so StrictMode remount re-opens the socket
    };
  }, [agent.id]);

  const displaySentiment = queryOpinion ? queryOpinion.sentiment : agent.sentiment;

  return (
    <div style={{
      width: 320, minWidth: 320, height: '100vh',
      backgroundColor: '#0b1120', borderLeft: '1px solid #1e293b',
      padding: 18, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>{agent.name}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{agent.action || 'Going about their day'}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}
        >✕</button>
      </div>

      {/* Sentiment */}
      <SentimentGauge value={displaySentiment} />

      {/* Query opinion — shown after a poll */}
      {queryOpinion && (
        <div style={{
          backgroundColor: '#0f172a', borderRadius: 8,
          border: `1px solid ${queryOpinion.sentiment <= -0.3 ? '#7f1d1d' : queryOpinion.sentiment >= 0.3 ? '#14532d' : '#713f12'}`,
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Their Response
          </div>
          <p style={{ fontSize: 13, color: '#cbd5e1', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>
            "{queryOpinion.opinion}"
          </p>
        </div>
      )}

      {/* Cascade info */}
      {agent.cascade_tier !== null && agent.cascade_tier !== undefined && (
        <div style={{ backgroundColor: '#0f172a', borderRadius: 8, border: '1px solid #1e293b', padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              How They Heard
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
              backgroundColor: agent.cascade_tier === 1 ? '#1e3a5f' : agent.cascade_tier === 2 ? '#1c1200' : '#1a1a2e',
              color: agent.cascade_tier === 1 ? '#93c5fd' : agent.cascade_tier === 2 ? '#fbbf24' : '#94a3b8',
              border: `1px solid ${agent.cascade_tier === 1 ? '#2563eb44' : agent.cascade_tier === 2 ? '#92400e44' : '#33415544'}`,
            }}>
              {agent.cascade_tier === 1 ? 'Directly Affected' : agent.cascade_tier === 2 ? 'Word of Mouth' : 'News'}
              {agent.knowledge_tick !== null ? ` · T${agent.knowledge_tick}` : ''}
            </span>
          </div>
          {agent.impact_brief && (
            <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
              "{agent.impact_brief}"
            </p>
          )}
        </div>
      )}

      {/* Belief state */}
      {agent.belief_about_event && (
        <div style={{
          backgroundColor: '#0f172a', borderRadius: 8, border: '1px solid #312e81',
          padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              What They Believe
            </span>
            <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 600 }}>
              {Math.round(agent.belief_certainty * 100)}% certain
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#c7d2fe', margin: '0 0 6px', lineHeight: 1.5, fontStyle: 'italic' }}>
            "{agent.belief_about_event}"
          </p>
          {agent.belief_source && (
            <span style={{ fontSize: 10, color: '#475569' }}>via {agent.belief_source}</span>
          )}
        </div>
      )}

      {/* Live streaming thought */}
      <div style={{
        backgroundColor: '#1e293b',
        borderLeft: `3px solid ${streaming ? '#f59e0b' : '#3b82f6'}`,
        borderRadius: 4, padding: '10px 12px', flex: 1, minHeight: 80,
      }}>
        <div style={{
          fontSize: 10, color: streaming ? '#f59e0b' : '#64748b',
          fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
        }}>
          {streaming ? '⟳ Thinking live…' : 'Live Thought'}
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', fontStyle: 'italic', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
          {streamedText || (agent.thought ? `"${agent.thought}"` : 'Click to stream their current thought.')}
          {streaming && <span style={{ opacity: 0.7 }}>▋</span>}
        </p>
      </div>
    </div>
  );
}
