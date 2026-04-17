"""
generate_scene.py

CLI for generating scenes without writing any JSON by hand.

Usage:
    # Generate from natural language description
    python generate_scene.py llm "War in Iran disrupts oil shipping through the Strait of Hormuz"

    # Generate from a real city's road network
    python generate_scene.py osm "Manhattan, New York, USA"

    # Then run a generated scene
    python generate_scene.py run scenes/war_in_iran_disrupts_oil.json
"""

import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()


def cmd_llm(description: str):
    from engine.scene_generator.llm_generator import LLMSceneGenerator
    from engine.scene_loader import SceneLoader

    gen    = LLMSceneGenerator(output_dir="scenes")
    path   = gen.generate(description)

    print(f"\nValidating scene with SceneLoader...")
    domain = SceneLoader().load(path)
    print(f"Scene valid. {len(domain.graph.nodes)} nodes, {len(domain.graph.edges)} edges.")
    print(f"Templates loaded: {[type(t).__name__ for t in domain.templates]}")
    print(f"\nReady to simulate: {path}")


def cmd_osm(place: str):
    from engine.scene_generator.osm_generator import OSMSceneGenerator
    from engine.scene_loader import SceneLoader

    gen    = OSMSceneGenerator(output_dir="scenes")
    path   = gen.generate(place)

    print(f"\nValidating scene with SceneLoader...")
    domain = SceneLoader().load(path)
    print(f"Scene valid. {len(domain.graph.nodes)} nodes, {len(domain.graph.edges)} edges.")
    print(f"\nReady to simulate: {path}")


def cmd_run(scene_path: str, ticks: int = 10):
    """Quick smoke test — load and step a scene N ticks, print snapshot summary."""
    from engine.scene_loader import SceneLoader
    import json

    domain = SceneLoader().load(scene_path)
    print(f"Loaded '{domain.scene_id}'. Running {ticks} ticks...\n")

    for _ in range(ticks):
        domain.step()

    snap = domain.to_snapshot()
    print(f"Tick {snap['tick']} snapshot:")
    print(f"  Nodes: {len(snap['nodes'])}")
    print(f"  Edges: {len(snap['edges'])}")

    agents = [n for n in snap["nodes"] if n.get("agent")]
    for a in agents:
        print(f"  Agent {a['id']}: status={a['state'].get('status')} "
              f"pos=({a['position']['lat']:.3f}, {a['position']['lon']:.3f})")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    arg     = sys.argv[2]

    if command == "llm":
        cmd_llm(arg)
    elif command == "osm":
        cmd_osm(arg)
    elif command == "run":
        ticks = int(sys.argv[3]) if len(sys.argv) > 3 else 10
        cmd_run(arg, ticks)
    else:
        print(f"Unknown command '{command}'. Use: llm | osm | run")
        sys.exit(1)
