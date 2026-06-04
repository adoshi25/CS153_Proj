from __future__ import annotations
import asyncio
import json
import logging
import math
import os
import re
from pathlib import Path
from json_repair import repair_json

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import anthropic
from engine.agent import Agent
from engine.simulation import SimulationEngine
from engine.shock import reset_all, fan_out
from engine.activation import activate_agents
from engine.movement import advance_day, save_experiences, reset_movement
from engine.generate import generate_agents
import engine.simulation as _sim_module

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

engine = SimulationEngine(agents)
engine.neighborhood_name = _agents_data.get("neighborhood", "City Center")
engine._neighborhood_description = _agents_data.get("neighborhood_description", "")
_sim_module.current_pois = _agents_data.get("pois", [])

# Cached shock options — invalidated when /generate-scenario runs
_shock_options_cache: list[dict] | None = None

# Simulation state
_sim_state = {
    "running": False,
    "day": 0,
    "max_days": 10,
    "current_shock": "",
}


# ── Models ────────────────────────────────────────────────────────────────

class ShockBody(BaseModel):
    text: str
    max_days: int = 5

class ScenarioBody(BaseModel):
    description: str
    center_lat: float | None = None
    center_lon: float | None = None
    polygon: list[list[float]] | None = None


# ── Helpers ───────────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def _nearest_pois(agent: Agent, pois: list[dict], n: int = 5) -> list[dict]:
    lat, lon = agent.home["lat"], agent.home["lon"]
    ranked = sorted(pois, key=lambda p: _haversine_km(lat, lon, p["lat"], p["lon"]))
    return ranked[:n]


def _get_shock_pois(shock_text: str, pois: list[dict]) -> list[dict]:
    """Find POIs that are named or strongly implied by the shock text."""
    text = shock_text.lower()
    matched = [
        p for p in pois
        if any(
            word in text
            for word in p["name"].lower().split()
            if len(word) > 3
        )
    ]
    return matched or pois[:6]


async def _run_movement_loop() -> None:
    """Background task: advance agent positions one day at a time until done."""
    global _sim_state
    MAX_DAYS = _sim_state["max_days"]

    while _sim_state["running"]:
        await asyncio.sleep(20.0)
        if not _sim_state["running"]:
            break

        _sim_state["day"] += 1
        day = _sim_state["day"]
        shock_text = _sim_state["current_shock"]

        loop = asyncio.get_event_loop()
        conversations = await loop.run_in_executor(
            None, advance_day, engine.agents, day, shock_text
        )

        snap = engine._snapshot()
        snap["sim_day"] = day
        snap["sim_conversations"] = conversations
        await engine._broadcast(snap)

        if day >= MAX_DAYS:
            _sim_state["running"] = False
            # Persist experiences for future shocks
            loop2 = asyncio.get_event_loop()
            await loop2.run_in_executor(
                None, save_experiences, engine.agents, shock_text
            )
            snap2 = engine._snapshot()
            snap2["sim_day"] = day
            snap2["sim_complete"] = True
            await engine._broadcast(snap2)
            break


# ── Routes ────────────────────────────────────────────────────────────────

@app.get("/")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    return {
        "tick": engine.current_tick,
        "clients": len(engine.clients),
        "api_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "sim_day": _sim_state["day"],
        "sim_running": _sim_state["running"],
    }


@app.post("/shock")
async def shock(body: ShockBody):
    global _shock_options_cache, _sim_state

    # Save experiences from previous shock BEFORE overwriting state
    prev_shock = _sim_state.get("current_shock", "")
    if prev_shock and any(a.activated for a in engine.agents):
        save_experiences(engine.agents, prev_shock)

    # Stop any running simulation and update state
    _sim_state["running"] = False
    _sim_state["day"] = 0
    _sim_state["max_days"] = max(1, min(10, body.max_days))
    _sim_state["current_shock"] = body.text

    reset_all(engine.agents)
    reset_movement(engine.agents)
    engine.current_tick += 1

    snap = engine._snapshot()
    snap["sim_day"] = 0
    await engine._broadcast(snap)

    async def _background():
        loop = asyncio.get_event_loop()
        pois = _sim_module.current_pois
        shock_pois = _get_shock_pois(body.text, pois)

        # Phase 1: All 40 agents classify their stance
        await loop.run_in_executor(None, fan_out, engine.agents, body.text)
        snap1 = engine._snapshot()
        snap1["sim_day"] = 0
        await engine._broadcast(snap1)

        # Phase 2: Selective activation + movement planning for most-affected agents
        await loop.run_in_executor(
            None, activate_agents, engine.agents, body.text, pois, shock_pois,
            14, 8, _sim_state["max_days"],
        )
        snap2 = engine._snapshot()
        snap2["sim_day"] = 0
        await engine._broadcast(snap2)

        # Phase 3: Start movement simulation
        _sim_state["running"] = True
        asyncio.create_task(_run_movement_loop())

    asyncio.create_task(_background())
    return {"ok": True}



