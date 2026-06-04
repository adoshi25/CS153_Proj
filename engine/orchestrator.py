from __future__ import annotations
import json
import re
import anthropic
from engine.agent import Agent

_client = None

def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def plan_cascade(agents: list[Agent], shock_text: str, neighborhood: str = "City Center") -> dict:
    """
    Score all agents by occupational relevance to the shock, pick the top 3-4 as
    Tier 1, and generate:
      - A personalized impact brief for each Tier 1 agent (second-person, job-specific)
      - A 'rumor' version that spreads through their social network (word-of-mouth distortion)
      - A 'news' version that everyone else eventually hears (accurate but impersonal)

    One Sonnet call — runs once per shock at cascade initialization.
    """
    agent_summaries = "\n".join(
        f'- id: "{a.id}" | {a.name}, {a.age}, {a.occupation}: {a.bio[:100]}'
        for a in agents
    )

    prompt = f"""A major event is unfolding in {neighborhood}: {shock_text}

Here are {len(agents)} community members. Score each by DIRECT occupational and daily-life relevance to this event (10 = immediately and severely impacted, 1 = barely affected).

{agent_summaries}

Select the 3-4 HIGHEST scorers as Tier 1 — these are people whose job or daily routine puts them immediately in the path of this event. Then write:
- A personalized 2-3 sentence impact brief for each Tier 1 agent (second person, specific to their job/routine, concrete details about how this affects them today)
- A "rumor" version of the event (1-2 sentences) that spreads word-of-mouth through their social network — realistic distortion, like what gets exaggerated or misremembered when passed between neighbors
- A "news" version (1 sentence) that everyone else hears via local news or social media — accurate but generic

Respond with ONLY valid JSON:
{{
  "tier1": [
    {{"id": "<agent_id>", "brief": "<personalized 2-3 sentence impact brief in second person>"}},
    {{"id": "<agent_id>", "brief": "<personalized 2-3 sentence impact brief in second person>"}},
    {{"id": "<agent_id>", "brief": "<personalized 2-3 sentence impact brief in second person>"}}
  ],
  "tier2_rumor": "<1-2 sentence word-of-mouth rumor with realistic distortion>",
  "tier3_news": "<1 sentence factual news version>"
}}"""

    resp = get_client().messages.create(
        model="claude-sonnet-4-6",
        max_tokens=700,
        system="You are a sociologist modeling how information cascades through a community. Return only valid JSON.",
        messages=[{"role": "user", "content": prompt}],
    )

    raw = resp.content[0].text.strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        result = json.loads(match.group()) if match else {}

    return {
        "tier1": result.get("tier1", []),
        "tier2_rumor": result.get("tier2_rumor", shock_text),
        "tier3_news": result.get("tier3_news", shock_text),
    }


def _detect_coalitions(
    agent_states: list[dict],
    coalition_registry: dict,  # frozenset[str] → formed_at_tick; mutated in-place
    tick: int,
) -> list[dict]:
    """
    Cluster agents by shared sentiment direction + keyword overlap.
    No LLM — falls out purely from the data each tick produces.

    Steps:
      1. Bucket agents: positive (>0.3), negative (<-0.3), neutral
      2. Per bucket: keyword frequency map across all members
      3. Keywords in 3+ agents = coalition keyword
      4. Agents with 2+ coalition keywords in their own set = coalition member
      5. Require 3+ members to surface the coalition
      6. Name from top coalition keyword; track first appearance via registry
    """
    buckets = {
        "positive": [s for s in agent_states if s["sentiment"] > 0.3],
        "negative": [s for s in agent_states if s["sentiment"] < -0.3],
        "neutral":  [s for s in agent_states if -0.3 <= s["sentiment"] <= 0.3],
    }

    coalitions = []

    for direction, group in buckets.items():
        if len(group) < 3:
            continue

        # Build per-agent keyword sets and overall frequency map
        agent_kws: dict[str, list[str]] = {s["id"]: s.get("keywords", []) for s in group}
        kw_freq: dict[str, int] = {}
        for kws in agent_kws.values():
            for kw in kws:
                kw_freq[kw] = kw_freq.get(kw, 0) + 1

        # Coalition keywords: appear in 3+ agents in this bucket
        coalition_kws = {kw for kw, cnt in kw_freq.items() if cnt >= 3}
        if not coalition_kws:
            continue

        # Members: agents whose keywords overlap with 2+ coalition keywords
        members = [
            s for s in group
            if len(set(agent_kws[s["id"]]) & coalition_kws) >= 2
        ]
        if len(members) < 3:
            continue

        # Shared concerns: coalition keywords ranked by frequency among members
        concern_freq: dict[str, int] = {}
        for s in members:
            for kw in set(agent_kws[s["id"]]) & coalition_kws:
                concern_freq[kw] = concern_freq.get(kw, 0) + 1
        shared_concerns = sorted(concern_freq, key=lambda k: -concern_freq[k])[:4]

        # Name from the single most frequent coalition keyword
        top_kw = max(concern_freq, key=lambda k: concern_freq[k])
        name = f"The {top_kw.title()} Coalition"

        # Registry: persist formed_at_tick across ticks
        member_ids = frozenset(s["id"] for s in members)
        formed_at = coalition_registry.setdefault(member_ids, tick)

        coalitions.append({
            "name": name,
            "size": len(members),
            "sentiment_direction": direction,
            "shared_concerns": shared_concerns,
            "member_names": [s["name"] for s in members],
            "formed_at_tick": formed_at,
        })

    return coalitions


