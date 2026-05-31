import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { Agent, ShockOption, Snapshot, POI } from './types';
import GameMap from './components/GameMap';
import AgentSidebar from './components/AgentSidebar';
import LeftPanel from './components/LeftPanel';
import SetupScreen from './components/SetupScreen';
import OnboardingOverlay from './components/OnboardingOverlay';

type AppPhase = 'setup' | 'draw' | 'ready';

const WS_URL = 'ws://localhost:8000/ws';
const BACKEND_URL = 'http://localhost:8000';

export default function App() {
  const [appPhase, setAppPhase] = useState<AppPhase>('setup');
  const [setupCoords, setSetupCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [shockOptions, setShockOptions] = useState<ShockOption[]>([]);
  const [selectedShockOption, setSelectedShockOption] = useState<ShockOption | null>(null);
  const [shockLoading, setShockLoading] = useState(false);
  const [shockOptionsLoading, setShockOptionsLoading] = useState(false);
  const [currentShock, setCurrentShock] = useState('');
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [scenarioGenerating, setScenarioGenerating] = useState(false);
  const [overlayFading, setOverlayFading] = useState(false);
  const [showGenOverlay, setShowGenOverlay] = useState(false);
  const [currentNeighborhood, setCurrentNeighborhood] = useState('');
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [neighborhoodDescription, setNeighborhoodDescription] = useState('');
  const [neighborhoodBoundary, setNeighborhoodBoundary] = useState<[number, number][] | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [spotlightPOI, setSpotlightPOI] = useState<{ lat: number; lon: number; name: string } | null>(null);

  const genStartRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shockOptsFetchId = useRef(0); // incremented each fetch to discard stale responses

  const appPhaseRef = useRef(appPhase);
  appPhaseRef.current = appPhase;

  const connectWS = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onmessage = (event: MessageEvent) => {
      try {
        const snap = JSON.parse(event.data as string) as Snapshot;
        // Ignore WS snapshots during draw/setup — only apply once in ready phase
        if (appPhaseRef.current !== 'ready') return;
        setAgents(snap.agents);
        setSelectedAgent(prev => prev ? (snap.agents.find(a => a.id === prev.id) ?? prev) : null);
        if (snap.agents.some(a => a.shock_stance !== null)) setShockLoading(false);
      } catch (err) { console.error('WS parse error', err); }
    };
    ws.onclose = () => { wsRef.current = null; reconnectTimerRef.current = setTimeout(connectWS, 3000); };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connectWS();
    return () => { reconnectTimerRef.current && clearTimeout(reconnectTimerRef.current); wsRef.current?.close(); };
  }, [connectWS]);

  type GenStep = { label: string; detail: string; ms?: number };
  const GEN_STEPS: GenStep[] = useMemo(() => [
    { label: 'Locating neighborhood',         detail: 'Reverse-geocoding coordinates',                 ms: 3000  },
    { label: 'Building neighborhood context', detail: 'Demographics · venues · street names',          ms: 10000 },
    { label: 'Writing 40 resident profiles',  detail: 'Generating agents with local context'           },
    { label: 'Wiring social connections',     detail: 'Building relationships & spatial awareness'     },
  ], []);

  // Overlay fade-in/out
  useEffect(() => {
    if (scenarioGenerating) {
      setOverlayFading(false);
      setShowGenOverlay(true);
      setGenStepIdx(0);
      genStartRef.current = Date.now();
      const timers: ReturnType<typeof setTimeout>[] = [];
      let cumulative = 0;
      for (let i = 0; i < GEN_STEPS.length; i++) {
        const step = GEN_STEPS[i];
        if (!step.ms) break;
        cumulative += step.ms;
        const next = i + 1;
        timers.push(setTimeout(() => setGenStepIdx(next), cumulative));
      }
      return () => timers.forEach(clearTimeout);
    } else if (showGenOverlay) {
      setGenStepIdx(GEN_STEPS.length);
      setOverlayFading(true);
      const t = setTimeout(() => { setShowGenOverlay(false); setOverlayFading(false); }, 700);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioGenerating]);

  const handleSetupCoords = useCallback((lat: number, lon: number) => {
    setSetupCoords({ lat, lon });
    setMapCenter({ lat, lon });
    setAgents([]);
    setAppPhase('draw');
  }, []);

  const handleGenerateFromBoundary = useCallback(async (description: string, polygon: [number, number][]) => {
    setScenarioGenerating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/generate-scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, center_lat: setupCoords?.lat, center_lon: setupCoords?.lon, polygon }),
      });
      const data = await res.json() as {
        ok: boolean; neighborhood?: string;
        map_center?: { lat: number; lon: number };
        neighborhood_description?: string;
        pois?: POI[];
        agents?: Agent[];
        error?: string;
      };
      if (!data.ok) { setGenerateError(data.error ?? 'Generation failed.'); return; }
      if (data.map_center) setMapCenter(data.map_center);
      if (data.neighborhood_description) setNeighborhoodDescription(data.neighborhood_description);
      if (data.neighborhood) setCurrentNeighborhood(data.neighborhood);
      if (data.pois?.length) setPois(data.pois);

      // All state that drives the ready phase is set in one synchronous block so
      // React batches them into a single render — overlay dismisses and agents
      // appear at the same time.
      setNeighborhoodBoundary(polygon);
      setSelectedAgent(null);
      setCurrentShock('');
      setSelectedShockOption(null);
      setAgents(data.agents ?? []);
      setAppPhase('ready');
      setScenarioGenerating(false);

      const fetchId = ++shockOptsFetchId.current;
      setShockOptionsLoading(true);
      try {
        const opts = await fetch(`${BACKEND_URL}/shock-options`).then(r => r.json()) as ShockOption[];
        if (fetchId === shockOptsFetchId.current) setShockOptions(opts);
      } catch (e) {
        console.error('shock-options fetch failed', e);
      } finally {
        if (fetchId === shockOptsFetchId.current) setShockOptionsLoading(false);
      }
    } catch (err) {
      setGenerateError('Network error — is the backend running on port 8000?');
      setScenarioGenerating(false);
    }
  }, [setupCoords]);

  const handleShockSubmit = async (text: string) => {
    setCurrentShock(text);
    setShockLoading(true);
    try {
      await fetch(`${BACKEND_URL}/shock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch (err) { console.error('shock failed', err); setShockLoading(false); }
  };

  const handleResetShock = () => {
    setCurrentShock('');
    setSelectedShockOption(null);
    setAgents(prev => prev.map(a => ({ ...a, shock_stance: null, shock_rationale: null })));
  };

  const handleNewCity = useCallback(() => {
    shockOptsFetchId.current++; // invalidate any in-flight shock-options fetch
    setAppPhase('setup');
    setSetupCoords(null);
    setAgents([]);
    setSelectedAgent(null);
    setShockOptions([]);
    setShockOptionsLoading(false);
    setSelectedShockOption(null);
    setShockLoading(false);
    setCurrentShock('');
    setGenerateError(null);
    setScenarioGenerating(false);
    setCurrentNeighborhood('');
    setNeighborhoodDescription('');
    setNeighborhoodBoundary(null);
    setPois([]);
    setSpotlightPOI(null);
  }, []);

  if (appPhase === 'setup') return <SetupScreen onSubmit={handleSetupCoords} />;

  const isReady = appPhase === 'ready';

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', backgroundColor: '#0a0f1e' }}>
      <style>{`
        @keyframes pulse        { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes spinRing     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeSlideIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes progressPulse{ 0%,100%{opacity:1}50%{opacity:0.6} }
      `}</style>

      {/* Map — mounted once we leave setup, never remounts during draw→ready */}
      <GameMap
        agents={isReady ? agents : []}
        onAgentSelect={(agent) => setSelectedAgent(agent)}
        selectedAgentId={isReady ? (selectedAgent?.id ?? null) : null}
        mapCenter={mapCenter}
        setupMode={!isReady}
        onBoundaryGenerate={isReady ? undefined : handleGenerateFromBoundary}
        generating={scenarioGenerating}
        neighborhoodBoundary={isReady ? neighborhoodBoundary : null}
        pois={isReady ? pois : []}
        shockPending={shockLoading}
        selectedShockKeywords={selectedShockOption?.poi_keywords ?? []}
        spotlightPOI={isReady ? spotlightPOI : null}
      />

      {/* Draw-phase instruction banner */}
      {!isReady && !scenarioGenerating && !showGenOverlay && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, backgroundColor: 'rgba(10,12,28,0.92)',
          border: '1px solid #4f46e5', borderRadius: 10,
          padding: '10px 20px', pointerEvents: 'none',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 0 24px rgba(99,102,241,0.2)',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#818cf8', animation: 'pulse 1.4s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, color: '#c7d2fe', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Click to place boundary points · Double-click to close · Esc to cancel
          </span>
        </div>
      )}

      {/* Generating overlay — fades out when done */}
      {showGenOverlay && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 30,
          backgroundColor: 'rgba(2,8,23,0.88)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(6px)',
          opacity: overlayFading ? 0 : 1,
          transition: overlayFading ? 'opacity 0.7s ease' : 'none',
          pointerEvents: overlayFading ? 'none' : 'auto',
        }}>
          <div style={{ width: 440, maxWidth: '90vw' }}>
            <div style={{ marginBottom: 28, animation: 'fadeSlideIn 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#6366f1', boxShadow: '0 0 10px #6366f1', animation: 'progressPulse 1.6s ease-in-out infinite' }} />
                <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Generating simulation</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>Building your neighborhood</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 24 }}>
              {GEN_STEPS.map((step, i) => {
                const done = i < genStepIdx, active = i === genStepIdx, pending = i > genStepIdx;
                return (
                  <div key={step.label} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 9,
                    backgroundColor: active ? 'rgba(99,102,241,0.1)' : 'transparent',
                    border: active ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
                    opacity: pending ? 0.35 : 1,
                    transition: 'all 0.35s ease',
                  }}>
                    <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {done && <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="9" fill="rgba(34,197,94,0.15)" /><path d="M5 9l3 3 5-5" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      {active && <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #6366f1', borderTopColor: 'transparent', animation: 'spinRing 0.8s linear infinite' }} />}
                      {pending && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#334155' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: done ? '#64748b' : active ? '#e2e8f0' : '#475569' }}>{step.label}</div>
                      {active && <div style={{ fontSize: 11, color: '#6366f1', marginTop: 2 }}>{step.detail}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ height: 3, backgroundColor: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: genStepIdx >= GEN_STEPS.length
                  ? '100%'
                  : genStepIdx >= 2
                    ? '60%'
                    : `${(genStepIdx / GEN_STEPS.length) * 100}%`,
                backgroundColor: '#6366f1', borderRadius: 2,
                transition: genStepIdx >= 2 && genStepIdx < GEN_STEPS.length ? 'none' : 'width 0.8s ease',
                animation: genStepIdx >= 2 && genStepIdx < GEN_STEPS.length ? 'progressPulse 1.8s ease-in-out infinite' : 'none',
                boxShadow: '0 0 8px rgba(99,102,241,0.6)',
              }} />
            </div>
            <div style={{ fontSize: 11, color: '#334155', marginTop: 8, textAlign: 'right' }}>
              {(() => {
                const isLLMStep = genStepIdx >= 2 && genStepIdx < GEN_STEPS.length;
                const timedRemaining = Math.round(GEN_STEPS.slice(genStepIdx).reduce((s, st) => s + (st.ms ?? 0), 0) / 1000);
                if (isLLMStep) return <span style={{ animation: 'progressPulse 1.6s ease-in-out infinite', display: 'inline-block' }}>generating profiles…</span>;
                if (!isLLMStep && timedRemaining > 0) return `~${timedRemaining}s remaining`;
                return null;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {generateError && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 30, backgroundColor: 'rgba(127,29,29,0.97)',
          border: '1px solid #ef4444', borderRadius: 10, padding: '12px 20px', maxWidth: 480,
          display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <span style={{ fontSize: 13, color: '#fca5a5', flex: 1 }}>{generateError}</span>
          <button onClick={() => setGenerateError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: 0 }}>✕</button>
        </div>
      )}

      {/* Ready-phase UI */}
      {isReady && <OnboardingOverlay neighborhoodName={currentNeighborhood} neighborhoodDescription={neighborhoodDescription} />}
      {isReady && (
        <LeftPanel
          shockOptions={shockOptions}
          shockOptionsLoading={shockOptionsLoading}
          agents={agents}
          shockLoading={shockLoading}
          currentShock={currentShock}
          selectedShockOption={selectedShockOption}
          onShockOptionSelect={setSelectedShockOption}
          onShockSubmit={handleShockSubmit}
          onResetShock={handleResetShock}
          onAgentSelect={setSelectedAgent}
          onNewCity={handleNewCity}
        />
      )}
      {isReady && selectedAgent && (
        <AgentSidebar
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          shockLoading={shockLoading}
          currentShock={currentShock}
          pois={pois}
          onPOISpotlight={setSpotlightPOI}
        />
      )}
    </div>
  );
}
