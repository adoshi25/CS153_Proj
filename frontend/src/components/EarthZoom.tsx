import { useMemo } from 'react';

export default function EarthZoom() {
  // Deterministic star positions — no randomness, seeded by index
  const stars = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const angle = (i * 137.5 * Math.PI) / 180;
      const radius = (i * 0.7 + 5) % 48; // 5%–53% from center
      const cx = 50 + radius * Math.cos(angle);
      const cy = 50 + radius * Math.sin(angle);
      return { cx, cy, opacity: 0.3 + (i % 5) * 0.14 };
    });
  }, []);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 25,
      background: '#000814', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <style>{`
        @keyframes earthZoom {
          0%   { transform: scale(1); opacity: 1; }
          75%  { opacity: 1; }
          100% { transform: scale(12); opacity: 0; }
        }
        ._earth-zoom-wrapper {
          animation: earthZoom 2.4s cubic-bezier(0.4,0,1,1) forwards;
        }
      `}</style>

      {/* Stars scattered behind the globe */}
      {stars.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 2,
            height: 2,
            borderRadius: '50%',
            background: `rgba(255,255,255,${s.opacity})`,
            left: `${s.cx}%`,
            top: `${s.cy}%`,
          }}
        />
      ))}

      {/* Zoom wrapper */}
      <div className="_earth-zoom-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        {/* Globe */}
        <div style={{ position: 'relative', width: 220, height: 220 }}>
          {/* Globe sphere */}
          <div style={{
            width: 220, height: 220, borderRadius: '50%',
            background: 'radial-gradient(circle at 38% 32%, #1d4ed8, #1e3a8a 45%, #0f172a 75%)',
            boxShadow: '0 0 80px rgba(37,99,235,0.35), inset -30px -20px 60px rgba(0,0,0,0.7)',
            overflow: 'hidden', position: 'relative',
          }}>
            {/* SVG latitude + longitude lines */}
            <svg
              viewBox="0 0 220 220"
              width="220" height="220"
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              {/* 4 horizontal ellipses (latitude lines) */}
              <ellipse cx="110" cy="55"  rx="90" ry="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <ellipse cx="110" cy="85"  rx="104" ry="22" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <ellipse cx="110" cy="135" rx="104" ry="22" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <ellipse cx="110" cy="165" rx="90" ry="18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              {/* 4 vertical ellipses (longitude lines) */}
              <ellipse cx="110" cy="110" rx="18" ry="104" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <ellipse cx="110" cy="110" rx="40" ry="104" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <ellipse cx="110" cy="110" rx="70" ry="104" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <ellipse cx="110" cy="110" rx="95" ry="104" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            </svg>

            {/* Specular glint */}
            <div style={{
              position: 'absolute', top: 22, left: 38,
              width: 36, height: 22, borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(255,255,255,0.28) 0%, transparent 70%)',
              transform: 'rotate(-30deg)',
            }} />
          </div>
        </div>

        <span style={{ fontSize: 11, color: '#475569', letterSpacing: '0.06em', fontFamily: 'system-ui, sans-serif' }}>
          Approaching coordinates…
        </span>
      </div>
    </div>
  );
}
