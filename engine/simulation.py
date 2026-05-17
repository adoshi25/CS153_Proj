from __future__ import annotations
import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from fastapi import WebSocket

import random
from engine.agent import Agent, Memory
from engine.decision import agent_tick
from engine.shock import inject_shock
from engine.memory import should_reflect
from engine.reflection import reflect
from engine.pois import POIS
from engine.orchestrator import orchestrate
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

    # ── Shock ─────────────────────────────────────────────────────────────

    def inject(self, shock_text: str) -> None:
        inject_shock(self.agents, shock_text, tick=self.current_tick)
        self._shock_text = shock_text
        self._shock_keywords = shock_text.lower().split()[:8]
        log.info("Shock injected: %s", shock_text)

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
        log.info("Tick %d — running %d agents", tick, len(self.agents))

        world_event = getattr(self, "_shock_text", "")
        query_keywords = getattr(self, "_shock_keywords", [])

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
        tasks = [
            loop.run_in_executor(
                self._executor,
                agent_tick,
                agent,
                tick,
                world_event,
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
            try:
                conv = await loop.run_in_executor(
                    self._executor, converse, agent_a, agent_b, poi_name, world_event, tick
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

        agent_states = snapshot["agents"]
        try:
            orch_result = await loop.run_in_executor(
                self._executor, orchestrate, agent_states, tick
            )
            snapshot["orchestrator"] = orch_result
        except Exception as exc:
            log.warning("Orchestrator failed at tick %d: %s", tick, exc)
            snapshot["orchestrator"] = {"summary": "", "top_concerns": [], "consensus_sentiment": 0.0, "policy_recommendations": []}

        self.history.append(snapshot)
        await self._broadcast(snapshot)

    # ── WebSocket ─────────────────────────────────────────────────────────

    def current_snapshot(self) -> dict:
        """Return current state regardless of whether any ticks have run."""
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
        snap = {
            "tick": tick,
            "conversations": [],
            "public_actions": [],
            "orchestrator": {"summary": "", "top_concerns": [], "consensus_sentiment": 0.0, "policy_recommendations": []},
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
                }
                for a in self.agents
            ],
        }
        return snap
