"""
main.py

Run with:
    python main.py scenes/war_in_iran_disrupts_oil_shipping.json
    python main.py scenes/a_new_highway_is_added_through.json
    python main.py scenes/deforestation_in_the_amazon_increases_carbon.json

Same server, same frontend, any scene.
"""

import asyncio
import sys
import logging
from pathlib import Path

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Scene path from CLI argument
# ---------------------------------------------------------------------------

SCENE_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else None

# ---------------------------------------------------------------------------
# Load scene + engine
# ---------------------------------------------------------------------------

from engine.scene_loader import SceneLoader
from engine.simulation_engine import SimulationEngine

loader = SceneLoader()
engine = SimulationEngine(domain=None, tick_interval=0.8)

# Optionally preload a scene from CLI
if SCENE_PATH and SCENE_PATH.exists():
    domain = loader.load(SCENE_PATH)
    engine.domain = domain
    print(f"\nPreloaded: {domain.scene_id}")

print(f"\nOpen http://localhost:8000 in your browser\n")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(engine.run())
    yield

app = FastAPI(lifespan=lifespan)

# Serve frontend
@app.get("/")
async def root():
    return FileResponse("frontend/index.html")

# Generate a scene from a text description — core of the platform
class GenerateRequest(BaseModel):
    description: str

@app.post("/generate")
async def generate_scene(req: GenerateRequest):
    from engine.scene_generator.llm_generator import LLMSceneGenerator
    import functools
    try:
        gen = LLMSceneGenerator(output_dir="scenes")
        # Run the blocking LLM call in a thread so we don't block the event loop
        loop = asyncio.get_event_loop()
        path = await loop.run_in_executor(
            None, functools.partial(gen.generate, req.description)
        )
        new_domain = loader.load(path)
        # Hot-swap: replace domain in running engine
        engine.paused = True
        engine.domain = new_domain
        engine.paused = False
        return {
            "status":      "ok",
            "scene_id":    new_domain.scene_id,
            "description": new_domain.description,
            "nodes":       len(new_domain.graph.nodes),
            "edges":       len(new_domain.graph.edges),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Scene metadata — frontend fetches this once on load
# Returns everything the UI needs to render controls and labels
@app.get("/scene")
async def scene_info():
    if engine.domain is None:
        return JSONResponse({"scene_id": None})
    d = engine.domain
    return JSONResponse({
        "scene_id":    d.scene_id,
        "description": d.description,
        "tick_resolution_seconds": d.tick_resolution_seconds,
        "interventions": d.interventions_spec,
        "visual":      d.visual_config,
        "node_types":  list({data.get("type") for _, data in d.graph.nodes(data=True)}),
        "edge_types":  list({data.get("type") for _, _, data in d.graph.edges(data=True)}),
    })

# WebSocket — streams world state every tick
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await engine.connect(ws)
    try:
        while True:
            await ws.receive_text()  # keep connection alive
    except WebSocketDisconnect:
        engine.disconnect(ws)

# Intervention endpoint — called when user clicks a button in the UI
@app.post("/intervention/{intervention_id}")
async def apply_intervention(intervention_id: str):
    try:
        spec = engine.queue_intervention(intervention_id)
        return {"status": "queued", "label": spec["label"]}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

# Control endpoints
@app.post("/control/pause")
async def pause():
    engine.paused = True
    return {"status": "paused"}

@app.post("/control/resume")
async def resume():
    engine.paused = False
    return {"status": "running"}

@app.post("/control/speed/{multiplier}")
async def set_speed(multiplier: float):
    engine.tick_interval = max(0.1, 1.0 / multiplier)
    return {"status": "ok", "tick_interval": engine.tick_interval}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
