import { useState } from 'react';

interface FloatingControlsProps {
  onShockSubmit: (text: string) => Promise<void>;
  onQuerySubmit: (question: string) => Promise<void>;
  shockLoading: boolean;
  queryLoading: boolean;
  shockText: string;
  neighborhoodDescription: string;
}

export default function FloatingControls({
  onShockSubmit, onQuerySubmit,
  shockLoading, queryLoading, shockText, neighborhoodDescription,
}: FloatingControlsProps) {
  const [localShock, setLocalShock] = useState(shockText);
  const [localQuery, setLocalQuery] = useState('');
  const [shockOpen, setShockOpen] = useState(true);
  const [queryOpen, setQueryOpen] = useState(true);

  const submitShock = async () => {
    if (!localShock.trim() || shockLoading) return;
    await onShockSubmit(localShock.trim());
  };

  const submitQuery = async () => {
    if (!localQuery.trim() || queryLoading) return;
    await onQuerySubmit(localQuery.trim());
    setLocalQuery('');
  };

  const panelBase: React.CSSProperties = {
    backgroundColor: 'rgba(6, 12, 26, 0.96)',
    backdropFilter: 'blur(12px)',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', cursor: 'pointer', userSelect: 'none',
  };

  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, display: 'flex', gap: 10, pointerEvents: 'auto',
    }}>
      {/* ── Shock card ── */}
      <div style={{ ...panelBase, width: 260, border: '1px solid #7f1d1d55' }}>
        <div
          style={headerStyle}
          onClick={() => setShockOpen(o => !o)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ef4444' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Inject Shock
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#475569' }}>{shockOpen ? '▾' : '▸'}</span>
        </div>

        {shockOpen && (
          <div style={{ padding: '0 14px 12px' }}>
            {neighborhoodDescription && (
              <p style={{ fontSize: 10, color: '#334155', margin: '0 0 8px', lineHeight: 1.5, fontStyle: 'italic' }}>
                {neighborhoodDescription.slice(0, 120)}{neighborhoodDescription.length > 120 ? '…' : ''}
              </p>
            )}
            <textarea
              value={localShock}
              onChange={e => setLocalShock(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitShock(); } }}
              placeholder="e.g. The city announces a new metro line will displace 200 families…"
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '7px 9px',
                backgroundColor: '#0d1425', border: '1px solid #7f1d1d44',
                borderRadius: 6, color: '#e2e8f0', fontSize: 11, resize: 'none',
                outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
              }}
              onFocus={e => (e.target.style.borderColor = '#ef444488')}
              onBlur={e => (e.target.style.borderColor = '#7f1d1d44')}
            />
            <button
              onClick={submitShock}
              disabled={!localShock.trim() || shockLoading}
              style={{
                marginTop: 7, width: '100%', padding: '7px 0',
                backgroundColor: localShock.trim() && !shockLoading ? '#dc2626' : '#1e293b',
                border: 'none', borderRadius: 6,
                color: localShock.trim() && !shockLoading ? '#fff' : '#475569',
                fontSize: 11, fontWeight: 700,
                cursor: localShock.trim() && !shockLoading ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.15s',
              }}
            >
              {shockLoading ? 'Broadcasting…' : 'Broadcast to All 40 Residents'}
            </button>
          </div>
        )}
      </div>

      {/* ── Query card ── */}
      <div style={{ ...panelBase, width: 260, border: '1px solid #1e1b4b55' }}>
        <div
          style={headerStyle}
          onClick={() => setQueryOpen(o => !o)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#6366f1' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Poll Residents
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#475569' }}>{queryOpen ? '▾' : '▸'}</span>
        </div>

        {queryOpen && (
          <div style={{ padding: '0 14px 12px' }}>
            <p style={{ fontSize: 10, color: '#334155', margin: '0 0 8px', lineHeight: 1.5 }}>
              Dots turn <span style={{ color: '#22c55e', fontWeight: 700 }}>green</span>,{' '}
              <span style={{ color: '#ca8a04', fontWeight: 700 }}>yellow</span>, or{' '}
              <span style={{ color: '#ef4444', fontWeight: 700 }}>red</span> based on opinion.
            </p>
            <textarea
              value={localQuery}
              onChange={e => setLocalQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuery(); } }}
              placeholder="e.g. Should the council approve the proposed metro expansion?"
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '7px 9px',
                backgroundColor: '#0d1425', border: '1px solid #1e1b4b66',
                borderRadius: 6, color: '#e2e8f0', fontSize: 11, resize: 'none',
                outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
              }}
              onFocus={e => (e.target.style.borderColor = '#6366f188')}
              onBlur={e => (e.target.style.borderColor = '#1e1b4b66')}
            />
            <button
              onClick={submitQuery}
              disabled={!localQuery.trim() || queryLoading}
              style={{
                marginTop: 7, width: '100%', padding: '7px 0',
                backgroundColor: localQuery.trim() && !queryLoading ? '#4f46e5' : '#1e293b',
                border: 'none', borderRadius: 6,
                color: localQuery.trim() && !queryLoading ? '#fff' : '#475569',
                fontSize: 11, fontWeight: 700,
                cursor: localQuery.trim() && !queryLoading ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.15s',
              }}
            >
              {queryLoading ? 'Polling all 40…' : 'Poll All Residents'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
