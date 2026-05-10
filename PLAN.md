# Society Simulation — Build Plan

## What We're Building
A visual, real-time simulation of 40 persistent agents (people in a neighborhood) who respond to a shock — a highway being built through their community. Agents have memory, relationships, and LLM-driven reasoning. Outcomes are emergent, not scripted.

Closest prior work: Park et al. 2023 (Smallville). Key difference: we inject a real-world shock and observe collective response as a predictive tool.

---

## Steps

### Step 1 — Project Setup ✓
- [x] Create directory structure
- [x] `requirements.txt` with all dependencies
- [x] `.env.example` for API keys
- [x] Confirm environment runs

### Step 2 — Agent Schema ✓
- [x] Define `Agent` dataclass: bio, preferences, location, relationships, memory stream
- [x] Write 40 agent profiles (diverse archetypes: biker, car commuter, elderly resident, small business owner, parent, etc.)
- [x] Assign relationship graph (each agent knows ~5 others)
- [x] Serialize agents to `agents.json`

### Step 3 — Memory System ✓
- [ ] `MemoryStream` class: add observation, score importance (via LLM), store with timestamp
- [ ] Retrieval: top-K memories by combined score (recency + importance + keyword relevance)
- [ ] Reflection: every 10 ticks, synthesize memories into higher-order beliefs
- [ ] Unit test: add 20 memories, retrieve top 5, verify ordering

### Step 4 — Agent Decision Loop
- [ ] `agent_tick(agent, world_state)` — one agent, one tick
  - Perceive: what changed in the world? what did neighbors do last tick?
  - Retrieve: top-K relevant memories
  - Decide: LLM call → structured output `{ thought, action, sentiment }`
  - Emit: store decision back to memory stream
- [ ] Prompt template with prompt caching (bio + scenario static, memories dynamic)
- [ ] Unit test: single agent responds to shock, output looks sane

### Step 5 — Shock Injection
- [ ] `inject_shock(shock_description)` — adds high-importance observation to all agents at tick 0
- [ ] Shock: *"A new highway has been proposed to run through Oak Street, displacing 12 homes and 3 businesses."*
- [ ] Verify shock surfaces correctly in each agent's retrieval

### Step 6 — Simulation Engine
- [ ] `SimulationEngine`: orchestrates 40 agents across N ticks
- [ ] Each tick: run all agents (async, parallel where possible), collect actions
- [ ] Pass neighbor actions into next tick's world state
- [ ] Persist full simulation history to `simulation_output.json`
- [ ] Test: run 10 ticks, inspect output, verify divergent responses

### Step 7 — FastAPI + WebSocket Backend
- [ ] `POST /simulate` — start a simulation run (returns run_id)
- [ ] `GET /ws/{run_id}` — WebSocket stream of tick-by-tick world state
- [ ] `GET /agent/{agent_id}` — full agent state (memories, current thought)
- [ ] `POST /shock` — inject a new shock mid-simulation
- [ ] Broadcast format: `{ tick, agents: [{ id, lat, lon, sentiment, current_thought }] }`

### Step 8 — Frontend: Base Map
- [ ] React app scaffolded (Vite)
- [ ] MapLibre GL map centered on a neighborhood
- [ ] 40 agent icons placed at their home coordinates
- [ ] WebSocket connection to backend, updates on each tick

### Step 9 — Frontend: Agent Visualization
- [ ] Agents colored by sentiment (green=positive, red=negative, gray=neutral/undecided)
- [ ] Sentiment updates smoothly each tick — watch opinion spread in real time
- [ ] Relationship edges visible as faint lines between connected agents

### Step 10 — Frontend: Agent Inspector
- [ ] Click any agent → side panel opens
- [ ] Shows: name, bio snippet, current thought, last 5 memories, current sentiment
- [ ] Panel updates live as simulation ticks forward

### Step 11 — Frontend: Simulation Controls
- [ ] Play / Pause / Reset buttons
- [ ] Speed control (tick interval slider)
- [ ] Shock injection input: type a new event, hit "Inject" mid-simulation
- [ ] Tick counter + progress bar

### Step 12 — End-to-End Run + Polish
- [ ] Run full 40-agent, 100-tick simulation
- [ ] Verify emergent divergence: agents should disagree, change minds, form clusters
- [ ] Fix any obviously broken behavior
- [ ] Screenshot / record demo

---

## Tech Stack
| Layer | Choice |
|---|---|
| Backend | Python, FastAPI, asyncio |
| LLM | Claude Haiku (claude-haiku-4-5) via Anthropic SDK, prompt caching |
| Agents | In-memory, serialized to JSON |
| Frontend | React (Vite), MapLibre GL |
| Realtime | WebSocket |

## Cost Estimate
- 40 agents × 100 ticks × ~5K tokens = ~20M tokens/run
- With prompt caching on static content: ~$25–35/run at Haiku pricing
- 20 runs: ~$500–700 total

## File Structure (target)
```
CS153_Proj V2/
├── PLAN.md
├── .env.example
├── requirements.txt
├── agents.json              # 40 agent profiles + relationship graph
├── engine/
│   ├── agent.py             # Agent dataclass
│   ├── memory.py            # MemoryStream
│   ├── decision.py          # agent_tick() + LLM prompt
│   ├── simulation.py        # SimulationEngine
│   └── shock.py             # inject_shock()
├── main.py                  # FastAPI app
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── Map.jsx
    │   ├── AgentLayer.jsx
    │   └── AgentPanel.jsx
    └── package.json
```
