import { useState } from 'react';
import type { QueryResult, QueryGroup, NarrativeEntry, CounterfactualResult } from '../types';
import NarrativeFeed from './NarrativeFeed';
import SentimentChart from './SentimentChart';
import CounterfactualPanel from './CounterfactualPanel';

interface ScenarioResult {
  neighborhood: string;
  agent_count: number;
}

interface LeftPanelProps {
  onQuerySubmit: (question: string) => Promise<void>;
  tick: number;
  isRunning: boolean;
  queryLoading: boolean;
  queryResult: QueryResult | null;
  narrativeEntries: NarrativeEntry[];
  shockText: string;
  onShockSubmit: (text: string) => Promise<void>;
  shockLoading: boolean;
  onScenarioGenerate: (description: string) => Promise<ScenarioResult | null>;
  scenarioGenerating: boolean;
  currentNeighborhood: string;
  onCounterfactual: (policy: string, nTicks: number) => Promise<CounterfactualResult | null>;
  counterfactualLoading: boolean;
  activeShock: string;
}

const SECTION: React.CSSProperties = {
  fontSize: 11, color: '#64748b', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 8,
};

function SentimentBar({ value }: { value: number }) {
  const pct = ((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100;
  const color = value <= -0.3 ? '#ef4444' : value >= 0.3 ? '#22c55e' : '#eab308';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, backgroundColor: '#1e293b', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: '#334155' }} />
        <div style={{
          position: 'absolute',
          left: value < 0 ? `${pct}%` : '50%',
          width: value < 0 ? `${50 - pct}%` : `${pct - 50}%`,
          top: 0, bottom: 0, backgroundColor: color, borderRadius: 3,
          transition: 'all 0.6s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>
        {value >= 0 ? '+' : ''}{value.toFixed(2)}
      </span>
    </div>
  );
}

function GroupCard({ group }: { group: QueryGroup }) {
  const [expanded, setExpanded] = useState(false);
  const color = group.avg_sentiment <= -0.3 ? '#ef4444' : group.avg_sentiment >= 0.3 ? '#22c55e' : '#eab308';
  return (
    <div style={{ marginBottom: 8, backgroundColor: '#0f172a', borderRadius: 6, border: '1px solid #1e293b', overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600 }}>{group.group}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#475569' }}>{group.count}</span>
          <span style={{ fontSize: 11, color, fontWeight: 700 }}>
            {group.avg_sentiment >= 0 ? '+' : ''}{group.avg_sentiment.toFixed(2)}
          </span>
          <span style={{ fontSize: 9, color: '#475569' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 10px 8px' }}>
          {group.members.map(m => (
            <div key={m.id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{m.name}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: m.sentiment <= -0.3 ? '#ef4444' : m.sentiment >= 0.3 ? '#22c55e' : '#eab308',
                }}>
                  {m.sentiment >= 0 ? '+' : ''}{m.sentiment.toFixed(2)}
                </span>
              </div>
              {m.opinion && (
                <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                  "{m.opinion}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeftPanel({
  onQuerySubmit, tick, isRunning, queryLoading, queryResult,
  narrativeEntries, shockText, onShockSubmit, shockLoading,
  onScenarioGenerate, scenarioGenerating, currentNeighborhood,
  onCounterfactual, counterfactualLoading, activeShock,
}: LeftPanelProps) {
  const [queryText, setQueryText] = useState('');
  const [localShock, setLocalShock] = useState(shockText);
  const [scenarioDesc, setScenarioDesc] = useState('');
  const [lastGenerated, setLastGenerated] = useState<ScenarioResult | null>(null);
  const [policyText, setPolicyText] = useState('');
  const [nTicks, setNTicks] = useState(5);
  const [cfResult, setCfResult] = useState<CounterfactualResult | null>(null);

  const submitQuery = async () => {
    if (!queryText.trim() || queryLoading) return;
    await onQuerySubmit(queryText.trim());
  };

  const submitShock = async () => {
    if (!localShock.trim() || shockLoading) return;
    await onShockSubmit(localShock.trim());
  };

  const submitScenario = async () => {
    if (!scenarioDesc.trim() || scenarioGenerating) return;
    const result = await onScenarioGenerate(scenarioDesc.trim());
    if (result) {
      setLastGenerated(result);
      setScenarioDesc('');
    }
  };

  const submitCounterfactual = async () => {
    if (!policyText.trim() || counterfactualLoading || !activeShock) return;
    const result = await onCounterfactual(policyText.trim(), nTicks);
    if (result) setCfResult(result);
  };

  return (
    <div style={{
      width: 300, minWidth: 300, height: '100vh',
      backgroundColor: '#0b1120',
      borderRight: '1px solid #1e293b',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.01em' }}>Society Sim</div>
        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
          <span style={{ color: isRunning ? '#22c55e' : '#475569', marginRight: 4 }}>
            {isRunning ? '●' : '○'}
          </span>
          {isRunning ? 'Live' : 'Idle'} · Tick {tick} · 40 residents
        </div>
      </div>

      {/* Generate New Community */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={SECTION}>Generate New Community</div>
        <p style={{ fontSize: 11, color: '#475569', lineHeight: 1.55, margin: '0 0 8px' }}>
          Describe any community — a new cast of 40 residents is generated and the simulation restarts.{' '}
          <span style={{ color: '#334155' }}>(20–30s)</span>
        </p>
        <textarea
          value={scenarioDesc}
          onChange={e => setScenarioDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitScenario(); } }}
          placeholder="e.g. A rural Appalachian town where the last coal mine is closing and a solar farm is being proposed"
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '7px 9px',
            backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 6,
            color: '#e2e8f0', fontSize: 12, resize: 'none', outline: 'none',
            fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
        <button
          onClick={submitScenario}
          disabled={!scenarioDesc.trim() || scenarioGenerating}
          style={{
            marginTop: 7, width: '100%', padding: '8px 0',
            backgroundColor: scenarioDesc.trim() && !scenarioGenerating ? '#7c3aed' : '#1e293b',
            border: 'none', borderRadius: 6,
            color: scenarioDesc.trim() && !scenarioGenerating ? '#fff' : '#475569',
            fontSize: 12, fontWeight: 600,
            cursor: scenarioDesc.trim() && !scenarioGenerating ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s',
          }}
        >
          {scenarioGenerating ? 'Generating community… (20–30s)' : 'Generate New Community'}
        </button>
        {lastGenerated && !scenarioGenerating && (
          <div style={{
            marginTop: 7, padding: '6px 9px',
            backgroundColor: '#0f172a', border: '1px solid #3730a3',
            borderRadius: 6, fontSize: 11, color: '#a5b4fc',
          }}>
            Now simulating: <strong style={{ color: '#c4b5fd' }}>{lastGenerated.neighborhood}</strong>
            {' '}({lastGenerated.agent_count} agents)
          </div>
        )}
        {!lastGenerated && currentNeighborhood && (
          <div style={{ marginTop: 5, fontSize: 10, color: '#334155' }}>
            Current: {currentNeighborhood}
          </div>
        )}
      </div>

      {/* Shock Injection */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={SECTION}>Inject a Shock</div>
        <p style={{ fontSize: 11, color: '#475569', lineHeight: 1.55, margin: '0 0 8px' }}>
          Describe a city event. All 40 agents will react based on how it affects their daily life.
        </p>
        <textarea
          value={localShock}
          onChange={e => setLocalShock(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitShock(); } }}
          placeholder="e.g. A highway closure reroutes all truck traffic through Street S"
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '7px 9px',
            backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 6,
            color: '#e2e8f0', fontSize: 12, resize: 'none', outline: 'none',
            fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
        <button
          onClick={submitShock}
          disabled={!localShock.trim() || shockLoading}
          style={{
            marginTop: 7, width: '100%', padding: '8px 0',
            backgroundColor: localShock.trim() && !shockLoading ? '#ef4444' : '#1e293b',
            border: 'none', borderRadius: 6,
            color: localShock.trim() && !shockLoading ? '#fff' : '#475569',
            fontSize: 12, fontWeight: 600,
            cursor: localShock.trim() && !shockLoading ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s',
          }}
        >
          {shockLoading ? 'Injecting…' : 'Inject Shock'}
        </button>
      </div>

      {/* Live Events narrative feed */}
      <NarrativeFeed entries={narrativeEntries} />

      {/* Sentiment timeline chart */}
      <SentimentChart currentTick={tick} />

      {/* What If? Counterfactual */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={SECTION}>What If? Counterfactual</div>
        <p style={{ fontSize: 11, color: '#475569', lineHeight: 1.55, margin: '0 0 8px' }}>
          Fork the live simulation, run a policy intervention on a copy, and compare sentiment
          trajectories. Requires a shock to be active.
          {' '}<span style={{ color: '#334155' }}>({nTicks} Haiku ticks × 2 branches)</span>
        </p>
        <textarea
          value={policyText}
          onChange={e => setPolicyText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCounterfactual(); } }}
          placeholder="e.g. The city announces a $2M buyout fund for displaced residents"
          rows={2}
          disabled={!activeShock}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '7px 9px',
            backgroundColor: activeShock ? '#1e293b' : '#111827',
            border: '1px solid #334155', borderRadius: 6,
            color: activeShock ? '#e2e8f0' : '#334155',
            fontSize: 12, resize: 'none', outline: 'none',
            fontFamily: 'inherit', lineHeight: 1.5,
            cursor: activeShock ? 'text' : 'not-allowed',
          }}
        />
        {/* N ticks selector */}
        <div style={{ display: 'flex', gap: 4, margin: '6px 0 7px', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#475569', marginRight: 2 }}>Ticks:</span>
          {[3, 5, 10].map(n => (
            <button
              key={n}
              onClick={() => setNTicks(n)}
              style={{
                padding: '3px 10px', borderRadius: 4, border: 'none',
                backgroundColor: nTicks === n ? '#334155' : '#1e293b',
                color: nTicks === n ? '#e2e8f0' : '#475569',
                fontSize: 11, cursor: 'pointer', fontWeight: nTicks === n ? 700 : 400,
              }}
            >{n}</button>
          ))}
        </div>
        <button
          onClick={submitCounterfactual}
          disabled={!policyText.trim() || counterfactualLoading || !activeShock}
          style={{
            width: '100%', padding: '8px 0',
            backgroundColor: policyText.trim() && !counterfactualLoading && activeShock ? '#0e7490' : '#1e293b',
            border: 'none', borderRadius: 6,
            color: policyText.trim() && !counterfactualLoading && activeShock ? '#fff' : '#475569',
            fontSize: 12, fontWeight: 600,
            cursor: policyText.trim() && !counterfactualLoading && activeShock ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s',
          }}
        >
          {counterfactualLoading
            ? `Running ${nTicks} ticks on 2 branches…`
            : activeShock
              ? 'Run Comparison'
              : 'Inject a shock first'}
        </button>
        {!activeShock && (
          <div style={{ marginTop: 5, fontSize: 10, color: '#334155' }}>
            Inject a shock to enable counterfactual forking.
          </div>
        )}
        {cfResult && !counterfactualLoading && (
          <CounterfactualPanel result={cfResult} />
        )}
      </div>

      {/* Query */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={SECTION}>Ask the Neighborhood</div>
        <p style={{ fontSize: 11, color: '#475569', lineHeight: 1.55, margin: '0 0 8px' }}>
          Ask all 40 residents a policy question. Dots turn{' '}
          <span style={{ color: '#22c55e', fontWeight: 600 }}>green</span>,{' '}
          <span style={{ color: '#eab308', fontWeight: 600 }}>yellow</span>, or{' '}
          <span style={{ color: '#ef4444', fontWeight: 600 }}>red</span> based on their stance.
        </p>
        <textarea
          value={queryText}
          onChange={e => setQueryText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuery(); } }}
          placeholder="e.g. Should we add bike lanes on Street S?"
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '7px 9px',
            backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 6,
            color: '#e2e8f0', fontSize: 12, resize: 'none', outline: 'none',
            fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
        <button
          onClick={submitQuery}
          disabled={!queryText.trim() || queryLoading}
          style={{
            marginTop: 7, width: '100%', padding: '8px 0',
            backgroundColor: queryText.trim() && !queryLoading ? '#6366f1' : '#1e293b',
            border: 'none', borderRadius: 6,
            color: queryText.trim() && !queryLoading ? '#fff' : '#475569',
            fontSize: 12, fontWeight: 600,
            cursor: queryText.trim() && !queryLoading ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s',
          }}
        >
          {queryLoading ? 'Asking all residents…' : 'Ask All Residents'}
        </button>
      </div>

      {/* Query Results */}
      {queryResult && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic', marginBottom: 12, lineHeight: 1.5 }}>
            "{queryResult.question}"
          </div>

          {(() => {
            const support = queryResult.all_responses.filter(r => r.sentiment >= 0.3).length;
            const oppose  = queryResult.all_responses.filter(r => r.sentiment <= -0.3).length;
            const neutral = queryResult.total_responses - support - oppose;
            return (
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <div style={{ flex: 1, textAlign: 'center', backgroundColor: '#052e16', borderRadius: 8, padding: '7px 4px', border: '1px solid #166534' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e', lineHeight: 1 }}>{support}</div>
                  <div style={{ fontSize: 9, color: '#4ade80', fontWeight: 600, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Support</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', backgroundColor: '#1c1200', borderRadius: 8, padding: '7px 4px', border: '1px solid #713f12' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#eab308', lineHeight: 1 }}>{neutral}</div>
                  <div style={{ fontSize: 9, color: '#fbbf24', fontWeight: 600, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Neutral</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', backgroundColor: '#2d0000', borderRadius: 8, padding: '7px 4px', border: '1px solid #7f1d1d' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>{oppose}</div>
                  <div style={{ fontSize: 9, color: '#f87171', fontWeight: 600, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Oppose</div>
                </div>
              </div>
            );
          })()}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
              Overall Consensus
            </div>
            <SentimentBar value={queryResult.overall_sentiment} />
          </div>

          <div style={SECTION}>By Group</div>
          {queryResult.groups.map(g => <GroupCard key={g.group} group={g} />)}
        </div>
      )}
    </div>
  );
}
