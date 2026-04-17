"""
osm_generator.py

Pulls a real road network for any city from OpenStreetMap and converts it
to a valid scene JSON the engine can run immediately.

Usage:
    gen = OSMSceneGenerator()
    scene_path = gen.generate("Los Angeles, CA, USA")
    domain = SceneLoader().load(scene_path)

No hardcoding. Any city on Earth works.
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any

try:
    import osmnx as ox
    OSMNX_AVAILABLE = True
except ImportError:
    OSMNX_AVAILABLE = False


# Road type → (capacity veh/hr/lane, typical speed kph)
# Standard values from Highway Capacity Manual
ROAD_CAPACITY: dict[str, tuple[int, int]] = {
    "motorway":       (2200, 110),
    "motorway_link":  (1500, 80),
    "trunk":          (1800, 90),
    "trunk_link":     (1200, 70),
    "primary":        (1500, 60),
    "primary_link":   (1000, 50),
    "secondary":      (1200, 50),
    "secondary_link": (800,  40),
    "tertiary":       (900,  40),
    "tertiary_link":  (600,  30),
    "residential":    (600,  30),
    "living_street":  (300,  15),
    "unclassified":   (600,  40),
}

DEFAULT_CAPACITY = (800, 40)

# Visual colors per road type
ROAD_COLORS: dict[str, list] = {
    "motorway":  [255, 160, 0,   180],
    "trunk":     [255, 160, 0,   160],
    "primary":   [255, 220, 100, 160],
    "secondary": [200, 220, 255, 140],
    "default":   [180, 180, 180, 120],
}


class OSMSceneGenerator:
    """
    Generates a city traffic scene from OpenStreetMap data.
    The output is a valid scene JSON that uses flow_conservation
    and capacity_constraint templates for realistic traffic simulation.
    """

    def __init__(self, output_dir: str | Path = "scenes"):
        if not OSMNX_AVAILABLE:
            raise ImportError(
                "osmnx is required for OSMSceneGenerator. "
                "Install it with: pip install osmnx"
            )
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    def generate(
        self,
        place: str,
        network_type: str = "drive",
        simplify: bool = True,
        max_nodes: int = 500,
        scene_id: str | None = None,
    ) -> Path:
        """
        Pull road network for a place and convert to scene JSON.

        Args:
            place:        City/region name as OSM would understand it
                          e.g. "Los Angeles, CA, USA" or "Manhattan, NYC"
            network_type: "drive" | "walk" | "bike" | "all"
            simplify:     Merge dead-end nodes for cleaner graph
            max_nodes:    Cap node count for performance (samples evenly if exceeded)
            scene_id:     Optional override for scene_id field
        """
        print(f"[OSMSceneGenerator] Pulling road network for '{place}'...")
        G = ox.graph_from_place(place, network_type=network_type, simplify=simplify)

        print(f"[OSMSceneGenerator] Raw graph: {len(G.nodes)} nodes, {len(G.edges)} edges")

        if len(G.nodes) > max_nodes:
            G = self._subsample(G, max_nodes)
            print(f"[OSMSceneGenerator] Subsampled to {len(G.nodes)} nodes")

        scene = self._convert(G, place, scene_id)
        path  = self._save(scene)
        print(f"[OSMSceneGenerator] Scene saved to {path}")
        return path

    # ------------------------------------------------------------------
    # Conversion
    # ------------------------------------------------------------------

    def _convert(self, G: Any, place: str, scene_id: str | None) -> dict:
        sid = scene_id or self._place_to_id(place)

        nodes = []
        for osmid, data in G.nodes(data=True):
            node_id = f"node_{osmid}"
            nodes.append({
                "id":       node_id,
                "type":     "intersection",
                "position": {"lat": data["y"], "lon": data["x"]},
                "state":    {"status": "active", "congestion": 0.0},
                "properties": {
                    "osmid":         osmid,
                    "street_count":  data.get("street_count", 2),
                },
                "active": True,
            })

        edges = []
        seen_edge_ids = set()

        for u, v, k, data in G.edges(keys=True, data=True):
            highway = data.get("highway", "unclassified")
            if isinstance(highway, list):
                highway = highway[0]

            capacity, speed_kph = ROAD_CAPACITY.get(highway, DEFAULT_CAPACITY)

            # Account for number of lanes
            lanes = data.get("lanes", 1)
            if isinstance(lanes, list):
                lanes = max(int(l) for l in lanes if str(l).isdigit())
            lanes = int(lanes) if str(lanes).isdigit() else 1
            total_capacity = capacity * lanes

            # Cost = travel time in minutes
            length_m   = data.get("length", 100)
            speed_ms   = speed_kph / 3.6
            cost_min   = (length_m / speed_ms) / 60.0

            edge_id = f"road_{u}_{v}_{k}"
            if edge_id in seen_edge_ids:
                continue
            seen_edge_ids.add(edge_id)

            directed = data.get("oneway", False)

            color = self._road_color(highway)

            edges.append({
                "id":       edge_id,
                "from_id":  f"node_{u}",
                "to_id":    f"node_{v}",
                "type":     "road",
                "directed": bool(directed),
                "capacity": float(total_capacity),
                "flow":     0.0,
                "cost":     round(cost_min, 3),
                "state":    {"blocked": False, "congestion": 0.0},
                "properties": {
                    "distance_m":     round(length_m, 1),
                    "distance_km":    round(length_m / 1000, 3),
                    "speed_kph":      speed_kph,
                    "lanes":          lanes,
                    "highway_type":   highway,
                    "road_name":      data.get("name", ""),
                    "free_flow_cost": round(cost_min, 3),
                },
                "active": True,
            })

        # Auto-generate two car agents starting at random high-degree nodes
        agent_nodes = self._pick_agent_start_nodes(G, n=2)
        agents = []
        for i, (start_osmid, dest_osmid) in enumerate(agent_nodes):
            agents.append({
                "id":       f"car_agent_{i:02d}",
                "type":     "car",
                "position": {
                    "lat": G.nodes[start_osmid]["y"],
                    "lon": G.nodes[start_osmid]["x"],
                },
                "state": {
                    "status":       "en_route",
                    "speed_mph":    30,
                    "current_node": f"node_{start_osmid}",
                    "route":        [],
                    "progress":     0.0,
                },
                "properties": {
                    "destination": f"node_{dest_osmid}",
                },
                "active":     True,
                "agent":      True,
                "agent_tier": "rule",
            })
        nodes.extend(agents)

        return {
            "scene_id":                sid,
            "description":             f"Road network for {place} — OSM data",
            "tick_resolution_seconds": 60,
            "nodes":      nodes,
            "edges":      edges,
            "behaviors": {
                "road_capacity": {
                    "template": "capacity_constraint",
                    "params": {
                        "edge_type": "road",
                        "alpha":     0.15,
                        "beta":      4,
                    },
                },
                "car_routing": {
                    "template": "flow_conservation",
                    "params": {
                        "agent_type":      "car",
                        "edge_type":       "road",
                        "speed_field":     "speed_mph",
                        "speed_unit":      "mph",
                        "reroute_on_block": True,
                    },
                },
            },
            "interventions": [
                {
                    "id":          "road_closure",
                    "label":       "Close Road Segment",
                    "description": "Block a road segment and watch traffic reroute",
                    "type":        "mutate_edge",
                    "target_id":   edges[0]["id"] if edges else "",
                    "changes":     {"state.blocked": True, "capacity": 0},
                }
            ],
            "visual": {
                "intersection": {
                    "layer":  "ScatterplotLayer",
                    "color":  [200, 200, 200],
                    "radius": 8,
                },
                "car": {
                    "layer": "IconLayer",
                    "icon":  "car",
                    "size":  16,
                },
                "road": {
                    "layer":         "PathLayer",
                    "color_normal":  [180, 180, 180, 140],
                    "color_blocked": [255, 60,  60,  220],
                    "width":         2,
                },
            },
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _subsample(self, G: Any, max_nodes: int) -> Any:
        """Keep only nodes near the center of the graph bbox."""
        import numpy as np
        lats = [d["y"] for _, d in G.nodes(data=True)]
        lons = [d["x"] for _, d in G.nodes(data=True)]
        center_lat = sum(lats) / len(lats)
        center_lon = sum(lons) / len(lons)

        # Sort nodes by distance from center, keep closest max_nodes
        def dist(d):
            return (d["y"] - center_lat) ** 2 + (d["x"] - center_lon) ** 2

        sorted_nodes = sorted(G.nodes(data=True), key=lambda nd: dist(nd[1]))
        keep = {osmid for osmid, _ in sorted_nodes[:max_nodes]}
        return G.subgraph(keep).copy()

    def _pick_agent_start_nodes(self, G: Any, n: int) -> list[tuple]:
        """Pick n (start, destination) pairs from high-degree nodes."""
        by_degree = sorted(G.degree(), key=lambda x: x[1], reverse=True)
        top = [osmid for osmid, _ in by_degree[:max(n * 4, 8)]]
        pairs = []
        for i in range(n):
            start = top[i * 2 % len(top)]
            dest  = top[(i * 2 + len(top) // 2) % len(top)]
            if start != dest:
                pairs.append((start, dest))
        return pairs

    def _road_color(self, highway: str) -> list[int]:
        for prefix, color in ROAD_COLORS.items():
            if highway.startswith(prefix):
                return color
        return ROAD_COLORS["default"]

    def _place_to_id(self, place: str) -> str:
        import re
        return re.sub(r"[^a-z0-9]+", "_", place.lower()).strip("_")

    def _save(self, scene: dict) -> Path:
        path = self.output_dir / f"{scene['scene_id']}.json"
        with open(path, "w") as f:
            json.dump(scene, f, indent=2)
        return path
