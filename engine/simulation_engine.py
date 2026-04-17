"""
simulation_engine.py

Async tick loop. Steps the domain each tick and broadcasts
world state to all connected WebSocket clients.
Interventions arrive via a queue from the API layer.
"""

from __future__ import annotations
import asyncio
import json
import logging
from fastapi import WebSocket

log = logging.getLogger(__name__)


class SimulationEngine:

    def __init__(self, domain, tick_interval: float = 1.0):
        self.domain        = domain
        self.tick_interval = tick_interval
        self.clients:      set[WebSocket]  = set()
        self.interventions: asyncio.Queue  = asyncio.Queue()
        self.running = False
        self.paused  = False

    # ------------------------------------------------------------------
    # Client management
    # ------------------------------------------------------------------

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)
        # Send current state immediately so map populates on load
        await ws.send_text(json.dumps(self._snapshot()))

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def run(self) -> None:
        self.running = True
        while self.running:
            if not self.paused and self.domain is not None:
                while not self.interventions.empty():
                    self._apply(self.interventions.get_nowait())
                self.domain.step()
                await self._broadcast()
            await asyncio.sleep(self.tick_interval)

    # ------------------------------------------------------------------
    # Interventions
    # ------------------------------------------------------------------

    def queue_intervention(self, intervention_id: str) -> dict:
        spec = next(
            (i for i in self.domain.interventions_spec if i["id"] == intervention_id),
            None,
        )
        if not spec:
            raise KeyError(f"No intervention '{intervention_id}'")
        self.interventions.put_nowait(spec)
        return spec

    def _apply(self, spec: dict) -> None:
        for mutation in [spec] + spec.get("also_mutate", []):
            target_id = mutation.get("target_id", "")
            changes   = mutation.get("changes", {})
            mut_type  = mutation.get("type", spec.get("type", "mutate_edge"))
            try:
                obj = (self.domain.get_edge(target_id)
                       if mut_type == "mutate_edge"
                       else self.domain.get_node(target_id))
                for path, val in changes.items():
                    parts = path.split(".")
                    if len(parts) == 2:
                        obj[parts[0]][parts[1]] = val
                    else:
                        obj[path] = val
            except KeyError as e:
                log.warning("Intervention target not found: %s", e)

    # ------------------------------------------------------------------
    # Broadcast
    # ------------------------------------------------------------------

    async def _broadcast(self) -> None:
        if not self.clients:
            return
        msg  = json.dumps(self._snapshot())
        dead = set()
        for ws in self.clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        self.clients -= dead

    def _snapshot(self) -> dict:
        return self.domain.to_snapshot()
