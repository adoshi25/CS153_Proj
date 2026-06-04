# Society Simulation — CS153 Final Project

A Smallville-style multi-agent society simulator. 40 LLM-backed agents live in a fictional urban neighborhood. When a policy shock is injected (rezoning, infrastructure change, eviction policy), every agent reacts based on their individual biography, memory stream, social relationships, and past experience — then an orchestrator synthesizes collective behavior into a stakeholder brief.

**The core insight:** policymakers don't know which demographic groups resist a proposal, why, or what would shift their position. This system produces that answer automatically, grounded in realistic agent behavior rather than aggregate statistics.

---

## Setup & Reproduction

### Prerequisites
- Python 3.12+
- Node.js 18+
- An Anthropic API key (the simulation makes ~40–80 LLM calls per tick)

### 1. Clone and enter the repo
```bash
git clone <repo-url>
cd CS153_Proj
```

### 2. Create your `.env` file
```bash
cp .env.example .env
# Open .env and replace with your actual key:
# ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Set up the Python backend
```bash
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Set up the frontend
```bash
cd frontend
npm install
cd ..
```

### 5. Run the backend
```bash
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### 6. Run the frontend (separate terminal)
```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## How to Use

1. **Inject a shock** — type any policy event into the shock input (e.g. *"The city is closing Flatbush Ave to through traffic"*) and press Inject
2. **Watch agents react** — each of the 40 agents processes the shock in parallel; their stances appear on the map in real time
3. **Read the stakeholder brief** — the orchestrator synthesizes all 40 responses into a grouped summary by occupation, age, and proximity
4. **Query a counterfactual** — use the policy query panel to ask "what if" questions across the full population
5. **Click any agent** — view their individual thought process, memory stream, and rationale

---

## Technical Architecture

### Models Used

| Call | Model | Why |
|---|---|---|
| Agent tick decision | `claude-haiku-4-5-20251001` | 40 parallel calls — cost + speed |
| Agent system prompt | prompt-cached | Bio is static across ticks |
| Reflection synthesis | `claude-sonnet-4-6` | Higher-order reasoning |
| Importance scoring | `claude-sonnet-4-6` | Quality matters for memory retrieval |
| Agent conversations | `claude-sonnet-4-6` | Dialogue quality |
| Orchestrator synthesis | `claude-sonnet-4-6` | Community analysis + policy recommendations |
| Policy query fan-out | `claude-haiku-4-5-20251001` | 40 parallel short calls |

### Memory System

Each agent maintains a `memory_stream` scored by:

```
score(m, q) = [ R(m) + I(m) + V(m, q) ] ÷ 3
```

- **R(m)** Recency — `0.995 ^ (t − t_m)` exponential decay
- **I(m)** Importance — LLM-scored 1–10 at write time, normalized to [0,1]
- **V(m, q)** Relevance — keyword overlap between memory and current shock

Formula adopted from **Park et al., 2023** ("Generative Agents: Interactive Simulacra of Human Behavior"). Implemented in `engine/memory.py`.

### Key Files

```
main.py                  FastAPI server, all API routes + WebSocket
engine/agent.py          Agent + Memory dataclasses
engine/simulation.py     Tick loop, conversations, reflections, orchestrator
engine/memory.py         Retrieval scoring (recency + importance + relevance)
engine/shock.py          Inject shock → fan out to all 40 agents
engine/reflection.py     Importance scoring + reflection synthesis
engine/orchestrator.py   Community synthesis + policy recommendations
agents.json              40 agent profiles (source of truth — do not edit directly)
frontend/src/App.tsx     WebSocket connection, state, query handler
```

---

## Evaluation & Evidence

**Grounded in prior work** — Memory retrieval formula adopted directly from Park et al., 2023; not invented, validated by established simulation literature.

**Historical back-testing** — Because this is a simulation, the most tractable near-term validation is back-testing: inject a past legislative change with known community outcomes and check whether simulated stance distributions directionally match documented public response.

**Survey alignment** — Agent output can be compared against Pew Research or local government survey data. Demographic divergence in simulated stances should mirror real divergence patterns across age, occupation, and proximity.

**Surveys become obsolete** — At scale, directly querying synthetic agents replaces traditional population polling entirely. Individual agents can be queried by the public in ways static surveys never could.

### TA Feedback Incorporated

**TA Ramya** raised the question of what the backend model is (LLM-based agents with memory + prompting vs. fine-tuned vs. hybrid economic models), confirmed the architecture is correct, and recommended exponential decay for memory retrieval weighting — this was implemented as `0.995 ^ (t − t_m)` in `engine/memory.py`. She also suggested value-extraction onboarding to generate custom per-agent prompts, which informed the biographical grounding in `agents.json`.

**TA Jaanak** flagged that the UI was overwhelming without context and that AI usage was not evident enough. This feedback directly drove the addition of the onboarding overlay, the narrative feed, and the model usage annotations now visible throughout the interface.

---

## Known Limitations

- **Simultaneous shock broadcast** — All 40 agents receive the shock at tick 0. Real information cascades through a social graph with latency and distortion; tiered activation would be more realistic.
- **Orchestrator runs post-hoc** — It currently summarizes rather than decomposes the shock and assigns personalized impact briefs before agents respond.
- **Static relationships** — Social edge weights don't evolve based on conversation frequency or sentiment alignment.
- **Unbounded memory** — Memory stream grows without consolidation; needs pruning at scale.

---

## AI Usage Disclosure

This project uses the Anthropic API (Claude) extensively as the core simulation engine — not as a coding assistant. Every agent decision, memory importance score, reflection, conversation, and orchestrator synthesis is a live LLM call. See the models table above for the full breakdown of which model is called where and why.

Claude Code (Anthropic's CLI) was used during development for code iteration and debugging.

---

## Sources & Credits

- **Park et al., 2023** — "Generative Agents: Interactive Simulacra of Human Behavior" — memory retrieval formula, agent architecture inspiration
- **Relevant papers recommended by TA Ramya:**
  - https://doi.org/10.48550/arXiv.2410.22203
  - https://arxiv.org/abs/2403.03407
- Agent profiles generated for the F/N Ward neighborhood (Mumbai, Maharashtra) using `generate_agents.py`
- Frontend built with React + TypeScript + MapLibre GL
- Backend built with FastAPI + WebSockets + Anthropic SDK
