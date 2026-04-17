"""
behavior_templates.py

Six universal dynamics templates. Every scene is composed from these.
No domain-specific logic lives here — params from the scene JSON control behavior.

Step order when a Domain calls its templates:
  1. CapacityConstraintTemplate  — update edge costs from current flow
  2. FlowConservationTemplate    — agents reroute + move on updated costs
  3. DiffusionTemplate           — values spread across edges
  4. PriceResponseTemplate       — prices adjust to supply/demand
  5. DecayGrowthTemplate         — values decay or grow over time
  6. ThresholdCascadeTemplate    — check for cascade triggers

Each template:
  - receives the NetworkX graph at init
  - filters to its relevant nodes/edges by type
  - modifies graph state in-place during step()
  - is fully parameterized from the scene JSON (no hardcoded domain values)
"""

from __future__ import annotations
import math
import networkx as nx
from typing import Any


# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------

class BehaviorTemplate:
    """All templates implement step(dt_hours) and operate on self.graph."""

    def __init__(self, graph: nx.MultiDiGraph, params: dict[str, Any]):
        self.graph = graph
        self.params = params

    def step(self, dt_hours: float) -> None:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# 1. CapacityConstraintTemplate
#
# Updates edge cost based on current flow/capacity ratio using the
# Bureau of Public Roads (BPR) function — standard in traffic engineering.
# Works for any domain where congestion increases traversal cost.
#
# BPR: cost = free_flow_cost * (1 + alpha * (flow/capacity)^beta)
# ---------------------------------------------------------------------------

class CapacityConstraintTemplate(BehaviorTemplate):
    """
    Params:
      edge_type       : which edges this applies to (e.g. "shipping_lane")
      alpha           : BPR alpha, typically 0.15
      beta            : BPR exponent, typically 4
    """

    def step(self, dt_hours: float) -> None:
        edge_type = self.params["edge_type"]
        alpha = self.params.get("alpha", 0.15)
        beta  = self.params.get("beta", 4)

        for u, v, k, data in self.graph.edges(keys=True, data=True):
            if data.get("type") != edge_type or not data.get("active", True):
                continue
            if data.get("state", {}).get("blocked"):
                data["cost"] = float("inf")
                continue

            capacity = data.get("capacity", 1)
            flow     = data.get("flow", 0)
            free_flow_cost = data["properties"].get("free_flow_cost", data.get("cost", 1.0))

            if capacity > 0:
                ratio = flow / capacity
                data["cost"] = free_flow_cost * (1 + alpha * (ratio ** beta))
                data["state"]["congestion"] = min(ratio, 1.0)
            else:
                data["cost"] = float("inf")
                data["state"]["congestion"] = 1.0


# ---------------------------------------------------------------------------
# 2. FlowConservationTemplate
#
# Agents navigate the graph from their current position to their destination
# using shortest-path routing on edge cost. When an edge on their route
# becomes blocked or too expensive, they reroute automatically.
#
# Position is interpolated along edges between ticks so the frontend can
# render smooth movement even at coarse tick resolutions.
# ---------------------------------------------------------------------------

