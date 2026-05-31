import { useState, useEffect } from 'react';

const PHRASES = [
  'a factory opening',
  'a transit line expansion',
  'a housing policy change',
  'a tech campus rezoning',
  'a school closure',
  'a gentrification wave',
  'an infrastructure disruption',
  'a healthcare cut',
];

function useTypewriter(phrases: string[], typeSpeed = 72, deleteSpeed = 36, pause = 1700) {
  const [text, setText] = useState('');
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const phrase = phrases[phraseIdx];
    if (!deleting && charIdx < phrase.length) {
      const t = setTimeout(() => setCharIdx(c => c + 1), typeSpeed);
      return () => clearTimeout(t);
    }
    if (!deleting && charIdx === phrase.length) {
      const t = setTimeout(() => setDeleting(true), pause);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx > 0) {
      const t = setTimeout(() => setCharIdx(c => c - 1), deleteSpeed);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx === 0) {
      setDeleting(false);
      setPhraseIdx(i => (i + 1) % phrases.length);
    }
  }, [charIdx, deleting, phraseIdx, phrases, typeSpeed, deleteSpeed, pause]);

  useEffect(() => { setText(phrases[phraseIdx].slice(0, charIdx)); }, [charIdx, phraseIdx, phrases]);
  return text;
}

const EXAMPLES = [
  { name: 'Hoxton, London',    lat: '51.5284', lon: '-0.0793'  },
  { name: 'Shinjuku, Tokyo',   lat: '35.6938', lon: '139.7034' },
  { name: 'Brooklyn, NY',      lat: '40.6782', lon: '-73.9442' },
  { name: 'Kreuzberg, Berlin', lat: '52.4997', lon: '13.4038'  },
];

interface Props {
  onSubmit: (lat: number, lon: number) => void;
}

export default function SetupScreen({ onSubmit }: Props) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [error, setError] = useState('');
  const typed = useTypewriter(PHRASES);

  const submit = () => {
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (isNaN(latN) || latN < -90 || latN > 90) { setError('Enter a valid latitude (−90 to 90)'); return; }
    if (isNaN(lonN) || lonN < -180 || lonN > 180) { setError('Enter a valid longitude (−180 to 180)'); return; }
    setError('');
    onSubmit(latN, lonN);
  };

  return (
    <div style={{
      width: '100vw', height: '100vh', backgroundColor: '#020817',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      overflowY: 'auto',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        .setup-example-btn { transition: border-color 0.15s, color 0.15s, background 0.15s !important; }
        .setup-example-btn:hover { border-color: #4f46e5 !important; color: #a5b4fc !important; background: rgba(79,70,229,0.06) !important; }
        .setup-input:focus { border-color: #4f46e5 !important; outline: none; }
        .setup-submit:hover { background-color: #4338ca !important; }
      `}</style>

      {/* Background glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 1200px 800px at 50% 46%, rgba(99,102,241,0.09) 0%, transparent 65%)',
      }} />

      <div style={{
        position: 'relative',
        width: '100%', maxWidth: 660,
        padding: '60px 40px',
        boxSizing: 'border-box',
      }}>

        {/* Brand chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 10, color: '#6366f1', fontWeight: 600,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          marginBottom: 32, padding: '6px 16px', borderRadius: 100,
          backgroundColor: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#6366f1', boxShadow: '0 0 8px #6366f1' }} />
          Society Simulator · CS153
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 52, fontWeight: 800, color: '#f1f5f9',
          margin: '0 0 6px', letterSpacing: '-0.04em', lineHeight: 1.06,
        }}>
          Simulate how a city<br />responds to
        </h1>

        {/* Typewriter */}
        <div style={{ height: 64, display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <span style={{
            fontSize: 52, fontWeight: 800, color: '#818cf8',
            letterSpacing: '-0.04em', lineHeight: 1.06,
          }}>
            {typed}
            <span style={{
              display: 'inline-block', width: 3, height: '0.85em',
              backgroundColor: '#818cf8', marginLeft: 4, verticalAlign: 'text-bottom',
              animation: 'cursorBlink 0.78s step-end infinite',
            }} />
          </span>
        </div>

        {/* Description */}
        <p style={{
          fontSize: 16, color: '#64748b', margin: '0 0 28px',
          lineHeight: 1.7, maxWidth: 540, fontWeight: 400,
        }}>
          Pick any neighborhood in the world. Draw a boundary. 40 AI residents
          are generated with real local jobs, values, and relationships —
          then react to any event you inject, forming coalitions, spreading
          beliefs, and shifting sentiment in real time.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36 }}>
          {[
            '40 AI residents',
            'Real geographies',
            'Belief propagation',
            'Social networks',
            'Live conversations',
            'Policy testing',
          ].map(f => (
            <div key={f} style={{
              fontSize: 12, color: '#475569', fontWeight: 500,
              backgroundColor: '#0f172a', border: '1px solid #1e293b',
              borderRadius: 100, padding: '5px 14px', letterSpacing: '0.01em',
            }}>
              {f}
            </div>
          ))}
        </div>

        {/* Input card */}
        <div style={{
          backgroundColor: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: 16,
          padding: '28px 28px 24px',
          boxShadow: '0 0 80px rgba(99,102,241,0.05), 0 24px 56px rgba(0,0,0,0.6)',
        }}>

          <div style={{
            fontSize: 13, fontWeight: 600, color: '#94a3b8',
            marginBottom: 16, letterSpacing: '-0.01em',
          }}>
            Choose a neighborhood
          </div>

          {/* Quick examples */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 20 }}>
            {EXAMPLES.map(p => (
              <button
                key={p.name}
                className="setup-example-btn"
                onClick={() => { setLat(p.lat); setLon(p.lon); setError(''); }}
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 7, color: '#64748b',
                  padding: '6px 14px', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500,
                  fontFamily: 'inherit', outline: 'none',
                }}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Lat / lon row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: error ? 10 : 16 }}>
            {([
              { label: 'Latitude',  placeholder: '51.5284', value: lat, set: setLat },
              { label: 'Longitude', placeholder: '-0.0793',  value: lon, set: setLon },
            ] as const).map(f => (
              <div key={f.label} style={{ flex: 1 }}>
                <label style={{
                  display: 'block',
                  fontSize: 10, color: '#475569', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.09em',
                  marginBottom: 7,
                }}>
                  {f.label}
                </label>
                <input
                  className="setup-input"
                  value={f.value}
                  onChange={e => { f.set(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder={f.placeholder}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    backgroundColor: '#0d1425',
                    border: '1px solid #1e293b',
                    borderRadius: 8, padding: '11px 13px',
                    fontSize: 14, color: '#e2e8f0',
                    fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
                    transition: 'border-color 0.15s',
                    letterSpacing: '0.03em',
                  }}
                />
              </div>
            ))}
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12, fontWeight: 500 }}>
              {error}
            </div>
          )}

          <button
            className="setup-submit"
            onClick={submit}
            style={{
              width: '100%', backgroundColor: '#4f46e5',
              border: 'none', borderRadius: 9, color: '#fff',
              padding: '13px', cursor: 'pointer',
              fontSize: 14, fontWeight: 700,
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background-color 0.15s',
              letterSpacing: '-0.01em',
            }}
          >
            Load Location &amp; Draw Boundary
            <span style={{ opacity: 0.75 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