def _population_stdev(values: list[float]) -> float:
    """Population standard deviation — no stdlib import needed."""
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return (sum((x - mean) ** 2 for x in values) / len(values)) ** 0.5


def orchestrate(
    agent_states: list[dict],
    tick: int,
    coalition_registry: dict,
    neighborhood: str = "City Center",
) -> dict:
    # ── Coalition detection (pure Python, no LLM) ────────────────────────
    coalitions = _detect_coalitions(agent_states, coalition_registry, tick)

    # ── Belief fragmentation score (pure Python, no LLM) ─────────────────
    # Population stdev of sentiment across informed agents.
    # Two communities can share the same average sentiment but differ entirely
    # in whether they agree on WHY — this score captures that divergence.
    informed = [s for s in agent_states if s.get("cascade_tier") is not None]
    fragmentation_score = round(
        _population_stdev([s["sentiment"] for s in informed]), 3
    ) if informed else 0.0

    # ── Agent summary lines ───────────────────────────────────────────────
    lines = []
    for s in agent_states:
        tier_label = f"[tier {s['cascade_tier']}]" if s.get("cascade_tier") else "[uninformed]"
        belief_text = ""
        if s.get("belief_about_event"):
            belief_text = (
                f' | Believes: "{s["belief_about_event"]}"'
                f' ({s.get("belief_certainty", 0):.0%} certain, via {s.get("belief_source", "?")})'
            )
        lines.append(
            f"- {s['name']} {tier_label} (sentiment {s['sentiment']:+.2f}):"
            f" {s['thought']}{belief_text}"
        )
    agents_text = "\n".join(lines)

    # Only ask for belief_clusters when agents have produced beliefs
    has_beliefs = any(s.get("belief_about_event") for s in agent_states)
    belief_cluster_schema = (
        '  "belief_clusters": [\n'
        '    {"label": "<1 sentence describing this belief narrative>", "agent_count": <int>, "avg_certainty": <float 0-1>},\n'
        '    {"label": "<1 sentence describing this belief narrative>", "agent_count": <int>, "avg_certainty": <float 0-1>}\n'
        '  ],\n'
    ) if has_beliefs else ""

    prompt = f"""Tick {tick}. Community snapshot — {len(agent_states)} members in {neighborhood}.
Belief fragmentation score: {fragmentation_score:.3f} (0.0 = unified narrative, ~0.7 = maximally split)

{agents_text}

Analyze this snapshot and respond with only valid JSON:
{{
  "summary": "<2-3 sentence description of the community's collective state and belief landscape>",
  "top_concerns": ["<concern 1>", "<concern 2>", "<concern 3>"],
  "consensus_sentiment": <float from -1.0 to 1.0>,
{belief_cluster_schema}  "policy_recommendations": [
    {{"intervention": "<concrete policy action>", "likely_effect": "<effect on sentiment and belief convergence>"}},
    {{"intervention": "<concrete policy action>", "likely_effect": "<effect on sentiment and belief convergence>"}}
  ]
}}

Focus on: whether the community is converging on a shared understanding or splitting into incompatible narratives, what the distinct belief clusters are, and which interventions could reduce fragmentation."""

    resp = get_client().messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        system="You are a sociologist observing a neighborhood in real time. Synthesize agent states into a community-level analysis. Return only valid JSON.",
        messages=[{"role": "user", "content": prompt}],
    )

    raw = resp.content[0].text.strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        result = json.loads(match.group()) if match else {
            "summary": raw,
            "top_concerns": [],
            "consensus_sentiment": 0.0,
        }

    return {
        "summary": result.get("summary", ""),
        "top_concerns": result.get("top_concerns", []),
        "consensus_sentiment": float(result.get("consensus_sentiment", 0.0)),
        "belief_fragmentation_score": fragmentation_score,
        "belief_clusters": result.get("belief_clusters", []),
        "coalitions": coalitions,
        "policy_recommendations": result.get("policy_recommendations", []),
    }
