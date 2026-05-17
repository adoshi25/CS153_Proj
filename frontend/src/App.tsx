import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent, Conversation, Orchestrator, PublicAction, Snapshot } from './types';
import GameMap from './components/GameMap';
import AgentSidebar from './components/AgentSidebar';
import LeftPanel from './components/LeftPanel';

const WS_URL = 'ws://localhost:8000/ws';
const BACKEND_URL = 'http://localhost:8000';
const MAX_HISTORY = 20;

export default function App() {
  const [tick, setTick] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [orchestrator, setOrchestrator] = useState<Orchestrator | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [publicActions, setPublicActions] = useState<PublicAction[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [processing, setProcessing] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentimentHistoryRef = useRef<Map<string, number[]>>(new Map());
  const [, forceRender] = useState(0);

  const connectWS = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event: MessageEvent) => {
      try {
        const snap = JSON.parse(event.data as string) as Snapshot;
        setTick(snap.tick);
        setAgents(snap.agents);
        if (snap.orchestrator) setOrchestrator(snap.orchestrator);
        if (snap.conversations) setConversations(prev => [...snap.conversations, ...prev].slice(0, 30));
        if (snap.public_actions) setPublicActions(snap.public_actions);
        if (snap.tick >= 0) setIsRunning(true);
        setProcessing(false);

        // Track sentiment history per agent
        snap.agents.forEach(a => {
          const hist = sentimentHistoryRef.current.get(a.id) ?? [];
          hist.push(a.sentiment);
          if (hist.length > MAX_HISTORY) hist.shift();
          sentimentHistoryRef.current.set(a.id, hist);
        });
        forceRender(n => n + 1);

        setSelectedAgent(prev => {
          if (!prev) return null;
          return snap.agents.find(a => a.id === prev.id) ?? prev;
        });
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

  const handleShockSubmit = async (text: string) => {
    try {
      setProcessing(true);
      await fetch(`${BACKEND_URL}/shock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      setProcessing(false);
    }
  };

  const handleAgentSelect = useCallback((agent: Agent) => setSelectedAgent(agent), []);
  const handleAgentDeselect = useCallback(() => setSelectedAgent(null), []);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#0f172a' }}>
      <LeftPanel
        onShockSubmit={handleShockSubmit}
        tick={tick}
        isRunning={isRunning}
        processing={processing}
        orchestrator={orchestrator}
        conversations={conversations}
        publicActions={publicActions}
      />

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <GameMap
          agents={agents}
          onAgentSelect={handleAgentSelect}
          selectedAgentId={selectedAgent?.id ?? null}
        />
      </div>

      {selectedAgent && (
        <AgentSidebar
          agent={selectedAgent}
          onClose={handleAgentDeselect}
          sentimentHistory={sentimentHistoryRef.current.get(selectedAgent.id) ?? []}
        />
      )}
    </div>
  );
}
