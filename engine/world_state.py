"""
world_state.py

Defines the universal schema types (Node, Edge) and the Domain class
that wraps a NetworkX graph. Everything the simulation touches lives here.
"""

from __future__ import annotations
from typing import Any, Optional, Union
from pydantic import BaseModel, field_validator
import networkx as nx
import copy


# ---------------------------------------------------------------------------
# Schema types — enforce the universal schema at load time
# ---------------------------------------------------------------------------

class Position(BaseModel):
    lat: float
    lon: float


class Node(BaseModel):
    id: str
    type: str
    position: Position
    state: dict[str, Any] = {}
    properties: dict[str, Any] = {}
    active: bool = True
    agent: bool = False
    agent_tier: Optional[str] = None  # 'llm' | 'gnn' | 'rule'

    @field_validator("agent_tier")
    @classmethod
    def valid_tier(cls, v):
        if v is not None and v not in ("llm", "gnn", "rule"):
            raise ValueError(f"agent_tier must be 'llm', 'gnn', or 'rule', got '{v}'")
        return v


class EdgeFlow(BaseModel):
    """Flow on an undirected edge has two directions."""
    forward: float = 0.0
    reverse: float = 0.0


class Edge(BaseModel):
    id: str
    from_id: str
    to_id: str
    type: str
    directed: bool = True
    capacity: float
    flow: Union[float, EdgeFlow] = 0.0
    cost: float = 1.0
    state: dict[str, Any] = {}
    properties: dict[str, Any] = {}
    active: bool = True

    @field_validator("flow", mode="before")
    @classmethod
    def parse_flow(cls, v):
        if isinstance(v, dict):
            return EdgeFlow(**v)
        return v


# ---------------------------------------------------------------------------
# Domain — wraps a NetworkX MultiDiGraph, owns one scene's world state
# ---------------------------------------------------------------------------

class Domain:
    """
    One simulation domain (e.g., supply_chain, city_traffic, emissions).
    Holds the NetworkX graph and the list of behavior templates that step it.
    """

    def __init__(
        self,
        scene_id: str,
        description: str,
        tick_resolution_seconds: int,
        graph: nx.MultiDiGraph,
        templates: list,             # list of BehaviorTemplate instances
        interventions_spec: list,    # raw dicts from scene JSON
        visual_config: dict,
    ):
        self.scene_id = scene_id
        self.description = description
        self.tick_resolution_seconds = tick_resolution_seconds
        self.graph = graph
        self.templates = templates
        self.interventions_spec = interventions_spec
        self.visual_config = visual_config
        self.tick: int = 0

    # ------------------------------------------------------------------
    # Step
    # ------------------------------------------------------------------

    def step(self) -> None:
        """Advance the domain one tick. Templates run in defined order."""
        dt = self.tick_resolution_seconds / 3600.0  # dt in hours

        # Step order matters — see behavior_templates.py header comment
        for template in self.templates:
            template.step(dt)

        self.tick += 1

    # ------------------------------------------------------------------
    # Graph helpers
    # ------------------------------------------------------------------

    def get_node(self, node_id: str) -> dict[str, Any]:
        return self.graph.nodes[node_id]

    def get_edge(self, edge_id: str) -> dict[str, Any]:
        """Look up an edge by its schema `id` field."""
        for u, v, k, data in self.graph.edges(keys=True, data=True):
            if data.get("id") == edge_id:
                return data
        raise KeyError(f"Edge '{edge_id}' not found")

    def nodes_of_type(self, node_type: str) -> list[str]:
        return [
            n for n, d in self.graph.nodes(data=True)
            if d.get("type") == node_type and d.get("active", True)
        ]

    def edges_of_type(self, edge_type: str) -> list[tuple]:
        """Returns list of (u, v, key) tuples for edges of a given type."""
        return [
            (u, v, k)
            for u, v, k, d in self.graph.edges(keys=True, data=True)
            if d.get("type") == edge_type and d.get("active", True)
        ]

    def agents_of_tier(self, tier: str) -> list[str]:
        return [
            n for n, d in self.graph.nodes(data=True)
            if d.get("agent") and d.get("agent_tier") == tier and d.get("active", True)
        ]

    # ------------------------------------------------------------------
    # Serialization — produces the JSON pushed to the frontend each tick
    # ------------------------------------------------------------------

    def to_snapshot(self) -> dict[str, Any]:
        """
        Full world state snapshot. Sent to frontend via WebSocket each tick.
        Includes tick number, all active nodes and edges.
        """
        nodes = []
        for node_id, data in self.graph.nodes(data=True):
            if data.get("active", True):
                nodes.append({
                    "id":         data.get("id", node_id),
                    "type":       data.get("type"),
                    "position":   data.get("position"),
                    "state":      data.get("state", {}),
                    "properties": data.get("properties", {}),
                    "agent":      data.get("agent", False),
                    "agent_tier": data.get("agent_tier"),
                })

        edges = []
        for u, v, k, data in self.graph.edges(keys=True, data=True):
            if data.get("active", True):
                edges.append({
                    "id":       data.get("id"),
                    "from_id":  u,
                    "to_id":    v,
                    "type":     data.get("type"),
                    "directed": data.get("directed", True),
                    "capacity": data.get("capacity"),
                    "flow":     data.get("flow", 0),
                    "cost":     data.get("cost", 1.0),
                    "state":    data.get("state", {}),
                })

        return {
            "scene_id":    self.scene_id,
            "tick":        self.tick,
            "nodes":       nodes,
            "edges":       edges,
            "visual":      self.visual_config,
        }
