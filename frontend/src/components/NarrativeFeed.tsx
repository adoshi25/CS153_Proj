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
    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {entries.map((e, i) => (
        <div
          key={i}
          style={{
            fontSize: 11, lineHeight: 1.6, padding: '6px 9px',
            borderRadius: 5,
            backgroundColor: '#080d1c',
            borderLeft: `2px solid ${e.kind === 'conversation' ? '#3b82f6' : '#f59e0b'}`,
            color: '#94a3b8',
          }}
        >
          <span style={{
            fontSize: 9, color: e.kind === 'conversation' ? '#3b82f6' : '#f59e0b',
            fontWeight: 700, marginRight: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {e.kind === 'conversation' ? '💬' : '👤'} T{e.tick}
          </span>
          {e.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
