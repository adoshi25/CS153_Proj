import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent, Snapshot, QueryResult, QueryMember, NarrativeEntry } from './types';
import GameMap from './components/GameMap';
import AgentSidebar from './components/AgentSidebar';
import LeftPanel from './components/LeftPanel';
import OnboardingOverlay from './components/OnboardingOverlay';

const WS_URL = 'ws://localhost:8000/ws';
const BACKEND_URL = 'http://localhost:8000';

const MAX_NARRATIVE = 60;

export default function App() {
  const [tick, setTick] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryQuestion, setQueryQuestion] = useState<string | null>(null);
  const [narrativeEntries, setNarrativeEntries] = useState<NarrativeEntry[]>([]);
  const [shockText, setShockText] = useState('');
  const [shockLoading, setShockLoading] = useState(false);
  const [scenarioGenerating, setScenarioGenerating] = useState(false);
  const [currentNeighborhood, setCurrentNeighborhood] = useState('City Center');
  const [counterfactualLoading, setCounterfactualLoading] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track which ticks we have already logged to avoid duplicates on reconnect
  const loggedTicksRef = useRef<Set<number>>(new Set());

  const connectWS = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event: MessageEvent) => {
      try {
        const snap = JSON.parse(event.data as string) as Snapshot;
        setTick(snap.tick);
        setAgents(snap.agents);
        if (snap.tick >= 0) setIsRunning(true);
        setSelectedAgent(prev => prev ? (snap.agents.find(a => a.id === prev.id) ?? prev) : null);

        // Accumulate narrative entries (deduplicated by tick)
        if (!loggedTicksRef.current.has(snap.tick)) {
          loggedTicksRef.current.add(snap.tick);
          const newEntries: NarrativeEntry[] = [];

          for (const conv of snap.conversations ?? []) {
            newEntries.push({
              tick: snap.tick,
              text: `${conv.summary} (at ${conv.location})`,
              kind: 'conversation',
            });
          }

          // Show up to 3 public actions per tick so the feed stays readable
          const shownActions = (snap.public_actions ?? []).slice(0, 3);
          for (const pa of shownActions) {
            newEntries.push({
              tick: snap.tick,
              text: `${pa.name} — ${pa.action}`,
              kind: 'action',
            });
          }

          if (newEntries.length > 0) {
            setNarrativeEntries(prev =>
              [...prev, ...newEntries].slice(-MAX_NARRATIVE)
            );
          }
        }
      } catch (err) {
        console.error('WS parse error', err);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      reconnectTimerRef.current = setTimeout(connectWS, 3000);
    };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    fetch(`${BACKEND_URL}/agents`)
      .then(r => r.json())
      .then((snap: Snapshot) => { if (snap.agents?.length) { setAgents(snap.agents); setTick(snap.tick); } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    connectWS();
    return () => {
      reconnectTimerRef.current && clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connectWS]);

  const handleQuerySubmit = async (question: string) => {
    setQueryLoading(true);
    setQueryQuestion(question);
    try {
      const res = await fetch(`${BACKEND_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json() as QueryResult;
      setQueryResult(data);

      // Overlay query sentiments onto agent dots
      setAgents(prev => prev.map(a => {
        const match = data.all_responses.find(r => r.id === a.id);
        return match ? { ...a, sentiment: match.sentiment } : a;
      }));
    } catch (err) {
      console.error('query failed', err);
    } finally {
      setQueryLoading(false);
    }
  };

  const handleShockSubmit = async (text: string) => {
    setShockLoading(true);
    setShockText(text);
    try {
      await fetch(`${BACKEND_URL}/shock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      // Clear previous narrative when a new shock is injected
      setNarrativeEntries([]);
      loggedTicksRef.current.clear();
    } catch (err) {
      console.error('shock failed', err);
    } finally {
      setShockLoading(false);
    }
  };

  const handleScenarioGenerate = async (description: string) => {
    setScenarioGenerating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/generate-scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await res.json() as { ok: boolean; neighborhood?: string; agent_count?: number; error?: string };
      if (!data.ok) {
        console.error('generate-scenario failed:', data.error);
        return null;
      }
      setCurrentNeighborhood(data.neighborhood ?? 'City Center');
      // Clear simulation state — new agents will arrive via WebSocket
      setNarrativeEntries([]);
      setQueryResult(null);
      setQueryQuestion(null);
      setSelectedAgent(null);
      setShockText('');
      loggedTicksRef.current.clear();
      return { neighborhood: data.neighborhood ?? 'City Center', agent_count: data.agent_count ?? 0 };
    } catch (err) {
      console.error('generate-scenario error:', err);
      return null;
    } finally {
      setScenarioGenerating(false);
    }
  };

  const handleCounterfactual = async (policy: string, nTicks: number) => {
    setCounterfactualLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/counterfactual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy, n_ticks: nTicks }),
      });
      return await res.json();
    } catch (err) {
      console.error('counterfactual failed:', err);
      return null;
    } finally {
      setCounterfactualLoading(false);
    }
  };

  const handleAgentSelect = useCallback((agent: Agent) => setSelectedAgent(agent), []);
  const handleAgentDeselect = useCallback(() => setSelectedAgent(null), []);

  const queryOpinion: QueryMember | null = selectedAgent && queryResult
    ? (queryResult.all_responses.find(r => r.id === selectedAgent.id) ?? null)
    : null;

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#0a0f1e' }}>
      <OnboardingOverlay />

      <LeftPanel
        onQuerySubmit={handleQuerySubmit}
        tick={tick}
        isRunning={isRunning}
        queryLoading={queryLoading}
        queryResult={queryResult}
        narrativeEntries={narrativeEntries}
        shockText={shockText}
        onShockSubmit={handleShockSubmit}
        shockLoading={shockLoading}
        onScenarioGenerate={handleScenarioGenerate}
        scenarioGenerating={scenarioGenerating}
        currentNeighborhood={currentNeighborhood}
        onCounterfactual={handleCounterfactual}
        counterfactualLoading={counterfactualLoading}
        activeShock={shockText}
      />

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <GameMap
          agents={agents}
          onAgentSelect={handleAgentSelect}
          selectedAgentId={selectedAgent?.id ?? null}
          queryQuestion={queryQuestion}
          queryLoading={queryLoading}
        />
      </div>

      {selectedAgent && (
        <AgentSidebar
          agent={selectedAgent}
          onClose={handleAgentDeselect}
          queryOpinion={queryOpinion}
        />
      )}
    </div>
  );
}
