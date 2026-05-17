from __future__ import annotations
import asyncio
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import anthropic
from engine.agent import Agent
from engine.simulation import SimulationEngine
from engine.decision import _build_static_block, _build_dynamic_block
from engine.memory import retrieve_memories

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load agents on startup
_agents_data = json.loads(Path("agents.json").read_text())
agents = [Agent.from_dict(d) for d in _agents_data["agents"]]

engine = SimulationEngine(agents, tick_interval=3.0, max_ticks=50)

_sim_task: asyncio.Task | None = None


def _ensure_started() -> None:
    global _sim_task
    if _sim_task is None or _sim_task.done():
        _sim_task = asyncio.create_task(engine.run())
        engine.running = True


# ── Models ────────────────────────────────────────────────────────────────

class ShockBody(BaseModel):
    text: str

class ControlBody(BaseModel):
    action: str  # start | pause | resume | stop


# ── Routes ────────────────────────────────────────────────────────────────

@app.get("/")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    return {
        "running": engine.running,
        "paused": engine.paused,
        "tick": engine.current_tick,
        "history_len": len(engine.history),
        "clients": len(engine.clients),
        "api_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "sim_task_done": _sim_task.done() if _sim_task else None,
    }


@app.post("/shock")
async def shock(body: ShockBody):
    engine.inject(body.text)
    _ensure_started()
    return {"ok": True}


@app.get("/agents")
async def get_agents():
    return engine.current_snapshot()


@app.post("/control")
async def control(body: ControlBody):
    global _sim_task
    if body.action == "start":
        engine.paused = False
        _ensure_started()
    elif body.action == "pause":
        engine.paused = True
    elif body.action == "resume":
        engine.paused = False
        _ensure_started()
    elif body.action == "stop":
        engine.running = False
        if _sim_task and not _sim_task.done():
            _sim_task.cancel()
        _sim_task = None
    return {"ok": True}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await engine.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        engine.disconnect(ws)


@app.websocket("/ws/think/{agent_id}")
async def stream_agent_thinking(ws: WebSocket, agent_id: str):
    """Stream live token-by-token thinking for a single agent."""
    await ws.accept()

    agent_map = {a.id: a for a in engine.agents}
    agent = agent_map.get(agent_id)
    if not agent:
        await ws.send_text(json.dumps({"error": "agent not found"}))
        await ws.close()
        return

    shock_text = getattr(engine, "_shock_text", "Observe your neighborhood and reflect on your day.")
    keywords = getattr(engine, "_shock_keywords", [])
    tick = engine.current_tick

    static_block = _build_static_block(agent)
    dynamic_block = _build_dynamic_block(agent, tick, shock_text, [], keywords)

    client = anthropic.Anthropic()
    loop = asyncio.get_event_loop()

    def stream_sync():
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            system=[{"type": "text", "text": static_block, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": dynamic_block}],
        ) as stream:
            for text in stream.text_stream:
                asyncio.run_coroutine_threadsafe(
                    ws.send_text(json.dumps({"token": text})),
                    loop,
                ).result()
        asyncio.run_coroutine_threadsafe(
            ws.send_text(json.dumps({"done": True})),
            loop,
        ).result()

    try:
        await loop.run_in_executor(None, stream_sync)
    except Exception as e:
        log.error("stream_agent_thinking error: %s", e)
    finally:
        try:
            await ws.close()
        except Exception:
            pass
