from __future__ import annotations
import json
import logging
import math
from concurrent.futures import ThreadPoolExecutor

import anthropic
from engine.agent import Agent, Memory

log = logging.getLogger(__name__)
_HAIKU = "claude-haiku-4-5-20251001"

COLLISION_RADIUS_KM = 0.07  # agents within 70m trigger a conversation
DEST_STAY_DAYS = 2           # days spent at destination before heading home


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def _step_position(agent: Agent) -> None:
    """
    Advance agent one day along their arc: home → destination → home.
    Total arc: total_journey_days (going) + DEST_STAY_DAYS + total_journey_days (return).
    """
    if not agent.activated or not agent.destination_lat or agent.journey_complete:
        return

    home_lat = agent.home["lat"]
    home_lon = agent.home["lon"]
    dest_lat = agent.destination_lat
    dest_lon = agent.destination_lon
    n = agent.total_journey_days
    d = agent.journey_day

    if d <= n:
        t = d / n if n > 0 else 1.0
        agent.current_lat = home_lat + t * (dest_lat - home_lat)
        agent.current_lon = home_lon + t * (dest_lon - home_lon)
    elif d <= n + DEST_STAY_DAYS:
        agent.current_lat = dest_lat
        agent.current_lon = dest_lon
    else:
        ret_day = d - n - DEST_STAY_DAYS
        t = ret_day / n if n > 0 else 1.0
        t = min(t, 1.0)
        agent.current_lat = dest_lat + t * (home_lat - dest_lat)
        agent.current_lon = dest_lon + t * (home_lon - dest_lon)
        if t >= 1.0:
            agent.journey_complete = True
            agent.current_lat = home_lat
            agent.current_lon = home_lon


def _find_collisions(agents: list[Agent]) -> list[tuple[Agent, Agent]]:
    """
    Find pairs of activated, moving agents within COLLISION_RADIUS_KM.
    Each pair only collides once per shock cycle.
    """
    moving = [
        a for a in agents
        if a.activated
        and not a.journey_complete
        and a.destination_lat is not None
        and a.current_lat is not None
    ]

    pairs: list[tuple[Agent, Agent]] = []
    seen: set[frozenset] = set()

    for i, a1 in enumerate(moving):
        for a2 in moving[i + 1:]:
            key = frozenset([a1.id, a2.id])
            if key in seen:
                continue
            already_talked = any(c.get("partner_id") == a2.id for c in (a1.conversations_log or []))
            if already_talked:
                continue
            dist = _haversine_km(
                a1.current_lat, a1.current_lon,  # type: ignore[arg-type]
                a2.current_lat, a2.current_lon,  # type: ignore[arg-type]
            )
            if dist <= COLLISION_RADIUS_KM:
                pairs.append((a1, a2))
                seen.add(key)

    return pairs


