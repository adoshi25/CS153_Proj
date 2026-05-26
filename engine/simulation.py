from __future__ import annotations
import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from fastapi import WebSocket

import random
from engine.agent import Agent, Memory
from engine.decision import agent_tick
from engine.shock import CascadeState, seed_tier1, seed_tier2, seed_tier3, _extract_keywords
from engine.memory import should_reflect
from engine.reflection import reflect
from engine.pois import POIS
from engine.orchestrator import orchestrate, plan_cascade
from engine.conversation import converse

log = logging.getLogger(__name__)


class SimulationEngine:

    def __init__(
        self,
        agents: list[Agent],
        tick_interval: float = 2.0,
        max_ticks: int = 100,
    ):
        self.agents = agents
        self.tick_interval = tick_interval
        self.max_ticks = max_ticks
        self.current_tick = 0
        self.running = False
        self.paused = False
        self.clients: set[WebSocket] = set()
        self.history: list[dict] = []
        self._executor = ThreadPoolExecutor(max_workers=10)
        self._last_reflection: dict[str, int] = {a.id: 0 for a in agents}

        self._locations: dict[str, dict] = {
            a.id: dict(a.home) for a in agents
        }
        self._public_actions: list[dict] = []
        self.neighborhood_name: str = "City Center"

        # Shock and cascade state
        self._shock_text: str = ""
        self._shock_keywords: list[str] = []
        self._cascade: CascadeState | None = None
        self._cascade_pending: bool = False
        # Coalition registry: frozenset[agent_id] → tick first observed
        self._coalition_registry: dict = {}

    # ── Shock ─────────────────────────────────────────────────────────────

    def inject(self, shock_text: str) -> None:
        self._shock_text = shock_text
        self._shock_keywords = _extract_keywords(shock_text)
        self._cascade = None
        self._cascade_pending = True
        # Reset cascade state on all agents so a re-injection starts clean
        for agent in self.agents:
            agent.knowledge_tick = None
            agent.cascade_tier = None
            agent.impact_brief = ""
        log.info("Shock registered — cascade initializes on next tick: %s", shock_text)

    # ── Main loop ─────────────────────────────────────────────────────────

    async def run(self) -> None:
        self.running = True
        while self.running and self.current_tick < self.max_ticks:
            if not self.paused:
                await self._tick()
                self.current_tick += 1
            await asyncio.sleep(self.tick_interval)
        self.running = False

    async def _tick(self) -> None:
        tick = self.current_tick

        # Initialize cascade on the first tick after shock injection (lazy — uses executor)
        if self._cascade_pending:
            await self._initialize_cascade(tick)
            self._cascade_pending = False

        # Propagate cascade: tier 2 at delta=1, tier 3 at delta=3
        if self._cascade:
            await self._propagate_cascade(tick)

        # Don't run LLM calls until a shock is injected — just broadcast positions
        if not self._shock_text.strip():
            await self._broadcast(self._snapshot(tick))
            return

        log.info("Tick %d — running %d agents", tick, len(self.agents))

        query_keywords = (
            self._cascade.keywords if self._cascade else self._shock_keywords
        )

        agent_map = {a.id: a for a in self.agents}
        neighbor_map = {
            a.id: [
                {"name": agent_map[r].name, "last_action": agent_map[r].last_action}
                for r in a.relationships
                if agent_map[r].last_action
            ]
            for a in self.agents
        }

        loop = asyncio.get_event_loop()
        prev_public = list(self._public_actions)

        # Each agent only knows what they've been told — uninformed agents act normally
        tasks = [
            loop.run_in_executor(
                self._executor,
                agent_tick,
                agent,
                tick,
                agent.impact_brief if agent.knowledge_tick is not None else "",
                neighbor_map[agent.id],
                query_keywords,
                prev_public,
            )
            for agent in self.agents
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for agent, result in zip(self.agents, results):
            if isinstance(result, Exception):
                log.error("agent_tick failed for %s: %s", agent.name, result)

        for agent in self.agents:
            move_to = getattr(agent, "move_to", "home")
            if move_to == "home":
                self._locations[agent.id] = dict(agent.home)
            elif move_to == "work":
                self._locations[agent.id] = {
                    "lat": agent.home["lat"] + 0.002,
                    "lon": agent.home["lon"] + 0.003,
                }
            elif move_to in POIS:
                self._locations[agent.id] = dict(POIS[move_to])
            else:
                self._locations[agent.id] = dict(agent.home)

        # Collect public actions for next tick
        self._public_actions = [
            {"name": a.name, "action": a.last_action}
            for a in self.agents
            if getattr(a, "is_public_action", False) and a.last_action
        ]

        # Run conversations between co-located agents at named POIs
        poi_groups: dict[str, list] = {}
        for a in self.agents:
            loc = getattr(a, "move_to", "home")
            if loc in POIS:
                poi_groups.setdefault(loc, []).append(a)

        conversation_summaries = []
        eligible_pois = [p for p, group in poi_groups.items() if len(group) >= 2]
        for poi_name in random.sample(eligible_pois, min(4, len(eligible_pois))):
            group = poi_groups[poi_name]
            agent_a, agent_b = random.sample(group, 2)
            # Pass the event to conversations only if at least one participant knows
            conv_event = (
                self._shock_text
                if (agent_a.knowledge_tick is not None or agent_b.knowledge_tick is not None)
                else ""
            )
            try:
                conv = await loop.run_in_executor(
                    self._executor, converse, agent_a, agent_b, poi_name, conv_event, tick
                )
                agent_a.memory_stream.append(Memory(
                    content=conv["agent_a_heard"], timestamp=tick, importance=6.0, keywords=[poi_name]
                ))
                agent_b.memory_stream.append(Memory(
                    content=conv["agent_b_heard"], timestamp=tick, importance=6.0, keywords=[poi_name]
                ))
                conversation_summaries.append({"location": poi_name, "summary": conv["summary"]})
            except Exception as exc:
                log.warning("conversation failed at %s: %s", poi_name, exc)

        for agent in self.agents:
            if should_reflect(agent.memory_stream, self._last_reflection[agent.id], tick):
                insight = await loop.run_in_executor(self._executor, reflect, agent, tick)
                if insight:
                    agent.memory_stream.append(insight)
                self._last_reflection[agent.id] = tick

        snapshot = self._snapshot(tick)
        snapshot["conversations"] = conversation_summaries
        snapshot["public_actions"] = [
            {"name": a.name, "action": a.last_action, "sentiment": round(a.sentiment, 3)}
            for a in self.agents if getattr(a, "is_public_action", False) and a.last_action
        ]

        if self._shock_text.strip():
            agent_states = snapshot["agents"]
            try:
                orch_result = await loop.run_in_executor(
                    self._executor, orchestrate, agent_states, tick,
                    self._coalition_registry, self.neighborhood_name
                )
                snapshot["orchestrator"] = orch_result
            except Exception as exc:
                log.warning("Orchestrator failed at tick %d: %s", tick, exc)
                snapshot["orchestrator"] = {
                    "summary": "", "top_concerns": [],
                    "consensus_sentiment": 0.0, "policy_recommendations": [],
                    "belief_fragmentation_score": 0.0, "belief_clusters": [],
                    "coalitions": [],
                }

        self.history.append(snapshot)
        await self._broadcast(snapshot)

    # ── Cascade lifecycle ─────────────────────────────────────────────────

    async def _initialize_cascade(self, tick: int) -> None:
        """
        Call orchestrator to score all 40 agents by occupational relevance,
        pick top 3-4 as Tier 1, generate their personalized briefs, a distorted
        rumor for Tier 2, and a generic news blurb for Tier 3.
        Falls back to broadcast injection if the LLM call fails.
        """
        shock_text = self._shock_text
        loop = asyncio.get_event_loop()
        log.info("Cascade: calling plan_cascade for shock: %s", shock_text[:60])

        try:
            result = await loop.run_in_executor(
                self._executor, plan_cascade, self.agents, shock_text, self.neighborhood_name
            )
        except Exception as exc:
            log.error("plan_cascade failed — falling back to broadcast: %s", exc)
            keywords = _extract_keywords(shock_text)
            for agent in self.agents:
                agent.knowledge_tick = tick
                agent.cascade_tier = 1
                agent.impact_brief = shock_text
                agent.memory_stream.append(Memory(
                    content=shock_text, timestamp=tick, importance=9.5, keywords=keywords
                ))
            return

        keywords = _extract_keywords(shock_text)
        tier1_ids = [entry["id"] for entry in result.get("tier1", [])]
        tier1_briefs = {entry["id"]: entry["brief"] for entry in result.get("tier1", [])}

        self._cascade = CascadeState(
            shock_text=shock_text,
            keywords=keywords,
            start_tick=tick,
            tier1_ids=tier1_ids,
            tier1_briefs=tier1_briefs,
            tier2_rumor=result.get("tier2_rumor", shock_text),
            tier3_news=result.get("tier3_news", shock_text),
        )

        seed_tier1(self.agents, self._cascade, tick)
        log.info(
            "Cascade initialized | tier1=%s | rumor='%s...'",
            tier1_ids,
            self._cascade.tier2_rumor[:60],
        )

    async def _propagate_cascade(self, tick: int) -> None:
        """
        Tier 2 (social graph neighbors of tier 1) learn at cascade_start + 1.
        Tier 3 (everyone else) learns at cascade_start + 3.
        """
        cascade = self._cascade
        if cascade is None:
            return
        delta = tick - cascade.start_tick

        if delta >= 1 and not cascade.tier2_seeded:
            seed_tier2(self.agents, cascade, tick)
            n = sum(1 for a in self.agents if a.cascade_tier == 2)
            log.info("Cascade tier2 seeded at tick %d (%d agents via social graph)", tick, n)

        if delta >= 3 and not cascade.tier3_seeded:
            seed_tier3(self.agents, cascade, tick)
            n = sum(1 for a in self.agents if a.cascade_tier == 3)
            log.info("Cascade tier3 seeded at tick %d (%d agents via news)", tick, n)

    # ── WebSocket ─────────────────────────────────────────────────────────

    def current_snapshot(self) -> dict:
        return self.history[-1] if self.history else self._snapshot(-1)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)
        await ws.send_text(json.dumps(self.current_snapshot()))

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def _broadcast(self, snapshot: dict) -> None:
        if not self.clients:
            return
        msg = json.dumps(snapshot)
        dead = set()
        for ws in self.clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        self.clients -= dead

    # ── Snapshot ──────────────────────────────────────────────────────────

    def _snapshot(self, tick: int) -> dict:
        cascade = self._cascade
        if cascade:
            tier_counts = {
                "1": sum(1 for a in self.agents if a.cascade_tier == 1),
                "2": sum(1 for a in self.agents if a.cascade_tier == 2),
                "3": sum(1 for a in self.agents if a.cascade_tier == 3),
                "uninformed": sum(1 for a in self.agents if a.cascade_tier is None),
            }
            cascade_info = {"active": True, "tier_counts": tier_counts}
        else:
            cascade_info = {
                "active": False,
                "tier_counts": {"1": 0, "2": 0, "3": 0, "uninformed": len(self.agents)},
            }

        return {
            "tick": tick,
            "conversations": [],
            "public_actions": [],
            "orchestrator": {
                "summary": "", "top_concerns": [],
                "consensus_sentiment": 0.0, "policy_recommendations": [],
                "belief_fragmentation_score": 0.0, "belief_clusters": [],
                "coalitions": [],
            },
            "cascade": cascade_info,
            "agents": [
                {
                    "id": a.id,
                    "name": a.name,
                    "lat": self._locations[a.id]["lat"],
                    "lon": self._locations[a.id]["lon"],
                    "sentiment": round(a.sentiment, 3),
                    "thought": a.current_thought,
                    "action": a.last_action,
                    "move_to": getattr(a, "move_to", "home"),
                    "relationships": list(a.relationships),
                    "cascade_tier": a.cascade_tier,
                    "knowledge_tick": a.knowledge_tick,
                    "belief_about_event": a.belief_about_event,
                    "belief_certainty": round(a.belief_certainty, 3),
                    "belief_source": a.belief_source,
                    "keywords": list(a.current_keywords),
                }
                for a in self.agents
            ],
        }
