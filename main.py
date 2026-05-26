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
from engine.query import query_neighborhood, _occupation_group
from engine.generate import generate_agents
from engine.counterfactual import run_counterfactual

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


@app.on_event("startup")
async def _startup():
    _ensure_started()


# ── Models ────────────────────────────────────────────────────────────────

class ShockBody(BaseModel):
    text: str

class ControlBody(BaseModel):
    action: str  # start | pause | resume | stop

class QueryBody(BaseModel):
    question: str

class ScenarioBody(BaseModel):
    description: str

class CounterfactualBody(BaseModel):
    policy: str
    n_ticks: int = 5


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


@app.post("/query")
async def query(body: QueryBody):
    """Fan out a policy question to all 40 agents and return grouped results."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, query_neighborhood, engine.agents, body.question)
    return result


@app.post("/shock")
async def shock(body: ShockBody):
    engine.inject(body.text)
    _ensure_started()
    return {"ok": True}


@app.post("/generate-scenario")
async def generate_scenario(body: ScenarioBody):
    """
    Generate 40 new agents from a plain-English description and restart the simulation.
    Persists the new cast to agents.json. Transfers live WebSocket clients to the new engine.
    """
    global engine, _sim_task, agents

    loop = asyncio.get_event_loop()

    try:
        data = await loop.run_in_executor(None, generate_agents, body.description)
    except Exception as exc:
        log.error("generate_scenario failed: %s", exc)
        return {"ok": False, "error": str(exc)}

    # Persist to agents.json so the new community survives a server restart
    Path("agents.json").write_text(json.dumps(data, indent=2))

    # Stop the current simulation gracefully
    engine.running = False
    if _sim_task and not _sim_task.done():
        _sim_task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(_sim_task), timeout=2.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

    # Build new Agent objects and a fresh engine
    agents = [Agent.from_dict(d) for d in data["agents"]]
    old_clients = set(engine.clients)
    engine = SimulationEngine(agents, tick_interval=3.0, max_ticks=50)
    engine.neighborhood_name = data.get("neighborhood", "City Center")
    engine.clients = old_clients  # keep existing browser connections live

    # Push the blank initial snapshot so connected clients clear their state
    await engine._broadcast(engine.current_snapshot())

    # Start the new run loop
    _sim_task = asyncio.create_task(engine.run())
    engine.running = True

    return {
        "ok": True,
        "neighborhood": engine.neighborhood_name,
        "agent_count": len(agents),
        "city_layout": data.get("city_layout"),
    }


@app.post("/counterfactual")
async def counterfactual(body: CounterfactualBody):
    """
    Fork the current agent state and run N simplified Haiku ticks on two branches:
    baseline (current shock only) vs. with_policy (shock + policy intervention).
    Returns chart-ready sentiment trajectories and per-group deltas.
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        run_counterfactual,
        engine.agents,
        getattr(engine, "_shock_text", ""),
        body.policy,
        body.n_ticks,
    )
    return result


@app.get("/history")
async def get_history():
    """Tick-by-tick average sentiment per occupation group, for the timeline chart."""
    occ_map = {a.id: _occupation_group(a.occupation) for a in agents}
    points = []
    for snap in engine.history:
        groups: dict[str, list[float]] = {}
        for a_snap in snap["agents"]:
            grp = occ_map.get(a_snap["id"], "Residents")
            groups.setdefault(grp, []).append(a_snap["sentiment"])
        points.append({
            "tick": snap["tick"],
            "groups": {g: round(sum(v) / len(v), 3) for g, v in groups.items()},
        })
    return points


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

    # Use the agent's personal impact brief (what they actually know), not the raw shock
    agent_event = agent.impact_brief if agent.knowledge_tick is not None else ""
    keywords = getattr(engine, "_shock_keywords", [])
    tick = engine.current_tick

    static_block = _build_static_block(agent)
    dynamic_block = _build_dynamic_block(agent, tick, agent_event, [], keywords)

    client = anthropic.Anthropic()
    loop = asyncio.get_event_loop()

    def stream_sync():
        with client.messages.stream(
            model="claude-sonnet-4-6",
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