def _run_street_conversation(a1: Agent, a2: Agent, day: int, shock_text: str) -> None:
    """
    Two agents bump into each other. They exchange thoughts.
    Stores results in both agents' conversations_log and memory_stream.
    """
    client = anthropic.Anthropic()

    a1_context = a1.shock_rationale or a1.movement_intent or f"reacting to {shock_text[:40]}"
    a2_context = a2.shock_rationale or a2.movement_intent or f"reacting to {shock_text[:40]}"

    prompt = (
        f"Two neighbors run into each other on the street. Context: {shock_text}\n\n"
        f"{a1.name} ({a1.occupation}, {a1.age}): {a1_context}\n"
        f"{a2.name} ({a2.occupation}, {a2.age}): {a2_context}\n\n"
        f"Write a brief, raw street conversation — 3 to 4 exchanges. "
        f"They're real people, not policy analysts. They can agree, argue, or talk past each other. "
        f"End with what each one walks away thinking.\n\n"
        f"Respond ONLY with valid JSON:\n"
        f'{{"exchanges": [{{"speaker": "name", "line": "what they said"}}], '
        f'"a1_takeaway": "one sentence: what {a1.name} now thinks or feels", '
        f'"a2_takeaway": "one sentence: what {a2.name} now thinks or feels"}}'
    )

    try:
        resp = client.messages.create(
            model=_HAIKU, max_tokens=450,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip()
        data: dict = json.loads(raw)
    except Exception as exc:
        log.error("street conversation failed (%s + %s): %s", a1.name, a2.name, exc)
        return

    exchanges = data.get("exchanges", [])
    conv_text = " / ".join(f"{e.get('speaker','?')}: {e.get('line','')}" for e in exchanges[:4])

    entry1 = {
        "day": day,
        "partner_id": a2.id,
        "partner_name": a2.name,
        "partner_occupation": a2.occupation,
        "exchanges": exchanges,
        "my_takeaway": data.get("a1_takeaway", ""),
        "at_lat": a1.current_lat,
        "at_lon": a1.current_lon,
    }
    entry2 = {
        "day": day,
        "partner_id": a1.id,
        "partner_name": a1.name,
        "partner_occupation": a1.occupation,
        "exchanges": exchanges,
        "my_takeaway": data.get("a2_takeaway", ""),
        "at_lat": a2.current_lat,
        "at_lon": a2.current_lon,
    }

    a1.conversations_log = (a1.conversations_log or []) + [entry1]
    a2.conversations_log = (a2.conversations_log or []) + [entry2]

    a1.memory_stream.append(Memory(
        content=f"Day {day}: Met {a2.name} — {data.get('a1_takeaway', conv_text[:80])}",
        timestamp=day,
        importance=6.5,
        keywords=["conversation", "neighbor", a2.name.split()[0].lower()],
    ))
    a2.memory_stream.append(Memory(
        content=f"Day {day}: Met {a1.name} — {data.get('a2_takeaway', conv_text[:80])}",
        timestamp=day,
        importance=6.5,
        keywords=["conversation", "neighbor", a1.name.split()[0].lower()],
    ))


def advance_day(agents: list[Agent], day: int, shock_text: str) -> list[dict]:
    """
    Advance simulation by one day:
      1. Step every activated agent toward their destination
      2. Detect collisions → trigger street conversations
    Returns list of conversation event dicts for broadcast.
    """
    for agent in agents:
        if agent.activated and not agent.journey_complete and day >= agent.journey_start_day:
            agent.journey_day = day - agent.journey_start_day + 1
            _step_position(agent)

    pairs = _find_collisions(agents)

    def _converse(pair: tuple[Agent, Agent]) -> None:
        _run_street_conversation(pair[0], pair[1], day, shock_text)

    if pairs:
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(_converse, pairs))

    return [
        {"agent1_id": a1.id, "agent1_name": a1.name,
         "agent2_id": a2.id, "agent2_name": a2.name,
         "day": day}
        for a1, a2 in pairs
    ]


def save_experiences(agents: list[Agent], shock_text: str) -> None:
    """
    At the end of a shock cycle, write each activated agent's experience
    into their persistent experience_log so future shocks can reference it.
    """
    for agent in agents:
        if not agent.activated:
            continue
        parts: list[str] = []
        if agent.shock_rationale:
            parts.append(
                f"Re '{shock_text[:50]}': I {agent.shock_stance or 'reacted'} — "
                f"{agent.shock_rationale[:120]}"
            )
        if agent.destination_name:
            parts.append(
                f"Went to {agent.destination_name} ({agent.movement_intent or 'took action'})"
            )
        for conv in agent.conversations_log or []:
            parts.append(
                f"Spoke with {conv['partner_name']}: {conv.get('my_takeaway', '')}"
            )
        if parts:
            agent.experience_log = (agent.experience_log or []) + [" · ".join(parts)]


def reset_movement(agents: list[Agent]) -> None:
    """Reset movement state before a new shock (keeps experience_log intact)."""
    for a in agents:
        a.activated = False
        a.activation_score = 0.0
        a.destination_lat = None
        a.destination_lon = None
        a.destination_name = None
        a.movement_intent = None
        a.total_journey_days = 0
        a.journey_start_day = 1
        a.journey_day = 0
        a.journey_complete = False
        a.conversations_log = []
        a.current_lat = a.home["lat"]
        a.current_lon = a.home["lon"]
