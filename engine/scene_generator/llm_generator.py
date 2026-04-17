"""
llm_generator.py

Given a natural language description of any real-world system,
generates a valid scene JSON that the engine can run immediately.

Usage:
    gen = LLMSceneGenerator()
    scene_path = gen.generate("War in Iran disrupts oil shipping through the Strait of Hormuz")
    domain = SceneLoader().load(scene_path)
"""

from __future__ import annotations
import json
import os
import re
from pathlib import Path

import anthropic

# ---------------------------------------------------------------------------
# Schema + template reference injected into every generation prompt.
# This is what allows the LLM to produce valid scene JSON without
# knowing anything about this codebase.
# ---------------------------------------------------------------------------

SCHEMA_REFERENCE = """
## Universal Node Schema
{
  "id":         string (snake_case, unique),
  "type":       string (what kind of entity),
  "position":   { "lat": float, "lon": float },
  "state":      { ...dynamic values that change during simulation... },
  "properties": { ...static domain-specific facts... },
  "active":     true,
  "agent":      bool (true if this entity makes decisions),
  "agent_tier": "llm" | "gnn" | "rule" | null
}

## Universal Edge Schema
{
  "id":       string (snake_case, unique),
  "from_id":  string (node id),
  "to_id":    string (node id),
  "type":     string (relationship type),
  "directed": bool,
  "capacity": float (max flow),
  "flow":     float (current flow, start at 0),
  "cost":     float (traversal cost — time, money, distance),
  "state":    { "blocked": false, ...other dynamic state... },
  "properties": { "distance_km": float, "free_flow_cost": float (= initial cost), ... },
  "active":   true
}

## Available Behavior Templates

1. "capacity_constraint"
   - Updates edge cost based on flow/capacity congestion
   - params: { "edge_type": str, "alpha": 0.15, "beta": 4 }

2. "flow_conservation"
   - Agents navigate graph via shortest path, reroute when blocked
   - params: { "agent_type": str, "edge_type": str, "speed_field": str,
               "speed_unit": "knots"|"mph"|"kmh", "reroute_on_block": true }

3. "diffusion"
   - A field value spreads across edges proportional to gradient
   - params: { "node_type": str, "edge_type": str, "field": str,
               "rate": float, "min_value": float, "max_value": float }

4. "price_response"
   - A price field adjusts up/down based on inbound flow vs capacity
   - params: { "node_type": str, "price_field": str,
               "equilibrium": 0.7, "sensitivity": 0.05,
               "min_price": float, "max_price": float }

5. "decay_growth"
   - A field changes at a fixed rate each tick
   - params: { "node_type": str, "field": str, "rate": float,
               "source_field": str (optional), "source_scale": float,
               "min_value": float, "max_value": float }

6. "threshold_cascade"
   - When a node field crosses a threshold, neighbors are triggered
   - params: { "node_type": str, "watch_field": str, "threshold": float,
               "direction": "above"|"below", "cascade_field": str,
               "cascade_value": float, "edge_type": str, "propagation": float }

## Intervention Schema
{
  "id":          string,
  "label":       string (shown in UI),
  "description": string,
  "type":        "mutate_edge" | "mutate_node",
  "target_id":   string (edge or node id),
  "changes":     { "field.subfield": new_value, ... },
  "also_mutate": [ { "target_id": ..., "changes": ... } ]  (optional)
}

## Visual Config Schema
Put this under the key "visual" (not "visual_config").
{
  "<node_type>": { "layer": "ScatterplotLayer"|"IconLayer", "color": [r,g,b], "radius": meters },
  "<edge_type>": { "layer": "ArcLayer"|"PathLayer", "color_normal": [r,g,b,a], "color_blocked": [r,g,b,a], "width": int }
}

## tick_resolution_seconds guidance
- Ships/supply chains: 3600 (1 hour per tick)
- City traffic:        60   (1 minute per tick)
- Carbon/climate:      86400 (1 day per tick)
- Financial markets:   3600 (1 hour per tick)
"""

