# Society Simulation — CLAUDE.md

## What This Is

A Smallville-style multi-agent society simulator built for CS153. 40 LLM-backed agents live in a fictional city neighborhood (Boerum Hill, Brooklyn). When a "shock" (policy change, infrastructure event, geopolitical disruption) is injected, agents react based on their individual profiles, memory streams, and social relationships — then the orchestrator synthesizes collective behavior and policy recommendations.

The goal is to model how societies process change: belief propagation, coalition formation, demographic divergence, and emergent collective behavior that no single agent produces alone.

## How to Run

**Backend:**
```bash
cd /Users/mohitdoshi/Desktop/CS153_Proj\ V2
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm run dev   # runs on localhost:5173
```

Requires `ANTHROPIC_API_KEY` in `.env`.

## Architecture

```
main.py (FastAPI)
├── /shock       POST — inject a world event
├── /query       POST — fan out a policy question to all 40 agents
├── /control     POST — start | pause | resume | stop
├── /agents      GET  — current snapshot
├── /ws          WebSocket — real-time tick broadcasts
└── /ws/think/:id  WebSocket — token-stream an agent's live reasoning

engine/
├── agent.py        — Agent + Memory dataclasses
├── simulation.py   — SimulationEngine: tick loop, conversations, reflections, orchestrator
├── decision.py     — Per-tick LLM call for each agent (Haiku, prompt-cached)
├── memory.py       — Recency + importance + relevance scoring; retrieve_memories()
├── reflection.py   — Importance scoring (LLM) + reflection synthesis (Sonnet)
├── conversation.py — Two co-located agents dialogue at a POI (Sonnet)
├── orchestrator.py — Community-level synthesis + policy recommendations (Sonnet)
├── shock.py        — Inject shock into all agent memory streams
├── query.py        — Fan-out policy question, group by occupation category
└── pois.py         — POI coordinates + neighborhood description string

frontend/src/
├── App.tsx             — WS connection, state, query handler
├── components/GameMap  — Pixel map with agent dots
├── components/LeftPanel— Shock input, query panel, orchestrator output
├── components/AgentSidebar — Per-agent thought/action/memory viewer
└── types.ts
```

## Models Used and Why

| Call | Model | Reason |
|---|---|---|
| Agent tick (per agent, per tick) | `claude-haiku-4-5-20251001` | 40 parallel calls — cost + speed |
| Agent tick system prompt | cached with `cache_control: ephemeral` | Bio is static across ticks |
| Reflection synthesis | `claude-sonnet-4-6` | Higher-order insight needs more reasoning |
| Importance scoring | `claude-sonnet-4-6` | Short call but quality matters for memory retrieval |
| Conversation (2 agents at POI) | `claude-sonnet-4-6` | Dialogue quality matters |
| Orchestrator synthesis | `claude-sonnet-4-6` | Community analysis + policy recommendations |
| Policy query (fan-out) | `claude-haiku-4-5-20251001` | 40 parallel short calls |

## Tick Flow

1. If no shock injected: broadcast positions only (no LLM calls)
2. Orchestrator does NOT currently run before agents — it's a post-hoc synthesizer (known gap)
3. All 40 agents run in parallel via `ThreadPoolExecutor(max_workers=10)`
4. Co-located agents at same POI may converse (up to 4 POIs per tick, 2 agents each)
5. Agents whose cumulative memory importance exceeds threshold trigger a reflection
6. Orchestrator synthesizes all agent states → summary, concerns, policy recommendations
7. Full snapshot broadcast via WebSocket to all connected clients

## Memory System

- Each agent has a `memory_stream: list[Memory]`
- `Memory` fields: `content`, `timestamp` (tick), `importance` (1–10, LLM-scored), `keywords`
- Retrieval scores each memory: `(recency + importance + relevance) / 3`
  - Recency: `0.995 ^ (current_tick - memory_tick)` — exponential decay (TA-recommended)
  - Importance: LLM-scored via `reflection.score_importance()` (Sonnet call)
  - Relevance: keyword overlap with current query/shock keywords
- Reflection triggers when cumulative importance of new memories ≥ 24.0
- **Known gap**: memory grows unbounded — needs consolidation at scale

## Known Architectural Gaps (Priority Order)

1. **Shock broadcast is simultaneous** — all 40 agents get it at tick 0. Real information cascades through the social graph with latency and distortion. Tiered activation (Tier 1: directly affected → Tier 2: their network → Tier 3: general) would fix this.
2. **Orchestrator runs after agents, not before** — it should decompose the shock, assign personalized impact briefs per agent, then collect responses. Currently it's just a summarizer.
3. **Relationships are static** — edge weights should evolve based on conversation frequency and sentiment alignment.
4. **No counterfactual** — no way to run two parallel timelines (with/without a policy intervention) and compare sentiment trajectories. This is the key enterprise-value feature.
5. **Importance hardcoded fallback** — `memory.py` still defaults to `5.0` in some paths. All memories should go through `score_importance()`.
6. **No belief state** — agents don't track *what they believe happened* separately from *what actually happened*. Belief divergence across the population is the interesting emergent signal.

## TA Feedback (May 2026)

**TA 1:**
- UI is overwhelming — missing context about what's happening and why. The story the demo email told should be surfaced in the UI itself (onboarding, narrative layer).
- Needs clearer explanation of AI usage: which models, for what, why. (See table above.)

**TA 2 (LLM personas / values extraction researcher):**
- Architecture is LLM-based agents with memory + prompting (confirmed — not fine-tuned, not hybrid economic models).
- Suggestion: **value extraction onboarding** — instead of hardcoded bios, extract agent values and preferences interactively, then generate custom prompts from those. This would make agents more grounded and differentiated.
- Exponential decay for memory already implemented (`0.995 ^ delta_tick`).
- Summarization-based policy feedback synthesis is sufficient for this scope.
- **Evaluation question (critical):** What does "correct" mean here?
  - What ground truth are we comparing against?
  - Could match simulated responses to real survey data (Pew Research, local government surveys)?
  - Could validate sentiment trajectories against historical case studies (e.g., a real highway closure and the documented community response)?
  - Agent-based models can fail silently — need an explicit correctness criterion before the final demo.

**Relevant papers (TA 2 recommendations):**
- https://doi.org/10.48550/arXiv.2410.22203
- https://arxiv.org/abs/2403.03407

## What Makes This Different From Other Agent Projects

Most class projects: `[user prompt] → [N agents in parallel] → [aggregate]`

This system models:
- **Belief propagation** — information spreading through a social graph with distortion
- **Coalition formation** — emergent groupings nobody programmed
- **Demographic divergence** — the same shock produces fundamentally different responses by occupation/age/relationship distance from the event
- **Policy counterfactuals** — (not yet built) comparing intervention vs. no-intervention timelines

The product isn't the dots on the map. It's the synthesized stakeholder brief: which demographic groups resist, what their specific objection is, what intervention moves the needle.

## Agents

40 agents in `agents.json`. Do not edit this file directly — use `generate_agents.py` to regenerate. Agents have: `id`, `name`, `age`, `occupation`, `bio`, `home` (lat/lon), `relationships` (list of agent IDs).

## Environment

- Python 3.12, venv at `./venv`
- Node for frontend, packages in `frontend/node_modules`
- Never commit `.env`
- `agents.json` is the source of truth for agent profiles — don't hardcode agent data elsewhere
