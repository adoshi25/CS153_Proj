from __future__ import annotations
from dataclasses import dataclass, field
from engine.agent import Agent, Memory


@dataclass
class CascadeState:
    """Tracks the information cascade lifecycle for a single shock event."""
    shock_text: str
    keywords: list[str]
    start_tick: int
    tier1_ids: list[str]            # directly affected agents seeded at tick 0
    tier1_briefs: dict[str, str]    # agent_id → personalized impact brief
    tier2_rumor: str                # slightly distorted version for social graph spread
    tier3_news: str                 # generic news version for everyone else
    tier2_seeded: bool = False
    tier3_seeded: bool = False


def seed_tier1(agents: list[Agent], cascade: CascadeState, tick: int) -> None:
    """Inject personalized impact briefs into the 3-4 directly affected agents."""
    agent_map = {a.id: a for a in agents}
    for aid in cascade.tier1_ids:
        agent = agent_map.get(aid)
        if agent and agent.knowledge_tick is None:
            brief = cascade.tier1_briefs.get(aid, cascade.shock_text)
            agent.knowledge_tick = tick
            agent.cascade_tier = 1
            agent.impact_brief = brief
            agent.memory_stream.append(Memory(
                content=brief,
                timestamp=tick,
                importance=9.5,
                keywords=cascade.keywords,
            ))


def seed_tier2(agents: list[Agent], cascade: CascadeState, tick: int) -> None:
    """
    Propagate the distorted rumor to social-graph neighbors of Tier 1 agents.
    Called at cascade start_tick + 1. Skips agents who already know.
    """
    if cascade.tier2_seeded:
        return
    tier1_set = set(cascade.tier1_ids)
    agent_map = {a.id: a for a in agents}

    to_inform: set[str] = set()
    for agent in agents:
        if agent.cascade_tier == 1:
            for rel_id in agent.relationships:
                if rel_id not in tier1_set:
                    rel_agent = agent_map.get(rel_id)
                    if rel_agent and rel_agent.knowledge_tick is None:
                        to_inform.add(rel_id)

    for aid in to_inform:
        agent = agent_map.get(aid)
        if agent:
            agent.knowledge_tick = tick
            agent.cascade_tier = 2
            agent.impact_brief = cascade.tier2_rumor
            agent.memory_stream.append(Memory(
                content=cascade.tier2_rumor,
                timestamp=tick,
                importance=7.5,
                keywords=cascade.keywords,
            ))

    cascade.tier2_seeded = True


def seed_tier3(agents: list[Agent], cascade: CascadeState, tick: int) -> None:
    """
    Broadcast generic news to all agents who still haven't heard.
    Called at cascade start_tick + 3 or later.
    """
    if cascade.tier3_seeded:
        return
    for agent in agents:
        if agent.knowledge_tick is None:
            agent.knowledge_tick = tick
            agent.cascade_tier = 3
            agent.impact_brief = cascade.tier3_news
            agent.memory_stream.append(Memory(
                content=cascade.tier3_news,
                timestamp=tick,
                importance=5.0,
                keywords=cascade.keywords,
            ))
    cascade.tier3_seeded = True


def _extract_keywords(text: str) -> list[str]:
    stopwords = {
        "a", "an", "the", "is", "are", "was", "were", "be", "been",
        "has", "have", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "shall", "can", "to", "of",
        "in", "on", "at", "by", "for", "with", "about", "from", "into",
        "and", "or", "but", "if", "that", "this", "it", "its", "their",
        "there", "been", "being", "new", "all", "more", "also", "than",
    }
    words = text.lower().replace(",", "").replace(".", "").split()
    return list(dict.fromkeys(w for w in words if w not in stopwords))[:8]
