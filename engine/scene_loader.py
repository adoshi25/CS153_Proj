"""
scene_loader.py

Reads a scene JSON file, validates it against the universal schema,
builds a NetworkX graph, wires behavior templates, and returns a Domain.

Adding a new scene = adding a new JSON file.
Zero Python changes required for new domains.
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any

import networkx as nx

from engine.world_state import Node, Edge, Domain
from engine.behavior_templates import TEMPLATE_REGISTRY, BehaviorTemplate


class SceneLoadError(Exception):
    pass


class SceneLoader:

    def load(self, scene_path: str | Path) -> Domain:
        """
        Load a scene JSON file and return a configured Domain ready to simulate.
        """
        path = Path(scene_path)
        if not path.exists():
            raise SceneLoadError(f"Scene file not found: {path}")

        with open(path) as f:
            data = json.load(f)

        self._validate_top_level(data)

        graph = self._build_graph(data)
        templates = self._wire_templates(graph, data.get("behaviors", {}))

        return Domain(
            scene_id=data["scene_id"],
            description=data.get("description", ""),
            tick_resolution_seconds=data.get("tick_resolution_seconds", 3600),
            graph=graph,
            templates=templates,
            interventions_spec=data.get("interventions", []),
            visual_config=data.get("visual") or data.get("visual_config", {}),
        )

    # ------------------------------------------------------------------
    # Graph construction
    # ------------------------------------------------------------------

    def _build_graph(self, data: dict) -> nx.MultiDiGraph:
        g = nx.MultiDiGraph()

        for raw_node in data.get("nodes", []):
            node = Node(**raw_node)
            # Store all fields as node attributes
            g.add_node(node.id, **node.model_dump())

        for raw_edge in data.get("edges", []):
            edge = Edge(**raw_edge)
            edge_dict = edge.model_dump()
            # Flow may be an EdgeFlow object — convert back to dict for storage
            if hasattr(edge.flow, "model_dump"):
                edge_dict["flow"] = edge.flow.model_dump()

            g.add_edge(
                edge.from_id,
                edge.to_id,
                key=edge.id,
                **edge_dict,
            )

            # If undirected, add the reverse edge sharing the same data dict
            if not edge.directed:
                g.add_edge(
                    edge.to_id,
                    edge.from_id,
                    key=edge.id + "_rev",
                    **{**edge_dict, "id": edge.id + "_rev", "directed": True},
                )

        return g

    # ------------------------------------------------------------------
    # Template wiring
    # ------------------------------------------------------------------

    def _wire_templates(
        self, graph: nx.MultiDiGraph, behaviors: dict
    ) -> list[BehaviorTemplate]:
        """
        behaviors dict from scene JSON maps a node/edge type to a template name + params.

        Example:
            "behaviors": {
              "ship": {
                "template": "flow_conservation",
                "params": { "agent_type": "ship", "edge_type": "shipping_lane", ... }
              },
              "shipping_lane": {
                "template": "capacity_constraint",
                "params": { "edge_type": "shipping_lane" }
              }
            }

        Templates are instantiated in the order that matters for correct simulation
        (capacity before flow, diffusion after flow, etc.).
        """
        # Ordered template priority — must match the step-order defined in the module header
        STEP_ORDER = [
            "capacity_constraint",
            "flow_conservation",
            "diffusion",
            "price_response",
            "decay_growth",
            "threshold_cascade",
        ]

        # Collect all template specs from the behaviors dict
        specs: list[tuple[int, str, dict]] = []  # (priority, template_name, params)

        for _type_key, behavior in behaviors.items():
            template_name = behavior.get("template")
            if not template_name:
                raise SceneLoadError(f"Behavior for '{_type_key}' missing 'template' field")

            if template_name not in TEMPLATE_REGISTRY:
                raise SceneLoadError(
                    f"Unknown template '{template_name}'. "
                    f"Available: {list(TEMPLATE_REGISTRY.keys())}"
                )

            priority = STEP_ORDER.index(template_name) if template_name in STEP_ORDER else 99
            params = behavior.get("params", {})
            specs.append((priority, template_name, params))

        # Sort by step order priority
        specs.sort(key=lambda x: x[0])

        # Instantiate templates
        templates = []
        for _, template_name, params in specs:
            cls = TEMPLATE_REGISTRY[template_name]
            templates.append(cls(graph=graph, params=params))

        return templates

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def _validate_top_level(self, data: dict) -> None:
        required = ["scene_id", "nodes", "edges"]
        for field in required:
            if field not in data:
                raise SceneLoadError(f"Scene JSON missing required field: '{field}'")