@app.get("/shock-options")
async def shock_options():
    global _shock_options_cache
    if _shock_options_cache is not None:
        return _shock_options_cache

    pois = _sim_module.current_pois
    poi_names = [p["name"] for p in pois[:20]]
    occupations = list({a.occupation for a in engine.agents})[:15]

    prompt = (
        f"Neighborhood: {engine.neighborhood_name}\n"
        f"Key locations (exact names): {', '.join(poi_names)}\n"
        f"Occupations: {', '.join(occupations[:12])}\n\n"
        "Generate 12 shock scenarios for this specific neighborhood.\n"
        "Rules for each:\n"
        "- title: 4-6 words, must name THIS neighborhood, street, or venue — no generic titles\n"
        "- description: exactly 1 sentence, max 15 words, must name a specific local place or demographic group\n"
        "- poi_keywords: list of 1-3 EXACT names from 'Key locations' most affected (empty list if none match)\n"
        "- scenarios must be realistic policy decisions (zoning, taxation, infrastructure, social services, housing, transit) — no abstract or unlikely events\n\n"
        'Return ONLY valid JSON: [{"id": "1", "title": "...", "description": "...", "poi_keywords": ["name"]}, ...]'
    )

    client = anthropic.Anthropic()
    loop = asyncio.get_event_loop()

    def _call() -> str:
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip()

    raw = await loop.run_in_executor(None, _call)
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.rstrip())

    options: list[dict] = json.loads(repair_json(raw))
    _shock_options_cache = options
    return options


@app.post("/generate-scenario")
async def generate_scenario(body: ScenarioBody):
    global engine, agents, _shock_options_cache, _sim_state

    loop = asyncio.get_event_loop()

    try:
        data = await loop.run_in_executor(
            None, generate_agents,
            body.description, body.center_lat, body.center_lon, body.polygon,
        )
    except Exception as exc:
        log.error("generate_scenario failed: %s", exc)
        return {"ok": False, "error": str(exc)}

    Path("agents.json").write_text(json.dumps(data, indent=2))

    old_clients = set(engine.clients)
    agents = [Agent.from_dict(d) for d in data["agents"]]
    engine = SimulationEngine(agents)
    engine.clients = old_clients
    engine.neighborhood_name = data.get("neighborhood", "City Center")
    engine._neighborhood_description = data.get("neighborhood_description", "")

    _sim_module.current_pois = data.get("pois", [])
    _shock_options_cache = None
    _sim_state = {"running": False, "day": 0, "max_days": 10, "current_shock": ""}

    await engine._broadcast(engine.current_snapshot())

    return {
        "ok": True,
        "neighborhood": engine.neighborhood_name,
        "agent_count": len(agents),
        "city_layout": data.get("city_layout"),
        "map_center": data.get("map_center"),
        "real_world_location": data.get("real_world_location", ""),
        "pois": data.get("pois", []),
        "neighborhood_description": data.get("neighborhood_description", ""),
        "agents": [a.to_dict() for a in agents],
    }


@app.get("/agents")
async def get_agents():
    return engine.current_snapshot()


@app.post("/stop-sim")
async def stop_sim():
    _sim_state["running"] = False
    return {"ok": True}


@app.get("/sim-status")
async def sim_status():
    return {
        "day": _sim_state["day"],
        "running": _sim_state["running"],
        "max_days": _sim_state["max_days"],
        "current_shock": _sim_state["current_shock"],
        "activated_count": sum(1 for a in engine.agents if a.activated),
        "moving_count": sum(1 for a in engine.agents if a.activated and a.destination_lat and not a.journey_complete),
    }


@app.post("/control")
async def control(body: dict):
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
    """Stream a first-person 'day in my life' narrative for a single agent."""
    await ws.accept()

    agent_map = {a.id: a for a in engine.agents}
    agent = agent_map.get(agent_id)
    if not agent:
        await ws.send_text(json.dumps({"error": "agent not found"}))
        await ws.close()
        return

    pois = _sim_module.current_pois
    nearest = _nearest_pois(agent, pois, n=5) if pois else []
    poi_descriptions = ", ".join(
        f"{p['name']} ({p['type']})" for p in nearest
    ) or "the local area"

    neighborhood_desc = engine._neighborhood_description or engine.neighborhood_name

    experience_block = ""
    if agent.experience_log:
        recent = agent.experience_log[-2:]
        experience_block = "\n\nPast experiences that shaped you:\n" + "\n".join(f"- {e}" for e in recent)

    prompt = (
        f"You are {agent.name}, {agent.age} years old, {agent.occupation}.\n"
        f"Bio: {agent.bio}\n\n"
        f"Neighborhood context: {neighborhood_desc}\n\n"
        f"The places nearest to your home are: {poi_descriptions}."
        f"{experience_block}\n\n"
        "Write a 3-4 sentence first-person, present-tense narrative of a typical day in your life. "
        "Name the actual streets, parks, shops, and transit stops nearest to where you live. "
        "Be specific and grounded — this is your identity narrative, not a reaction to any news event."
    )

    client = anthropic.Anthropic()
    loop = asyncio.get_event_loop()

    def stream_sync() -> None:
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
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
    except Exception as exc:
        log.error("stream_agent_thinking error: %s", exc)
    finally:
        try:
            await ws.close()
        except Exception:
            pass