class FlowConservationTemplate(BehaviorTemplate):
    """
    Params:
      agent_type      : node type that acts as a routing agent (e.g. "ship")
      edge_type       : edge type agents traverse (e.g. "shipping_lane")
      speed_field     : state field on agent holding its speed (e.g. "speed_knots")
      speed_unit      : "knots" | "mph" | "kmh"
      cost_field      : edge field to minimize (default "cost")
      reroute_on_block: bool — reroute immediately when path is blocked
    """

    SPEED_TO_KMH = {"knots": 1.852, "mph": 1.609, "kmh": 1.0}

    def step(self, dt_hours: float) -> None:
        agent_type  = self.params["agent_type"]
        edge_type   = self.params["edge_type"]
        speed_field = self.params.get("speed_field", "speed_knots")
        speed_unit  = self.params.get("speed_unit", "knots")
        reroute     = self.params.get("reroute_on_block", True)

        # Reset edge flows before counting
        for u, v, k, data in self.graph.edges(keys=True, data=True):
            if data.get("type") == edge_type:
                data["flow"] = 0

        # Build a subgraph view of only the relevant edges for routing
        routing_graph = self._build_routing_subgraph(edge_type)

        agents = [
            n for n, d in self.graph.nodes(data=True)
            if d.get("type") == agent_type
            and d.get("agent")
            and d.get("active", True)
            and d.get("state", {}).get("status") == "en_route"
        ]

        for agent_id in agents:
            agent = self.graph.nodes[agent_id]
            destination = agent["properties"].get("destination")
            if not destination:
                continue

            current_node = agent["state"].get("current_node", agent_id)

            # Reroute if no route or next edge is blocked/missing
            route = agent["state"].get("route", [])
            needs_reroute = (
                not route or
                (reroute and self._next_edge_blocked(current_node, route, edge_type))
            )
            if needs_reroute:
                route = self._find_route(routing_graph, current_node, destination)
                agent["state"]["route"] = route
                agent["state"]["progress"] = 0.0  # reset mid-edge progress on reroute

            if not route:
                agent["state"]["status"] = "no_route"
                continue

            # Advance agent along current edge
            next_node = route[0]
            edge_key  = self._get_edge_key(current_node, next_node, edge_type)
            if edge_key is None:
                agent["state"]["status"] = "no_route"
                continue

            u, v, k = edge_key
            edge_data = self.graph.edges[u, v, k]

            distance_km   = edge_data["properties"].get("distance_km", 100.0)
            speed_raw     = agent["state"].get(speed_field, 14)
            speed_kmh     = speed_raw * self.SPEED_TO_KMH.get(speed_unit, 1.0)
            progress_gain = (speed_kmh * dt_hours) / max(distance_km, 0.001)

            progress = agent["state"].get("progress", 0.0) + progress_gain

            if progress >= 1.0:
                # Arrived at next node
                agent["state"]["current_node"] = next_node
                agent["state"]["progress"]     = 0.0
                agent["state"]["route"]        = route[1:]
                agent["position"]              = dict(self.graph.nodes[next_node]["position"])

                if not route[1:]:
                    agent["state"]["status"] = "arrived"
            else:
                agent["state"]["progress"] = progress
                # Interpolate lat/lon between nodes for smooth rendering
                from_pos = self.graph.nodes[current_node]["position"]
                to_pos   = self.graph.nodes[next_node]["position"]
                agent["position"] = {
                    "lat": from_pos["lat"] + progress * (to_pos["lat"] - from_pos["lat"]),
                    "lon": from_pos["lon"] + progress * (to_pos["lon"] - from_pos["lon"]),
                }

            # Track flow on edge
            edge_data["flow"] = edge_data.get("flow", 0) + 1
            agent["state"]["current_edge"] = edge_data.get("id")

    # ------------------------------------------------------------------

    def _build_routing_subgraph(self, edge_type: str) -> nx.DiGraph:
        """Lightweight DiGraph of only active, unblocked edges of edge_type."""
        g = nx.DiGraph()
        for u, v, k, data in self.graph.edges(keys=True, data=True):
            if data.get("type") != edge_type or not data.get("active", True):
                continue
            if data.get("state", {}).get("blocked"):
                continue
            cost = data.get("cost", 1.0)
            if cost == float("inf"):
                continue
            g.add_edge(u, v, weight=cost, key=k)
            if not data.get("directed", True):
                g.add_edge(v, u, weight=cost, key=k)
        return g

    def _find_route(self, routing_graph: nx.DiGraph, source: str, target: str) -> list[str]:
        """Returns ordered list of node ids from source to target (exclusive of source)."""
        try:
            path = nx.shortest_path(routing_graph, source, target, weight="weight")
            return path[1:]  # exclude current position
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

    def _next_edge_blocked(self, current_node: str, route: list[str], edge_type: str) -> bool:
        """True if the very next edge in the route is blocked or no longer exists."""
        if not route:
            return False
        next_node = route[0]
        edge_key = self._get_edge_key(current_node, next_node, edge_type)
        if edge_key is None:
            return True  # edge disappeared — reroute
        u, v, k = edge_key
        return self.graph.edges[u, v, k].get("state", {}).get("blocked", False)

    def _get_edge_key(self, u: str, v: str, edge_type: str) -> tuple | None:
        """Find the key of the edge between u and v of the given type that is traversable."""
        if not self.graph.has_node(u) or not self.graph.has_node(v):
            return None
        for k, data in self.graph.get_edge_data(u, v, default={}).items():
            if (data.get("type") == edge_type
                    and data.get("active", True)
                    and not data.get("state", {}).get("blocked", False)):
                return (u, v, k)
        return None