GENERATION_PROMPT = """
You are a simulation scene generator. Given a description of a real-world system,
output a JSON scene definition that a simulation engine can run immediately.

{schema_reference}

## Rules
1. Use real geographic coordinates (lat/lon) for all nodes.
2. Keep scope tight: 6–12 nodes, 6–15 edges. Enough to demonstrate the scenario, not a full model.
3. Include at least one agent node (agent: true) with a destination.
4. Include at least one intervention that creates visible change.
5. Assign behaviors that match the domain — routing agents need flow_conservation,
   edges they traverse need capacity_constraint.
6. Set "free_flow_cost" in edge properties equal to the initial cost value.
7. Output ONLY valid JSON. No explanation, no markdown, no code fences.
8. Be concise — aim for under 3000 tokens total output.

## Scene to generate
{description}
"""


class LLMSceneGenerator:
    """
    Generates a scene JSON from a natural language description.
    Validates output against the schema, retries up to max_attempts times.
    Saves the result to the scenes/ directory.
    """

    def __init__(
        self,
        output_dir: str | Path = "scenes",
        model: str = "claude-sonnet-4-6",
        max_attempts: int = 3,
    ):
        self.client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.model = model
        self.max_attempts = max_attempts

    def generate(self, description: str, scene_id: str | None = None) -> Path:
        """
        Generate a scene from a natural language description.
        Returns the path to the saved scene JSON file.
        """
        if scene_id is None:
            scene_id = self._description_to_id(description)

        errors: list[str] = []

        for attempt in range(1, self.max_attempts + 1):
            print(f"[LLMSceneGenerator] Attempt {attempt}/{self.max_attempts} for '{scene_id}'")

            prompt = GENERATION_PROMPT.format(
                schema_reference=SCHEMA_REFERENCE,
                description=description,
            )

            if errors:
                prompt += f"\n\n## Fix these validation errors from the previous attempt\n"
                for e in errors:
                    prompt += f"- {e}\n"

            raw = self._call_llm(prompt)
            scene_data, errors = self._parse_and_validate(raw, scene_id)

            if not errors:
                path = self._save(scene_data, scene_id)
                print(f"[LLMSceneGenerator] Scene saved to {path}")
                return path

            print(f"[LLMSceneGenerator] Validation errors: {errors}")

        raise RuntimeError(
            f"Failed to generate valid scene after {self.max_attempts} attempts.\n"
            f"Last errors: {errors}"
        )

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _call_llm(self, prompt: str) -> str:
        message = self.client.messages.create(
            model=self.model,
            max_tokens=6000,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text

    def _parse_and_validate(
        self, raw: str, scene_id: str
    ) -> tuple[dict | None, list[str]]:
        """
        Parse JSON from LLM output and validate required structure.
        Returns (scene_dict, errors). errors is empty on success.
        """
        # Strip markdown fences if the LLM included them despite instructions
        clean = re.sub(r"```(?:json)?|```", "", raw).strip()

        try:
            data = json.loads(clean)
        except json.JSONDecodeError as e:
            return None, [f"Invalid JSON: {e}"]

        errors = []

        # Inject/override scene_id
        data["scene_id"] = scene_id

        # Normalize visual config key: accept visual_config → rename to visual
        if "visual_config" in data and "visual" not in data:
            data["visual"] = data.pop("visual_config")

        # Required top-level fields
        for field in ["nodes", "edges", "behaviors"]:
            if field not in data:
                errors.append(f"Missing required top-level field: '{field}'")

        if errors:
            return None, errors

        # Validate nodes
        for i, node in enumerate(data.get("nodes", [])):
            for f in ["id", "type", "position"]:
                if f not in node:
                    errors.append(f"Node[{i}] missing field '{f}'")
            if "position" in node:
                if "lat" not in node["position"] or "lon" not in node["position"]:
                    errors.append(f"Node[{i}] position missing lat or lon")
            # Ensure required fields have defaults
            node.setdefault("state", {})
            node.setdefault("properties", {})
            node.setdefault("active", True)
            node.setdefault("agent", False)

            # Auto-normalize agent nodes so FlowConservationTemplate can run them
            if node.get("agent"):
                # destination belongs in properties, not state
                if "destination" in node["state"] and "destination" not in node["properties"]:
                    node["properties"]["destination"] = node["state"].pop("destination")
                # agents need status=en_route, current_node, route, progress
                node["state"].setdefault("status", "en_route")
                node["state"].setdefault("route", [])
                node["state"].setdefault("progress", 0.0)
                # infer current_node: find the infrastructure node closest to agent position
                if "current_node" not in node["state"] and "position" in node:
                    node["state"]["current_node"] = self._nearest_non_agent_node(
                        node, data.get("nodes", [])
                    )

        # Validate edges
        node_ids = {n["id"] for n in data.get("nodes", []) if "id" in n}
        for i, edge in enumerate(data.get("edges", [])):
            for f in ["id", "from_id", "to_id", "type", "capacity"]:
                if f not in edge:
                    errors.append(f"Edge[{i}] missing field '{f}'")
            if edge.get("from_id") not in node_ids:
                errors.append(f"Edge[{i}] from_id '{edge.get('from_id')}' not in nodes")
            if edge.get("to_id") not in node_ids:
                errors.append(f"Edge[{i}] to_id '{edge.get('to_id')}' not in nodes")
            # Defaults
            edge.setdefault("directed", True)
            edge.setdefault("flow", 0.0)
            edge.setdefault("cost", 1.0)
            edge.setdefault("state", {"blocked": False})
            edge.setdefault("properties", {})
            edge.setdefault("active", True)
            # Ensure free_flow_cost exists in properties
            edge["properties"].setdefault("free_flow_cost", edge["cost"])

        # Validate behaviors is a dict, not a list
        behaviors = data.get("behaviors", {})
        if isinstance(behaviors, list):
            # Try to auto-convert: [{name, template, params}] → {name: {template, params}}
            converted = {}
            for item in behaviors:
                key = item.get("name") or item.get("id") or item.get("type")
                if key:
                    converted[key] = {k: v for k, v in item.items() if k not in ("name", "id")}
            if converted:
                data["behaviors"] = converted
                behaviors = converted
            else:
                errors.append(
                    "'behaviors' must be a JSON object {}, not an array []. "
                    "Example: {\"ship_routing\": {\"template\": \"flow_conservation\", \"params\": {...}}}"
                )

        # Validate behaviors reference known templates
        known = {
            "capacity_constraint", "flow_conservation", "diffusion",
            "price_response", "decay_growth", "threshold_cascade",
        }
        for key, behavior in behaviors.items() if isinstance(behaviors, dict) else []:
            t = behavior.get("template")
            if t not in known:
                errors.append(f"Behavior '{key}' uses unknown template '{t}'")

        return (data if not errors else None), errors

    def _nearest_non_agent_node(self, agent: dict, nodes: list) -> str | None:
        """Find the closest non-agent node to the agent's position."""
        alat = agent["position"]["lat"]
        alon = agent["position"]["lon"]
        best_id, best_dist = None, float("inf")
        for n in nodes:
            if n.get("agent") or "position" not in n or "id" not in n:
                continue
            dlat = n["position"]["lat"] - alat
            dlon = n["position"]["lon"] - alon
            dist = dlat ** 2 + dlon ** 2
            if dist < best_dist:
                best_dist, best_id = dist, n["id"]
        return best_id

    def _save(self, data: dict, scene_id: str) -> Path:
        path = self.output_dir / f"{scene_id}.json"
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        return path

    @staticmethod
    def _description_to_id(description: str) -> str:
        """Convert a description string to a snake_case scene_id."""
        words = re.sub(r"[^a-zA-Z0-9\s]", "", description.lower()).split()
        return "_".join(words[:6])
