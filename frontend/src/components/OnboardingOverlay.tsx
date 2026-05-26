import { useEffect, useState } from 'react';

const STORAGE_KEY = 'society-sim-onboarding-v1';

interface Step {
  label: string;
  title: string;
  body: React.ReactNode;
}

const STEPS: Step[] = [
  {
    label: 'What is this?',
    title: 'Society Sim',
    body: (
      <>
        <p style={{ margin: '0 0 12px' }}>
          You're watching <strong style={{ color: '#e2e8f0' }}>40 AI-powered residents</strong> of a
          simulated Brooklyn neighborhood react to a city-wide shock in real time.
        </p>
        <p style={{ margin: '0 0 12px' }}>
          Each agent has a job, relationships, a memory, and their own values. Nothing is scripted —
          behavior emerges from individual LLM decisions happening every few seconds.
        </p>
        <p style={{ margin: 0 }}>
          The simulator models how societies process change: which groups resist, which adapt, and
          what interventions might shift the outcome.
        </p>
      </>
    ),
  },
  {
    label: 'The neighborhood',
    title: 'Boerum Hill, Brooklyn',
    body: (
      <>
        <p style={{ margin: '0 0 12px' }}>
          A dense, mixed-income urban block with a bakery, elementary school, tech hub, park, and
          police station — all connected by streets residents actually walk every day.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            ['40 residents', 'retirees, nurses, engineers, drivers, owners'],
            ['Social graph', 'agents know each other — info spreads through relationships'],
            ['Memory system', 'each agent remembers past events, weighted by importance'],
            ['LLM-backed', 'Haiku for decisions, Sonnet for reflection & synthesis'],
          ].map(([title, desc]) => (
            <div key={title} style={{
              backgroundColor: '#0f172a', border: '1px solid #1e293b',
              borderRadius: 6, padding: '8px 10px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
          Agents cluster at POIs (bakery, cafe, park) and converse when co-located.
        </p>
      </>
    ),
  },
  {
    label: 'How to use it',
    title: 'Three ways to interact',
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          {
            step: '1',
            color: '#ef4444',
            title: 'Inject a Shock',
            desc: 'Describe a city event — "A highway closure reroutes all truck traffic through Street S." Every agent reacts based on how the event affects their daily life.',
          },
          {
            step: '2',
            color: '#6366f1',
            title: 'Ask the Neighborhood',
            desc: 'Poll all 40 residents with a policy question. Agent dots turn green, yellow, or red. Click any agent to read their reasoning.',
          },
          {
            step: '3',
            color: '#22c55e',
            title: 'Watch it unfold',
            desc: 'The Live Events feed shows conversations as they happen. The Sentiment chart tracks how each demographic group shifts over time.',
          },
        ].map(({ step, color, title, desc }) => (
          <div key={step} style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            backgroundColor: '#0f172a', border: '1px solid #1e293b',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              backgroundColor: `${color}22`, border: `1.5px solid ${color}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color, flexShrink: 0, marginTop: 1,
            }}>{step}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.55 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

export default function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: 520, maxWidth: '92vw',
        backgroundColor: '#0b1120', border: '1px solid #1e293b',
        borderRadius: 14, padding: '32px 36px',
        color: '#94a3b8', fontFamily: 'inherit',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>

        {/* Step tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none',
                cursor: 'pointer', fontSize: 10, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                backgroundColor: i === step ? '#1e293b' : 'transparent',
                color: i === step ? '#e2e8f0' : '#334155',
                transition: 'all 0.15s',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Title */}
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', margin: '0 0 16px', letterSpacing: '-0.01em' }}>
          {current.title}
        </h2>

        {/* Body */}
        <div style={{ fontSize: 13, lineHeight: 1.65, marginBottom: 28 }}>
          {current.body}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => setStep(s => s - 1)}
            style={{
              visibility: isFirst ? 'hidden' : 'visible',
              background: 'none', border: '1px solid #1e293b',
              borderRadius: 6, color: '#64748b',
              padding: '8px 18px', cursor: 'pointer', fontSize: 13,
            }}
          >
            Back
          </button>

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
              onClick={dismiss}
              style={{
                backgroundColor: '#6366f1', border: 'none',
                borderRadius: 6, color: '#fff',
                padding: '8px 20px', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >
              Enter Simulation
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              style={{
                backgroundColor: '#6366f1', border: 'none',
                borderRadius: 6, color: '#fff',
                padding: '8px 20px', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
