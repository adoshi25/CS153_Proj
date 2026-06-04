interface TopBarProps {
  neighborhood: string;
  tick: number;
  isRunning: boolean;
  onNewSimulation: () => void;
  onOpenResults: () => void;
  narrativeCount: number;
}

export default function TopBar({
  neighborhood, tick, isRunning,
  onNewSimulation, onOpenResults, narrativeCount,
}: TopBarProps) {
  return (
    <div style={{
      height: 48, backgroundColor: '#060c1a',
      borderBottom: '1px solid #1e293b',
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 14, flexShrink: 0, zIndex: 30,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>
          <span style={{ color: '#6366f1' }}>Society</span>
          <span style={{ color: '#e2e8f0' }}>Sim</span>
        </div>
        {neighborhood && (
          <>
            <div style={{ width: 1, height: 16, backgroundColor: '#1e293b' }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {neighborhood}
            </div>
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: isRunning ? '#22c55e' : '#475569',
          boxShadow: isRunning ? '0 0 6px #22c55e88' : 'none',
        }} />
        {isRunning ? 'Live' : 'Idle'} · Tick {tick} · 40 residents
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={onNewSimulation}
          style={{
            background: 'none', border: '1px solid #1e293b', borderRadius: 6,
            color: '#475569', padding: '5px 12px', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget).style.borderColor = '#6366f1'; (e.currentTarget).style.color = '#a5b4fc'; }}
          onMouseLeave={e => { (e.currentTarget).style.borderColor = '#1e293b'; (e.currentTarget).style.color = '#475569'; }}
        >
          ↩ New
        </button>
        <button
          onClick={onOpenResults}
          style={{
            backgroundColor: narrativeCount > 0 ? '#312e81' : '#111827',
            border: `1px solid ${narrativeCount > 0 ? '#4f46e5' : '#1e293b'}`,
            borderRadius: 6, color: narrativeCount > 0 ? '#c7d2fe' : '#94a3b8',
            padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget).style.borderColor = '#6366f1'; (e.currentTarget).style.color = '#e2e8f0'; }}
          onMouseLeave={e => { (e.currentTarget).style.borderColor = narrativeCount > 0 ? '#4f46e5' : '#1e293b'; (e.currentTarget).style.color = narrativeCount > 0 ? '#c7d2fe' : '#94a3b8'; }}
        >
          View Results
          {narrativeCount > 0 && (
            <span style={{
              backgroundColor: '#6366f1', color: '#fff',
              borderRadius: 10, fontSize: 9, fontWeight: 700,
              padding: '1px 6px', minWidth: 18, textAlign: 'center',
            }}>
              {narrativeCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