# ---------------------------------------------------------------------------
# 3. DiffusionTemplate
#
# A scalar field (e.g., carbon_ppm, disease prevalence, information)
# spreads across edges proportional to the concentration gradient between
# connected nodes. The rate and field name are fully parameterized.
# ---------------------------------------------------------------------------

class DiffusionTemplate(BehaviorTemplate):
    """
    Params:
      node_type       : node types involved in diffusion
      edge_type       : edge type that carries the diffusion
      field           : node state field that diffuses (e.g. "carbon_ppm")
      rate            : diffusion coefficient per hour (0.0 – 1.0)
      min_value       : floor on the field (default 0.0)
      max_value       : ceiling on the field (default inf)
    """

    def step(self, dt_hours: float) -> None:
        node_type  = self.params["node_type"]
        edge_type  = self.params["edge_type"]
        field      = self.params["field"]
        rate       = self.params.get("rate", 0.1)
        min_value  = self.params.get("min_value", 0.0)
        max_value  = self.params.get("max_value", float("inf"))

        # Compute deltas separately to avoid order-dependence within a tick
        deltas: dict[str, float] = {}

        for u, v, k, data in self.graph.edges(keys=True, data=True):
            if data.get("type") != edge_type or not data.get("active", True):
                continue

            u_data = self.graph.nodes.get(u, {})
            v_data = self.graph.nodes.get(v, {})

            if u_data.get("type") != node_type and v_data.get("type") != node_type:
                continue

            u_val = u_data.get("state", {}).get(field, 0.0)
            v_val = v_data.get("state", {}).get(field, 0.0)

            # Wind/flow direction can bias diffusion
            flow    = data.get("flow", 0.5)
            directed = data.get("directed", False)
            gradient = u_val - v_val

            # Transfer amount proportional to gradient, rate, and dt
            transfer = gradient * rate * flow * dt_hours

            deltas[u] = deltas.get(u, 0.0) - transfer
            deltas[v] = deltas.get(v, 0.0) + transfer

            if not directed:
                # Bidirectional: reverse flow also applies
                reverse_transfer = (v_val - u_val) * rate * (1 - flow) * dt_hours
                deltas[v] = deltas.get(v, 0.0) - reverse_transfer
                deltas[u] = deltas.get(u, 0.0) + reverse_transfer

        # Apply deltas
        for node_id, delta in deltas.items():
            node = self.graph.nodes.get(node_id)
            if node is None:
                continue
            current = node.get("state", {}).get(field, 0.0)
            node["state"][field] = max(min_value, min(max_value, current + delta))


# ---------------------------------------------------------------------------
# 4. PriceResponseTemplate
#
# A price field on nodes adjusts up when utilization (flow / capacity)
# exceeds an equilibrium threshold, and down when below it.
# Captures supply/demand dynamics in commodity, energy, or housing markets.
# ---------------------------------------------------------------------------

class PriceResponseTemplate(BehaviorTemplate):
    """
    Params:
      node_type        : nodes that hold the price (e.g. "commodity_hub")
      price_field      : state field to adjust (e.g. "oil_price_usd")
      flow_field       : edge state field representing demand (e.g. "flow")
      capacity_field   : edge property for supply (e.g. "capacity")
      equilibrium      : flow/capacity ratio at which price is stable (default 0.7)
      sensitivity      : how fast price responds (default 0.05 per hour)
      min_price        : price floor
      max_price        : price ceiling
    """

    def step(self, dt_hours: float) -> None:
        node_type    = self.params["node_type"]
        price_field  = self.params["price_field"]
        equilibrium  = self.params.get("equilibrium", 0.7)
        sensitivity  = self.params.get("sensitivity", 0.05)
        min_price    = self.params.get("min_price", 0.0)
        max_price    = self.params.get("max_price", float("inf"))

        for node_id, data in self.graph.nodes(data=True):
            if data.get("type") != node_type or not data.get("active", True):
                continue

            # Aggregate inbound flow and capacity
            total_flow = 0.0
            total_cap  = 0.0
            for u, v, k, edata in self.graph.in_edges(node_id, keys=True, data=True):
                total_flow += edata.get("flow", 0)
                total_cap  += edata.get("capacity", 1)

            if total_cap == 0:
                continue

            utilization = total_flow / total_cap
            pressure    = (utilization - equilibrium) / (1 - equilibrium + 1e-6)

            current_price = data["state"].get(price_field, 0.0)
            delta         = current_price * sensitivity * pressure * dt_hours
            new_price     = max(min_price, min(max_price, current_price + delta))
            data["state"][price_field] = new_price


