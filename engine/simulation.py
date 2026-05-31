from __future__ import annotations
import asyncio
import json
import logging
from fastapi import WebSocket

from engine.agent import Agent

log = logging.getLogger(__name__)

# Updated by /generate-scenario so /ws/think/:id can access nearby POIs
current_pois: list[dict] = []


class SimulationEngine:

    def __init__(self, agents: list[Agent]):
        self.agents = agents
        self.clients: set[WebSocket] = set()
        self.current_tick: int = 0
        self.neighborhood_name: str = "City Center"
        self._neighborhood_description: str = ""

    def _snapshot(self) -> dict:
        return {
            "tick": self.current_tick,
            "agents": [a.to_dict() for a in self.agents],
        }

    def current_snapshot(self) -> dict:
        return self._snapshot()

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
        dead: set[WebSocket] = set()
        for ws in self.clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        self.clients -= dead
