# Generalist Visual Simulation Platform — Gameplan

## The Vision

A platform where you can see any real-world system — a city, a supply chain, a financial market, an ecosystem — simulated in real time, with intelligent agents that behave realistically, and where you can intervene and immediately see the ripple effects across the world.

Not a dashboard. Not a chatbot. A visual world you can reach into.

---

## What Makes This Original

Every existing tool has one or two pieces. Nobody has the full stack:

| Capability | Existing Tools | This System |
|---|---|---|
| Visual real-time world | Game engines (domain-locked) | Generalist, any domain |
| Intelligent agents | Smallville (social only, 25 agents) | Hierarchical, any domain, scales |
| Cross-domain cascade | Nothing | Ships → oil → markets → policy |
| Intervene and see effects | Some dashboards | Core interaction model |
| Real-world data grounded | Digital twins (proprietary) | Open, generalist |

The core research contribution: **a generalist platform where a single world schema, agent architecture, and visual interface works across fundamentally different simulation domains — and where interventions propagate across domain boundaries.**

### What We Borrow
- Smallville's cognitive architecture: memory stream + reflection + planning (Park et al. 2023)
- Agent-based modeling concepts from Mesa, NetLogo
- Graph neural network literature for mid-tier agent policies

### What Is Novel
1. Universal world schema that instantiates across domains without rewriting
2. Hierarchical agent tiers: LLM (strategy) → GNN (operations) → rules/physics (mass)
3. Cross-domain cascade: effects propagate across domain boundaries visually
4. Visual layer as primary intervention interface, not cosmetic rendering
5. Real-data grounding: AIS, OSM, market feeds anchor the simulation in reality
6. Transferable agent policy: one GNN trained across domains, zero-shot to new ones *(research goal)*

---

## Core Architecture

### The Unifying Abstraction

Every domain maps to the same structure:

```
World = dynamic spatial graph G = (V, E, t)

node  = { id, type, position (lat/lon), properties{}, state{} }
edge  = { from, to, type, capacity, flow, cost, state{} }
time  = discrete ticks, configurable resolution (seconds → years)
```

| Domain | Nodes | Edges | Flow |
|---|---|---|---|
| Supply chain | Ships, ports, refineries | Shipping lanes | Oil / cargo |
| City traffic | Intersections, buildings | Roads | Vehicles |
| Financial markets | Companies, banks | Supply/trade contracts | Money, goods |
| Emissions | Geographic regions, forests | Atmospheric adjacency | Carbon |

Same schema. Different instantiation. This is the foundation everything builds on.

### The Four Coupled Systems

```
┌─────────────────────────────────────────────────────────────┐
│                     INTERVENTION LAYER                       │
│         User draws, blocks, adds, removes in the world       │
└────────────────────────┬────────────────────────────────────┘
                         │ mutates world state
┌────────────────────────▼────────────────────────────────────┐
│                       WORLD STATE                            │
│              G = (nodes, edges, attributes, t)               │
└───────────┬─────────────────────────────┬───────────────────┘
            │                             │
┌───────────▼───────────┐     ┌───────────▼───────────────────┐
│     AGENT LAYER        │     │       DYNAMICS MODEL          │
│                        │     │                               │
│  LLM  → strategy       │     │  Physics, economics, weather  │
│  GNN  → operations     │     │  World evolves independent    │
│  Rules → mass behavior │     │  of agent decisions           │
└───────────┬────────────┘     └───────────┬───────────────────┘
            └─────────────────┬────────────┘
                              │ G_t+1
                   ┌──────────▼──────────┐
                   │    VISUAL RENDERER   │
                   │  Deck.gl on real map │
                   │  Real-time, zoomable │
                   │  Click = inspect     │
                   └─────────────────────┘
```

### Agent Hierarchy

```
TOP TIER — LLM agents (5–50 per simulation)
  Who:    Strategic decision-makers. OPEC, a shipping CEO, a city planner, a central bank.
  How:    Smallville cognitive architecture — memory stream, reflection, planning.
  When:   Called infrequently. Long horizon decisions. React to major world events.
  Cost:   High (LLM call per decision). Acceptable at this count.

MID TIER — GNN agents (100–10,000 per simulation)
  Who:    Operational agents. Individual ships, fund managers, traffic controllers.
  How:    Graph neural network observes local subgraph → outputs action.
  When:   Called every tick. Short horizon decisions. React to local conditions.
  Cost:   Low (inference only). The generalist policy lives here.
  Goal:   Train once across domains, transfer to new domains without retraining.

BOTTOM TIER — Rule/physics agents (10,000–1,000,000)
  Who:    Mass behavior. Individual cars, carbon particles, price ticks.
  How:    Deterministic rules or physics equations. No learning.
  When:   Every tick. Emergent behavior from simple rules.
  Cost:   Near-zero.
```

---

## The Research Thesis

> Can a single GNN-based agent policy, trained on diverse simulation domains, zero-shot generalize to a new domain given only a schema description?

If yes: you have a foundation model for agent behavior in simulated worlds. That's algorithmically novel and publishable.

If no: you still have a generalist platform with shared architecture across domains. That's a systems contribution worth publishing.

Either way, you have something.

---

## Build Phases

### Phase 0 — World Schema Design (Week 1–2)
**Goal:** Define the universal graph schema that works for 3 domains on paper before writing any code.

