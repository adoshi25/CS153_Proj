from __future__ import annotations
import json
import re
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Semaphore

import anthropic
from engine.agent import Agent
from engine.pois import NEIGHBORHOOD_DESCRIPTION  # default for static Brooklyn scenario

log = logging.getLogger(__name__)
_client = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def _occupation_group(occupation: str) -> str:
    occ = occupation.lower()
    if any(w in occ for w in ['retired', 'pensioner']): return 'Retirees'
    if any(w in occ for w in ['council', 'government', 'official', 'planner', 'civil', 'mayor', 'aide', 'transportation']): return 'Government & Policy'
    if any(w in occ for w in ['teacher', 'principal', 'counselor', 'educator', 'professor', 'student', 'graduate']): return 'Education'
    if any(w in occ for w in ['nurse', 'doctor', 'pediatrician', 'pharmacist', 'physician', 'medical', 'surgeon', 'therapist']): return 'Healthcare'
    if any(w in occ for w in ['software', 'engineer', 'developer', 'tech', 'startup', 'data', 'analyst', 'banker', 'finance', 'accountant', 'architect', 'ux', 'designer', 'marketing', 'sales', 'manager']): return 'Finance & Tech'
    if any(w in occ for w in ['baker', 'barista', 'cafe', 'artisan', 'cook', 'chef', 'pastry', 'restaurant', 'pizza', 'bar', 'salon', 'hair', 'shop']): return 'Local Business'
    if any(w in occ for w in ['police', 'officer', 'detective', 'dispatcher', 'security']): return 'Public Safety'
    if any(w in occ for w in ['electrician', 'plumber', 'construction', 'contractor', 'mechanic', 'builder', 'carpenter', 'warehouse', 'delivery', 'driver', 'truck', 'logistics']): return 'Trades & Services'
    if any(w in occ for w in ['coach', 'gym', 'fitness', 'sports', 'trainer', 'yoga', 'instructor']): return 'Sports & Fitness'
    if any(w in occ for w in ['journalist', 'reporter', 'organizer', 'social worker', 'pastor', 'minister', 'priest', 'community']): return 'Community'
    if any(w in occ for w in ['museum', 'curator', 'archivist', 'farm', 'botanist', 'ranger', 'gardener']): return 'Arts & Environment'
    if any(w in occ for w in ['postal', 'mail', 'airline', 'airport', 'air traffic', 'real estate', 'accountant']): return 'Services'
    return 'Residents'


def _query_one(agent: Agent, question: str, neighborhood_description: str = NEIGHBORHOOD_DESCRIPTION) -> dict:
    system = (
        f"You are {agent.name}, {agent.age} years old. {agent.bio}\n\n"
        f"{neighborhood_description}\n\n"
        f"Respond only as this person — your opinions come from your daily life, occupation, "
        f"and what you personally care about in this community. "
        f"Reference specific streets and places by name. Never break character or ask for clarification."
    )
    user = (
        f"A city official stops you and asks: \"{question}\"\n\n"
        f"Reply with only valid JSON, no other text:\n"
        f'{{"opinion": "<your honest 1-2 sentence gut reaction>", "sentiment": <float -1.0 to 1.0>}}'
    )

    try:
        resp = _get_client().messages.create(
            model="claude-sonnet-4-6",
            max_tokens=200,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        raw = resp.content[0].text.strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            data = json.loads(match.group()) if match else {"opinion": raw, "sentiment": 0.0}

        return {
            "id": agent.id,
            "name": agent.name,
            "age": agent.age,
            "occupation": agent.occupation,
            "group": _occupation_group(agent.occupation),
            "opinion": data.get("opinion", "").strip('"'),
            "sentiment": max(-1.0, min(1.0, float(data.get("sentiment", 0.0)))),
        }
    except Exception as exc:
        log.warning("query_one failed for %s: %s", agent.name, exc)
        return {
            "id": agent.id,
            "name": agent.name,
            "age": agent.age,
            "occupation": agent.occupation,
            "group": _occupation_group(agent.occupation),
            "opinion": "",
            "sentiment": 0.0,
        }


def query_neighborhood(agents: list[Agent], question: str, neighborhood_description: str = NEIGHBORHOOD_DESCRIPTION) -> dict:
    """
    Fan out the question to all agents concurrently (max 5 at a time).
    Returns individual responses and grouped summaries.
    """
    sem = Semaphore(5)
    results = []

    def _rate_limited(agent):
        with sem:
            return _query_one(agent, question, neighborhood_description)

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_rate_limited, a): a for a in agents}
        for fut in as_completed(futures):
            try:
                results.append(fut.result())
            except Exception as exc:
                log.warning("query future failed: %s", exc)

    # Group by occupation category
    groups: dict[str, list] = {}
    for r in results:
        groups.setdefault(r["group"], []).append(r)

    grouped = []
    for group_name, members in sorted(groups.items()):
        avg_sentiment = sum(m["sentiment"] for m in members) / len(members)
        grouped.append({
            "group": group_name,
            "count": len(members),
            "avg_sentiment": round(avg_sentiment, 3),
            "members": sorted(members, key=lambda m: m["sentiment"]),
        })

    overall = sum(r["sentiment"] for r in results) / len(results) if results else 0.0

    return {
        "question": question,
        "overall_sentiment": round(overall, 3),
        "total_responses": len(results),
        "groups": grouped,
        "all_responses": results,
    }
