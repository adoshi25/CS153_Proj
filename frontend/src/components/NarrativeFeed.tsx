import { useEffect, useRef } from 'react';
import type { NarrativeEntry } from '../types';

interface Props {
  entries: NarrativeEntry[];
}

export default function NarrativeFeed({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
      <div style={{
        fontSize: 11, color: '#64748b', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: 8, display: 'flex', justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>Live Events</span>
        <span style={{ fontSize: 10, fontWeight: 400, color: '#334155' }}>{entries.length} events</span>
      </div>

      <div style={{ maxHeight: 196, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {entries.map((e, i) => (
          <div
            key={i}
            style={{
              fontSize: 11, lineHeight: 1.55, padding: '5px 8px',
              borderRadius: 4,
              backgroundColor: '#0a0f1e',
              borderLeft: `2px solid ${e.kind === 'conversation' ? '#3b82f6' : '#f59e0b'}`,
              color: '#94a3b8',
            }}
          >
            <span style={{ fontSize: 10, color: '#334155', fontWeight: 700, marginRight: 5 }}>
              T{e.tick}
            </span>
            {e.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
