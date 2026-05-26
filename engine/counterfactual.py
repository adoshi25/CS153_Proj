from __future__ import annotations
import copy
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from engine.agent import Agent
from engine.decision import agent_tick
from engine.query import _occupation_group
from engine.shock import _extract_keywords

log = logging.getLogger(__name__)

_HAIKU = "claude-haiku-4-5-20251001"


def run_fork(
    agents_snapshot: list[dict],
    shock_text: str,
    n_ticks: int,
) -> list[dict]:
    """
    Run n_ticks simplified decision ticks on a deep copy of agent_snapshot dicts.

    Simplified means: Haiku only, no conversations, no reflections, no orchestrator.
    All agents are treated as immediately informed (no tiered cascade) — this fork is
    about measuring *policy impact*, not information spread.

    Returns a list of {"tick": t, "groups": {"Healthcare": 0.4, ...}} dicts.
    """
    # Reconstruct Agent objects from the deep-copied snapshot dicts
    agents = [Agent.from_dict(copy.deepcopy(d)) for d in agents_snapshot]
    agent_map = {a.id: a for a in agents}
    keywords = _extract_keywords(shock_text)

    # All agents start with the shock already known (simplified — no cascade latency)
    for agent in agents:
        if agent.knowledge_tick is None:
            agent.impact_brief = shock_text
            agent.knowledge_tick = 0
            agent.cascade_tier = 3

    trajectory: list[dict] = []

    with ThreadPoolExecutor(max_workers=10) as pool:
        for tick in range(n_ticks):
            # Neighbor map uses the previous tick's last_action (empty on tick 0)
            neighbor_map = {
                a.id: [
                    {"name": agent_map[r].name, "last_action": agent_map[r].last_action}
                    for r in a.relationships
                    if r in agent_map and agent_map[r].last_action
                ]
                for a in agents
            }

            world_event = agent.impact_brief or shock_text

            futures = {
                pool.submit(
                    agent_tick,
                    agent,
                    tick,
                    agent.impact_brief or shock_text,
                    neighbor_map[agent.id],
                    keywords,
                    None,  # no public_actions feed in fork
                    _HAIKU,
                ): agent
                for agent in agents
            }
            for fut in as_completed(futures):
                try:
                    fut.result()
                except Exception as exc:
                    ag = futures[fut]
                    log.warning("fork tick %d failed for %s: %s", tick, ag.name, exc)

            # Aggregate sentiment by occupation group for this tick
            groups: dict[str, list[float]] = {}
            for agent in agents:
                grp = _occupation_group(agent.occupation)
                groups.setdefault(grp, []).append(agent.sentiment)

            trajectory.append({
                "tick": tick,
                "groups": {g: round(sum(v) / len(v), 3) for g, v in groups.items()},
            })

    return trajectory


def run_counterfactual(
    live_agents: list[Agent],
    current_shock: str,
    policy_text: str,
    n_ticks: int = 5,
) -> dict:
    """
    Fork the current agent state twice:
      - baseline:     run n_ticks with just current_shock
      - with_policy:  run n_ticks with current_shock + " | " + policy_text

    Returns chart-ready payload:
      {
        "baseline":      [{"tick": t, "groups": {...}}, ...],
        "with_policy":   [{"tick": t, "groups": {...}}, ...],
        "delta_by_group": {"Healthcare": +0.18, "Trades": -0.05, ...},
        "n_ticks": n_ticks,
        "policy": policy_text,
      }
    """
    # Serialize live agents to plain dicts — isolates the fork from the live sim
    snapshot = [copy.deepcopy(a.to_dict()) for a in live_agents]

    log.info(
        "Counterfactual: %d agents × %d ticks | policy: %s",
        len(snapshot), n_ticks, policy_text[:80],
    )

    baseline = run_fork(snapshot, current_shock, n_ticks)
    with_policy = run_fork(snapshot, f"{current_shock} | {policy_text}", n_ticks)

    # Delta = final-tick with_policy sentiment minus final-tick baseline sentiment, per group
    all_groups: set[str] = set()
    for point in baseline + with_policy:
        all_groups.update(point["groups"].keys())

    delta_by_group: dict[str, float] = {}
    if baseline and with_policy:
        final_b = baseline[-1]["groups"]
        final_p = with_policy[-1]["groups"]
        for g in all_groups:
            delta_by_group[g] = round(final_p.get(g, 0.0) - final_b.get(g, 0.0), 3)

    return {
        "baseline": baseline,
        "with_policy": with_policy,
        "delta_by_group": delta_by_group,
        "n_ticks": n_ticks,
        "policy": policy_text,
    }
