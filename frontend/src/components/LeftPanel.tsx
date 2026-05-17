import { useState } from 'react';
import type { Orchestrator, Conversation, PublicAction } from '../types';

interface LeftPanelProps {
  onShockSubmit: (text: string) => void;
  tick: number;
  isRunning: boolean;
  processing: boolean;
  orchestrator: Orchestrator | null;
  conversations: Conversation[];
  publicActions: PublicAction[];
}

function SentimentBar({ value }: { value: number }) {
  const pct = ((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100;
  const color = value <= -0.3 ? '#ef4444' : value >= 0.3 ? '#22c55e' : '#eab308';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, backgroundColor: '#1e293b', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: '#334155' }} />
        <div style={{
          position: 'absolute',
          left: value < 0 ? `${pct}%` : '50%',
          width: value < 0 ? `${50 - pct}%` : `${pct - 50}%`,
          top: 0, bottom: 0,
          backgroundColor: color,
          borderRadius: 3,
          transition: 'all 0.6s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 32, textAlign: 'right' }}>
        {value >= 0 ? '+' : ''}{value.toFixed(2)}
      </span>
    </div>
  );
}

const SECTION = {
  fontSize: 11, color: '#64748b', fontWeight: 600,
  textTransform: 'uppercase' as const, letterSpacing: '0.07em',
  marginBottom: 8,
};

export default function LeftPanel({
  onShockSubmit, tick, isRunning, processing, orchestrator, conversations, publicActions,
}: LeftPanelProps) {
  const [text, setText] = useState('');

  const submit = () => {
    if (!text.trim()) return;
    onShockSubmit(text.trim());
    setText('');
  };

  return (
    <div style={{
      width: 300, minWidth: 300, height: '100vh',
      backgroundColor: '#0b1120',
      borderRight: '1px solid #1e293b',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.02em' }}>Society Sim</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {processing && <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⟳ Processing</span>}
          {isRunning && !processing && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>● Live</span>}
          <span style={{ fontSize: 12, color: '#475569' }}>T{tick}</span>
        </div>
      </div>

      {/* Shock input */}
      <div style={{ padding: 16, borderBottom: '1px solid #1e293b' }}>
        <div style={SECTION}>Shock Event</div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Describe a shock event… (Enter to send)"
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 10px',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: 13,
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={submit}
          disabled={!text.trim() || processing}
          style={{
            marginTop: 8, width: '100%',
            padding: '8px 0',
            backgroundColor: text.trim() && !processing ? '#3b82f6' : '#1e293b',
            border: 'none', borderRadius: 6,
            color: text.trim() && !processing ? '#fff' : '#475569',
            fontSize: 13, fontWeight: 600,
            cursor: text.trim() && !processing ? 'pointer' : 'not-allowed',
          }}
        >
          Inject Shock
        </button>
      </div>

      {/* Community pulse */}
      <div style={{ padding: 16, borderBottom: '1px solid #1e293b' }}>
        <div style={SECTION}>Community Pulse</div>
        {orchestrator ? (
          <>
            <SentimentBar value={orchestrator.consensus_sentiment} />
            {orchestrator.summary && (
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: '10px 0 8px' }}>
                {orchestrator.summary}
              </p>
            )}
            {orchestrator.top_concerns?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {orchestrator.top_concerns.map((c, i) => (
                  <span key={i} style={{
                    fontSize: 11, padding: '2px 8px',
                    backgroundColor: '#1e293b', borderRadius: 12,
                    color: '#94a3b8', border: '1px solid #334155',
                  }}>{c}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>Inject a shock to see community pulse.</p>
        )}
      </div>

      {/* Policy recommendations */}
      <div style={{ padding: 16, borderBottom: '1px solid #1e293b' }}>
        <div style={SECTION}>Policy Recommendations</div>
        {orchestrator?.policy_recommendations?.length ? (
          orchestrator.policy_recommendations.map((r, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, marginBottom: 2 }}>
                {r.intervention}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                {r.likely_effect}
              </div>
            </div>
          ))
        ) : (
          <p style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>No recommendations yet.</p>
        )}
      </div>

      {/* Public actions */}
      {publicActions?.length > 0 && (
        <div style={{ padding: 16, borderBottom: '1px solid #1e293b' }}>
          <div style={SECTION}>Public Actions</div>
          {publicActions.slice(0, 5).map((a, i) => {
            const color = a.sentiment <= -0.3 ? '#ef4444' : a.sentiment >= 0.3 ? '#22c55e' : '#eab308';
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, color, fontWeight: 600 }}>{a.name}</span>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0', lineHeight: 1.5 }}>{a.action}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Conversations */}
      <div style={{ padding: 16 }}>
        <div style={SECTION}>Conversations</div>
        {conversations?.length ? (
          [...conversations].reverse().slice(0, 8).map((c, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>{c.location}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, marginTop: 2 }}>{c.summary}</div>
            </div>
          ))
        ) : (
          <p style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>No conversations yet.</p>
        )}
      </div>
    </div>
  );
}
