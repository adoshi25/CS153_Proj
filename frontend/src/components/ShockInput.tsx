import { useState } from 'react';

interface ShockInputProps {
  onShockSubmit: (text: string) => void;
  tick: number;
  isRunning: boolean;
  processing: boolean;
}

export default function ShockInput({ onShockSubmit, tick, isRunning, processing }: ShockInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onShockSubmit(text.trim());
    setText('');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: '60px',
      backgroundColor: '#0f172a',
      borderBottom: '1px solid #1e293b',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: '12px',
      zIndex: 100,
    }}>
      <div style={{
        fontSize: '18px',
        fontWeight: 700,
        color: '#94a3b8',
        whiteSpace: 'nowrap',
        marginRight: '8px',
      }}>
        Society Sim
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '700px' }}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Describe a shock event..."
          style={{
            flex: 1,
            padding: '8px 12px',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#e2e8f0',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          style={{
            padding: '8px 18px',
            backgroundColor: text.trim() ? '#3b82f6' : '#1e293b',
            border: 'none',
            borderRadius: '6px',
            color: text.trim() ? '#fff' : '#475569',
            fontSize: '14px',
            fontWeight: 600,
            cursor: text.trim() ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          Inject Shock
        </button>
      </form>

      <div style={{
        marginLeft: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        {processing && (
          <span style={{
            fontSize: '12px',
            color: '#f59e0b',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            ⟳ PROCESSING
          </span>
        )}
        {isRunning && !processing && (
          <span style={{
            fontSize: '12px',
            color: '#22c55e',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            ● LIVE
          </span>
        )}
        <span style={{
          fontSize: '13px',
          color: '#64748b',
          fontWeight: 500,
        }}>
          Tick <span style={{ color: '#94a3b8', fontWeight: 700 }}>{tick}</span>
        </span>
      </div>
    </div>
  );
}