# ---------------------------------------------------------------------------
# 5. DecayGrowthTemplate
#
# A field on nodes increases or decreases at a fixed rate each tick.
# Used for forest carbon sequestration, population growth, battery discharge,
# or any value that changes independently of agents or neighbors.
# ---------------------------------------------------------------------------

class DecayGrowthTemplate(BehaviorTemplate):
    """
    Params:
      node_type   : which nodes this applies to
      field       : state field to change (e.g. "carbon_ppm", "health")
      rate        : change per hour, positive = growth, negative = decay
      source_field: optional properties field that scales the rate
                    (e.g. "sequestration_tons_per_day" for forests)
      source_scale: multiply source_field by this to get rate in field units
      min_value   : floor (default 0.0)
      max_value   : ceiling (default inf)
    """

    def step(self, dt_hours: float) -> None:
        node_type    = self.params["node_type"]
        field        = self.params["field"]
        base_rate    = self.params.get("rate", 0.0)
        source_field = self.params.get("source_field")
        source_scale = self.params.get("source_scale", 1.0)
        min_value    = self.params.get("min_value", 0.0)
        max_value    = self.params.get("max_value", float("inf"))

        for node_id, data in self.graph.nodes(data=True):
            if data.get("type") != node_type or not data.get("active", True):
                continue

            rate = base_rate
            if source_field:
                rate = data["properties"].get(source_field, 0.0) * source_scale

            current = data.get("state", {}).get(field, 0.0)
            delta   = rate * dt_hours
            data["state"][field] = max(min_value, min(max_value, current + delta))


# ---------------------------------------------------------------------------
# 6. ThresholdCascadeTemplate
#
# When a node's field crosses a threshold, it sets a trigger field on its
# neighbors. Models grid failures, bank runs, disease spread, viral adoption.
# ---------------------------------------------------------------------------

class ThresholdCascadeTemplate(BehaviorTemplate):
    """
    Params:
      node_type       : nodes to monitor
      watch_field     : state field to compare against threshold
      threshold       : value that triggers the cascade
      direction       : "above" | "below" — which crossing triggers
      cascade_field   : state field to set on neighbors when triggered
      cascade_value   : value to set on cascade_field
      edge_type       : only cascade across edges of this type
      propagation     : fraction of cascaded value passed to neighbors (0–1)
    """

    def step(self, dt_hours: float) -> None:
        node_type      = self.params["node_type"]
        watch_field    = self.params["watch_field"]
        threshold      = self.params["threshold"]
        direction      = self.params.get("direction", "above")
        cascade_field  = self.params["cascade_field"]
        cascade_value  = self.params["cascade_value"]
        edge_type      = self.params.get("edge_type")
        propagation    = self.params.get("propagation", 1.0)

        triggered = []

        for node_id, data in self.graph.nodes(data=True):
            if data.get("type") != node_type or not data.get("active", True):
                continue

            value = data.get("state", {}).get(watch_field, 0.0)
            fired = (direction == "above" and value >= threshold) or \
                    (direction == "below" and value <= threshold)

            if fired:
                triggered.append(node_id)

        for node_id in triggered:
            for neighbor in self.graph.successors(node_id):
                # Check edge type filter
                if edge_type:
                    connects = any(
                        d.get("type") == edge_type
                        for d in self.graph.get_edge_data(node_id, neighbor, default={}).values()
                    )
                    if not connects:
                        continue

                neighbor_data = self.graph.nodes[neighbor]
                current = neighbor_data.get("state", {}).get(cascade_field, 0.0)
                neighbor_data["state"][cascade_field] = current + cascade_value * propagation


# ---------------------------------------------------------------------------
# Registry — maps template name strings (from scene JSON) to classes
# ---------------------------------------------------------------------------

TEMPLATE_REGISTRY: dict[str, type[BehaviorTemplate]] = {
    "capacity_constraint": CapacityConstraintTemplate,
    "flow_conservation":   FlowConservationTemplate,
    "diffusion":           DiffusionTemplate,
    "price_response":      PriceResponseTemplate,
    "decay_growth":        DecayGrowthTemplate,
    "threshold_cascade":   ThresholdCascadeTemplate,
}
