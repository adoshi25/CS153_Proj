from __future__ import annotations
import json
import logging
import math
import random
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import anthropic
from engine.agent import Agent

log = logging.getLogger(__name__)
_HAIKU = "claude-haiku-4-5-20251001"

# Occupation → keywords that make shocks relevant to that occupation
_OCC_KEYWORDS: dict[str, list[str]] = {
    "teacher":     ["school", "education", "student", "children", "classroom", "learning"],
    "nurse":       ["hospital", "health", "medical", "clinic", "care", "patient"],
    "doctor":      ["hospital", "health", "medical", "clinic", "care"],
    "worker":      ["job", "employment", "labor", "wage", "work", "layoff", "factory"],
    "business":    ["store", "shop", "revenue", "commercial", "economic", "tax"],
    "homeowner":   ["property", "tax", "housing", "rent", "zoning", "development"],
    "renter":      ["rent", "housing", "landlord", "tenant", "eviction", "apartment"],
    "transit":     ["bus", "subway", "train", "commute", "transport", "route"],
    "construction":["building", "development", "construction", "permit", "demolish"],
    "retail":      ["store", "shop", "business", "commercial", "customer"],
    "restaurant":  ["food", "dining", "restaurant", "hospitality", "permit"],
    "student":     ["school", "education", "tuition", "campus", "university"],
    "engineer":    ["infrastructure", "bridge", "road", "construction", "utility"],
    "artist":      ["space", "studio", "community", "culture", "gallery", "rent"],
    "social":      ["community", "welfare", "service", "resident", "housing"],
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def _geo_score(agent: Agent, shock_pois: list[dict]) -> float:
    if not shock_pois:
        return 0.3
    lat, lon = agent.home["lat"], agent.home["lon"]
    best = min(_haversine_km(lat, lon, p["lat"], p["lon"]) for p in shock_pois)
    if best < 0.15: return 1.0
    if best < 0.35: return 0.75
    if best < 0.70: return 0.50
    if best < 1.50: return 0.30
    return 0.10


def _bio_score(agent: Agent, shock_text: str) -> float:
    text = shock_text.lower()
    occ = agent.occupation.lower()
    bio = agent.bio.lower()

    # Direct occupation match
    for key, keywords in _OCC_KEYWORDS.items():
        if key in occ and any(kw in text for kw in keywords):
            return 0.9

    # Fallback: generic word overlap between shock and bio
    stopwords = {"the", "a", "an", "is", "are", "will", "to", "of", "and", "in",
                 "for", "on", "that", "this", "with", "from", "at", "be"}
    shock_words = set(re.findall(r'\b\w+\b', text)) - stopwords
    bio_words = set(re.findall(r'\b\w+\b', occ + " " + bio))
    overlap = len(shock_words & bio_words)
    if overlap >= 3: return 0.7
    if overlap >= 1: return 0.45
    return 0.2


def relevance_score(agent: Agent, shock_text: str, shock_pois: list[dict]) -> float:
    geo = _geo_score(agent, shock_pois)
    bio = _bio_score(agent, shock_text)
    return round(0.55 * geo + 0.45 * bio, 3)


def _plan_movement(agent: Agent, shock_text: str, pois: list[dict]) -> dict:
    """
    Ask the agent where they'll go in response to the shock.
    Returns destination info dict, or {} if they stay home.
    """
    client = anthropic.Anthropic()
    lat, lon = agent.home["lat"], agent.home["lon"]
    nearby = sorted(pois, key=lambda p: _haversine_km(lat, lon, p["lat"], p["lon"]))[:12]
    poi_list = "\n".join(f"- {p['name']} ({p['type']})" for p in nearby)

    prompt = (
        f"You are {agent.name}, {agent.age} years old, {agent.occupation}.\n"
        f"Background: {agent.bio}\n\n"
        f"A major event just happened: {shock_text}\n\n"
        f"Given your reaction, will you leave home to do something about it? "
        f"Only move if you would genuinely take action — not everyone does.\n\n"
        f"Nearby places:\n{poi_list}\n\n"
        f'Respond ONLY with valid JSON:\n'
        f'{{"will_move": true|false, '
        f'"destination": "<exact name from list, or null>", '
        f'"intent": "<1 sentence: what you plan to do there>", '
        f'"days_to_travel": <1|2|3|4>}}'
    )

    try:
        resp = client.messages.create(
            model=_HAIKU, max_tokens=150,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.content[0].text.strip()
        data: dict = json.loads(text)
    except Exception:
        try:
            import re as _re
            m = _re.search(r'\{.*\}', text if 'text' in dir() else '{}', _re.DOTALL)
            data = json.loads(m.group()) if m else {"will_move": False}
        except Exception as exc:
            log.error("_plan_movement parse failed for %s: %s", agent.name, exc)
            return {}

    if not data.get("will_move") or not data.get("destination"):
        return {}

    dest_name: str = data["destination"]
    matched = next(
        (p for p in nearby
         if p["name"].lower() in dest_name.lower()
         or dest_name.lower() in p["name"].lower()),
        None,
    )
    if not matched:
        return {}

    return {
        "destination_lat": matched["lat"],
        "destination_lon": matched["lon"],
        "destination_name": matched["name"],
        "movement_intent": data.get("intent", ""),
        "total_journey_days": max(1, min(4, int(data.get("days_to_travel", 2)))),
    }


def activate_agents(
    agents: list[Agent],
    shock_text: str,
    pois: list[dict],
    shock_pois: list[dict],
    max_tier1: int = 14,
    max_tier2: int = 8,
    max_days: int = 7,
) -> None:
    """
    Score all agents, activate the most relevant ones, plan movement for Tier 1.
    Updates agents in place. Tier 2 agents are activated but stay home (no destination).
    """
    scores = [(a, relevance_score(a, shock_text, shock_pois)) for a in agents]
    scores.sort(key=lambda x: -x[1])

    score_map = {a.id: s for a, s in scores}

    tier1 = [a for a, s in scores[:max_tier1] if s >= 0.40]
    tier1_ids = {a.id for a in tier1}

    # Tier 2: first-degree connections of Tier 1 not already in Tier 1
    tier2: list[Agent] = []
    seen_t2: set[str] = set()
    for agent in tier1:
        for rel_id in agent.relationships:
            if rel_id not in tier1_ids and rel_id not in seen_t2:
                rel = next((a for a in agents if a.id == rel_id), None)
                if rel and len(tier2) < max_tier2:
                    tier2.append(rel)
                    seen_t2.add(rel_id)

    # Stagger departure days so agents don't all move on day 1 and finish together.
    # Top third of Tier 1 (highest relevance) leave on day 1.
    # Middle third leave on day 2. Bottom third on day 2 or 3.
    # Spread is capped so the arc still fits within max_days.
    n_tier1 = len(tier1)
    max_spread = max(1, min(3, max_days // 3))

    def _start_day_for_rank(rank: int) -> int:
        if n_tier1 == 0:
            return 1
        bucket = (rank * 3) // max(1, n_tier1)   # 0 = top, 1 = mid, 2 = bottom
        return min(1 + bucket, max_spread)

    tier1_start_days = {a.id: _start_day_for_rank(i) for i, a in enumerate(tier1)}

    # Plan movement for Tier 1 in parallel
    def _plan(agent: Agent) -> None:
        try:
            plan = _plan_movement(agent, shock_text, pois)
            agent.activated = True
            agent.activation_score = score_map.get(agent.id, 0.0)
            agent.current_lat = agent.home["lat"]
            agent.current_lon = agent.home["lon"]
            agent.journey_start_day = tier1_start_days.get(agent.id, 1)
            agent.journey_day = 0
            agent.journey_complete = False
            agent.conversations_log = []  # fresh for this shock cycle
            if plan:
                agent.destination_lat = plan["destination_lat"]
                agent.destination_lon = plan["destination_lon"]
                agent.destination_name = plan["destination_name"]
                agent.movement_intent = plan["movement_intent"]
                agent.total_journey_days = plan["total_journey_days"]
        except Exception as exc:
            log.error("activation planning failed for %s: %s", agent.name, exc)
            agent.activated = True
            agent.activation_score = score_map.get(agent.id, 0.0)
            agent.current_lat = agent.home["lat"]
            agent.current_lon = agent.home["lon"]

    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(_plan, tier1))

    # Mark Tier 2 as activated (reactive, no movement)
    for agent in tier2:
        agent.activated = True
        agent.activation_score = score_map.get(agent.id, 0.3)
        agent.current_lat = agent.home["lat"]
        agent.current_lon = agent.home["lon"]
        agent.conversations_log = []
