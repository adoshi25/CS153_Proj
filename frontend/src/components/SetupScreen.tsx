import { useState, useEffect, useRef } from 'react';

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
  { name: 'Hoxton, London'    },
  { name: 'Shinjuku, Tokyo'   },
  { name: 'Kreuzberg, Berlin' },
  { name: 'Mission District, SF' },
  { name: 'Dharavi, Mumbai'   },
];

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface Props {
  onSubmit: (lat: number, lon: number) => void;
}

export default function SetupScreen({ onSubmit }: Props) {
  const [query, setQuery]       = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError]       = useState('');
  const [results, setResults]   = useState<NominatimResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typed    = useTypewriter(PHRASES);

  // Debounced autocomplete
  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); setShowResults(false); return; }
    const t = setTimeout(async () => {
      try {
        const encoded = encodeURIComponent(query.trim());
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json() as NominatimResult[];
        setResults(data);
        setShowResults(data.length > 0);
      } catch { /* ignore autocomplete errors */ }
    }, 320);
    return () => clearTimeout(t);
  }, [query]);

  const geocodeAndSubmit = async (q: string) => {
    if (!q.trim()) { setError('Please enter a city or neighborhood'); return; }
    setSearching(true);
    setError('');
    setShowResults(false);
    try {
      const encoded = encodeURIComponent(q.trim());
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json() as NominatimResult[];
      if (data.length > 0) {
        onSubmit(parseFloat(data[0].lat), parseFloat(data[0].lon));
      } else {
        setError(`No results for "${q.trim()}" — try being more specific`);
        setSearching(false);
      }
    } catch {
      setError('Search failed — check your internet connection');
      setSearching(false);
    }
  };

  const pickResult = (r: NominatimResult) => {
    setQuery(r.display_name.split(',').slice(0, 2).join(','));
    setShowResults(false);
    onSubmit(parseFloat(r.lat), parseFloat(r.lon));
  };

  const searchCard = (
    <div style={{
      backgroundColor: '#080e1e',
      border: '1px solid rgba(99,102,241,0.25)',
      borderRadius: 16,
      padding: '32px 32px 28px',
      boxShadow: '0 0 0 1px rgba(99,102,241,0.08), 0 20px 48px rgba(0,0,0,0.7)',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#818cf8',
        marginBottom: 18, letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        Search for a city or neighborhood
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {EXAMPLES.map(p => (
          <button
            key={p.name}
            className="setup-example-btn"
            onClick={() => { setQuery(p.name); setError(''); geocodeAndSubmit(p.name); }}
            style={{
              flex: 1,
              backgroundColor: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.22)',
              borderRadius: 100, color: '#818cf8',
              padding: '7px 4px', cursor: 'pointer',
              fontSize: 10, fontWeight: 600,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              fontFamily: 'inherit', outline: 'none',
              textAlign: 'center', whiteSpace: 'nowrap',
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div style={{ position: 'relative', marginBottom: error ? 10 : 16 }}>
        <svg
          width="15" height="15" viewBox="0 0 15 15" fill="none"
          style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}
        >
          <circle cx="6.5" cy="6.5" r="4.5" stroke="#6366f1" strokeWidth="1.5" />
          <line x1="10" y1="10" x2="14" y2="14" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          className="setup-input"
          value={query}
          onChange={e => { setQuery(e.target.value); setError(''); }}
          onKeyDown={e => {
            if (e.key === 'Enter') geocodeAndSubmit(query);
            if (e.key === 'Escape') setShowResults(false);
          }}
          onFocus={() => { if (results.length > 0) setShowResults(true); }}
          onBlur={() => setTimeout(() => setShowResults(false), 150)}
          placeholder="e.g. Boerum Hill, Brooklyn · Shibuya, Tokyo"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            backgroundColor: '#0c1428',
            border: '2px solid rgba(99,102,241,0.45)',
            borderRadius: 10, padding: '16px 16px 16px 44px',
            fontSize: 16, color: '#e2e8f0',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        />

        {showResults && results.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            backgroundColor: '#0d1425', border: '1px solid #1e293b',
            borderRadius: 10, zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}>
            {results.map((r, i) => {
              const parts = r.display_name.split(',');
              const primary = parts.slice(0, 2).join(',').trim();
              const secondary = parts.slice(2, 4).join(',').trim();
              return (
                <div
                  key={i}
                  className="setup-result-row"
                  onMouseDown={() => pickResult(r)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    borderBottom: i < results.length - 1 ? '1px solid #1e293b' : 'none',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{primary}</div>
                  {secondary && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{secondary}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12, fontWeight: 500 }}>
          {error}
        </div>
      )}

      <button
        className="setup-submit"
        onClick={() => geocodeAndSubmit(query)}
        disabled={searching || !query.trim()}
        style={{
          width: '100%', backgroundColor: searching || !query.trim() ? '#2d2a6e' : '#4f46e5',
          border: 'none', borderRadius: 9, color: searching || !query.trim() ? '#6366f1' : '#fff',
          padding: '13px', cursor: searching || !query.trim() ? 'default' : 'pointer',
          fontSize: 12, fontWeight: 700,
          fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'background-color 0.15s',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}
      >
        {searching ? (
          <>
            <span style={{
              width: 14, height: 14, border: '2px solid #6366f1',
              borderTopColor: '#a5b4fc', borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.7s linear infinite',
            }} />
            Locating…
          </>
        ) : (
          <>
            Load Location &amp; Draw Boundary
            <span style={{ opacity: 0.75 }}>→</span>
          </>
        )}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{
      width: '100vw', minHeight: '100vh', backgroundColor: '#020817',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      overflowY: 'auto',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,400;1,700&display=swap');
        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        .setup-example-btn { transition: border-color 0.15s, color 0.15s, background 0.15s !important; }
        .setup-example-btn:hover { border-color: #818cf8 !important; color: #c7d2fe !important; background: rgba(99,102,241,0.12) !important; }
        .setup-input::placeholder { text-transform: uppercase; letter-spacing: 0.07em; font-size: 13px; color: #3d4f6e; }
        .setup-input:focus { border-color: #6366f1 !important; outline: none; box-shadow: 0 0 0 3px rgba(99,102,241,0.15) !important; }
        .setup-submit:hover:not(:disabled) { background-color: #4338ca !important; }
        .setup-result-row:hover { background: rgba(99,102,241,0.08) !important; }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 1400px 900px at 50% 46%, rgba(99,102,241,0.1) 0%, transparent 65%)',
      }} />

      <div style={{
        position: 'relative', width: '100%', maxWidth: 860,
        padding: '64px 40px 80px',
        boxSizing: 'border-box',
      }}>

        {/* Brand chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 9,
          fontSize: 12, color: '#6366f1', fontWeight: 700,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          marginBottom: 36, padding: '9px 22px', borderRadius: 100,
          backgroundColor: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.25)',
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#6366f1', boxShadow: '0 0 8px #6366f1' }} />
          Society Simulator · CS153
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 58, fontWeight: 400, color: '#f1f5f9',
          fontFamily: '"Playfair Display", Georgia, serif',
          margin: '0', letterSpacing: '-0.01em', lineHeight: 1.16,
        }}>
          Simulate how<br />societies respond to
        </h1>

        {/* Typewriter */}
        <div style={{ paddingTop: 6, marginBottom: 36 }}>
          <span style={{
            fontSize: 50, fontWeight: 700, color: '#818cf8',
            fontFamily: '"Playfair Display", Georgia, serif',
            fontStyle: 'italic',
            letterSpacing: '-0.01em', lineHeight: 1.1,
            display: 'block',
          }}>
            {typed}
            <span style={{
              display: 'inline-block', width: 3, height: '0.8em',
              backgroundColor: '#818cf8', marginLeft: 4, verticalAlign: 'text-bottom',
              animation: 'cursorBlink 0.78s step-end infinite',
            }} />
          </span>
        </div>

        {/* Description */}
        <p style={{
          fontSize: 19, color: '#94a3b8', margin: '0 0 44px',
          lineHeight: 1.75, fontWeight: 400,
        }}>
          Pick any neighborhood in the world. Draw a boundary. 40 simulated
          residents are generated with real local jobs, values, and relationships —
          then react to any event you inject, forming coalitions, spreading
          beliefs, and shifting sentiment in real time.
        </p>

        {/* Pills — row 1: 3 spread, row 2: 2 centered/staggered */}
        {(() => {
          const pillStyle: React.CSSProperties = {
            textAlign: 'center',
            fontSize: 10, color: '#e2e8f0', fontWeight: 600,
            letterSpacing: '0.09em', textTransform: 'uppercase' as const,
            padding: '9px 22px',
            border: '1px solid rgba(120,140,170,0.2)',
            borderRadius: 14,
            backgroundColor: 'rgba(120,140,170,0.05)',
          };
          const row1 = ['40 Residents', 'Real Geographies', 'Social Networks'];
          const row2 = ['Live Conversations', 'Policy Testing'];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 30, marginBottom: 48, padding: '0 17%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {row1.map(f => <div key={f} style={pillStyle}>{f}</div>)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-evenly' }}>
                {row2.map(f => <div key={f} style={pillStyle}>{f}</div>)}
              </div>
            </div>
          );
        })()}

        {/* Search card */}
        {searchCard}

      </div>
    </div>
  );
}