Deliverables:
- [ ] Schema spec: node fields, edge fields, time model, agent observation format, intervention API
- [ ] Validate schema fits: supply chain, city traffic, emissions
- [ ] Document what is domain-specific vs. universal
- [ ] Write a fake JSON world state for each domain to stress-test the schema

No code written until the schema works on paper for all three domains. If it requires domain-specific fields at the core level, redesign.

---

### Phase 1 — First Scene: Strait of Hormuz (Week 2–5)
**Goal:** One working end-to-end simulation. Ships, oil, a blockage, visible rerouting.

Why this scene:
- Real AIS data exists (ships broadcast GPS positions publicly — free APIs)
- Intervention is dramatic and legible: block the strait, 20% of world oil reroutes
- Spatially beautiful on a world map
- Connects upward to markets (sets up Phase 3)
- Proves multiple agent types and tiers in one scene

**Scope for v1 — hard limits:**
```
In:   Ships move on real geography
In:   One intervention: naval blockage of the Strait of Hormuz
In:   Ships reroute (mid-tier GNN/rule agents)
In:   One strategic agent: a shipping company CEO (LLM, Smallville architecture)
In:   Visual indicator: oil delivery delay, rerouting paths visible on map
In:   Real AIS data as ground truth for ship positions

Out:  Actual oil price modeling
Out:  Stock market simulation
Out:  Corporate strategy for multiple companies
Out:  Weather, port congestion, cargo specifics
```

Stack:
- World state: Python (NetworkX graph)
- Simulation engine: Python (Mesa for agent scheduling)
- Visual layer: Deck.gl (WebGL map, browser-based, real-time)
- LLM agents: GPT-4o or Claude via API, Smallville memory architecture
- Data: AIS data (aisstream.io or similar free API)

Deliverables:
- [ ] World state populated from real AIS + port data
- [ ] Ships routing via shortest path on graph
- [ ] Blockage intervention via UI (click strait → blocked)
- [ ] Ships reroute visibly (Cape of Good Hope path)
- [ ] CEO agent reacts with a decision (logged, visible in UI)
- [ ] Delivery delay shown as a live indicator

---

### Phase 2 — Second Domain (Week 5–7)
**Goal:** Prove generality. Apply the same schema and infrastructure to a different domain with minimal rewriting.

Candidate: City traffic (urban highway intervention)
- OSM (OpenStreetMap) provides free real road network data
- Intervention: add or remove a highway segment
- Cars reroute visibly
- Same schema: nodes = intersections, edges = roads, agents = cars

Success criterion: Phase 1 infrastructure works for Phase 2 with zero schema changes and less than 20% new code.

Deliverables:
- [ ] Same schema instantiated for city traffic
- [ ] Cars routing on real road network (OSM data)
- [ ] Highway intervention via UI
- [ ] Traffic redistribution visible
- [ ] Shared visual renderer works without modification

---

### Phase 3 — Cross-Domain Cascade (Week 7–10)
**Goal:** Connect the two domains. Show that an intervention in one domain visibly affects another.

Example: Strait blockage → oil delivery delay → energy price indicator rises → city traffic increases as supply chain reroutes through different ports → visible congestion in city sim.

This is the core original contribution made real. No existing system shows this.

Deliverables:
- [ ] Domain bridge: events in world A trigger state changes in world B
- [ ] Visual: user can see the cascade propagate across domains in real time
- [ ] At least one end-to-end cascade path working

---

### Phase 4 — Generalist Agent Policy (Week 10+)
**Goal:** Train a single GNN policy on Phase 1 + Phase 2 domains. Test zero-shot transfer to a third domain (emissions or financial markets).

This is the research contribution. It requires:
- Sufficient synthetic training data from Phase 1 and Phase 2 simulations
- GNN architecture that operates on the universal schema
- Evaluation framework: does the transferred policy behave reasonably in the new domain?

Deliverables:
- [ ] Training data pipeline from simulation rollouts
- [ ] GNN policy architecture
- [ ] Training across two domains
- [ ] Zero-shot evaluation on third domain
- [ ] Comparison baseline: domain-specific policy vs. generalist policy

---

## What Success Looks Like

**Minimum (platform thesis):**
Two domains working on the same schema, same visual layer, same agent architecture. One cross-domain cascade visible. Proves the generalist platform claim.

**Target (research thesis):**
A GNN agent policy trained on two domains that transfers to a third. Paper-worthy.

**Stretch (product thesis):**
Real-time data feeds, three or more domains, a public demo. Something a government, shipping company, or hedge fund would actually use.

---

## Key Risks

| Risk | Mitigation |
|---|---|
| Schema gets contaminated by first domain | Design schema for 3 domains on paper before any code |
| First scene scope creep | Hard limits documented above — enforce them |
| LLM agents too slow at scale | Strictly cap LLM agents at top tier, never mid or bottom |
| Phase 4 GNN doesn't generalize | Still have a systems contribution — platform thesis holds |
| Visual layer complexity overwhelms | Deck.gl handles the hard parts — keep renderer thin |

---

## Open Questions (Resolve Before Building)

1. What are the exact fields in the universal node and edge schema?
2. What does an agent "observation" look like — what subset of the graph does it see?
3. What does an "intervention" look like structurally — is it a graph mutation, a parameter change, or both?
4. How does time work — what is a tick, and is it the same across domains?
5. How do cross-domain bridges work — shared nodes, event queues, or something else?

These need answers before Phase 1 code is written.
