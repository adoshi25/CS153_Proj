import { useState } from 'react';

interface Props {
  neighborhoodName?: string;
  neighborhoodDescription?: string;
}

export default function OnboardingOverlay({ neighborhoodName, neighborhoodDescription }: Props) {
  const [visible, setVisible] = useState(true);
  const [step, setStep]       = useState(0);

  if (!visible) return null;

  const name = neighborhoodName || 'Your Neighborhood';

  const STEPS = [
    {
      tab:   'What is this?',
      title: 'Society Simulator',
      body: (
        <>
          <p style={{ margin: '0 0 12px' }}>
            You're looking at <strong style={{ color: '#e2e8f0' }}>40 simulated residents</strong> of{' '}
            <strong style={{ color: '#818cf8' }}>{name}</strong> — each with a real job, a home location,
            relationships with neighbors, and a bio grounded in the actual geography of this area.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            Inject a shock — a policy change, infrastructure event, or community disruption — and watch every
            agent form a stance based on who they are and where they live. Activated agents physically
            move on the map toward relevant locations: protests, hospitals, city hall.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            Conversations between co-located agents are recorded and shape their future responses.
            Past shock experiences persist in each agent's memory — so a resident who lived through
            a prior disruption reacts differently the next time.
          </p>
          <p style={{ margin: 0 }}>
            Click any dot on the map to read that resident's live day-in-the-life stream, their
            personal stance, and their full conversation history.
          </p>
        </>
      ),
    },
    {
      tab:   'Your neighborhood',
      title: name,
      body: (
        <>
          {neighborhoodDescription && (
            <p style={{ margin: '0 0 16px', lineHeight: 1.65 }}>{neighborhoodDescription}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['40 residents',       'Geo-grounded bios — real streets, real venues, real jobs for this area'],
              ['Agent movement',     'Activated agents physically travel to destinations on the map over multiple days'],
              ['Social graph',       'Agents have relationships — neighbors, coworkers, regulars at the same spots'],
              ['Persistent memory',  'Past shock experiences are saved and shape how each agent responds to future events'],
            ].map(([title, desc]) => (
              <div key={title} style={{
                backgroundColor: '#0f172a', border: '1px solid #1e293b',
                borderRadius: 7, padding: '9px 11px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </>
      ),
    },
  ];

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast  = step === STEPS.length - 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: 560, maxWidth: '94vw',
        backgroundColor: '#0b1120', border: '1px solid #1e293b',
        borderRadius: 14, padding: '36px 40px',
        color: '#94a3b8', fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        fontSize: 13, lineHeight: 1.65,
      }}>

        {/* Step tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 26 }}>
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                backgroundColor: i === step ? '#1e293b' : 'transparent',
                color: i === step ? '#e2e8f0' : '#334155',
                transition: 'all 0.15s',
              }}
            >{s.tab}</button>
          ))}
        </div>

        {/* Title */}
        <h2 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', margin: '0 0 18px', letterSpacing: '-0.02em' }}>
          {current.title}
        </h2>

        {/* Body */}
        <div style={{ marginBottom: 28 }}>{current.body}</div>

        {/* Nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => setStep(s => s - 1)}
            style={{
              visibility: isFirst ? 'hidden' : 'visible',
              background: 'none', border: '1px solid #1e293b', borderRadius: 6,
              color: '#64748b', padding: '8px 18px', cursor: 'pointer', fontSize: 13,
            }}
          >Back</button>

          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                backgroundColor: i === step ? '#6366f1' : '#1e293b',
                transition: 'background-color 0.2s',
              }} />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={() => setVisible(false)}
              style={{
                backgroundColor: '#6366f1', border: 'none', borderRadius: 6,
                color: '#fff', padding: '8px 20px', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >Enter Simulation</button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              style={{
                backgroundColor: '#6366f1', border: 'none', borderRadius: 6,
                color: '#fff', padding: '8px 20px', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >Next</button>
          )}
        </div>
      </div>
    </div>
  );
}
