from __future__ import annotations
import math
from engine.agent import Memory


def score_recency(memory_tick: int, current_tick: int, decay: float = 0.995) -> float:
    """Exponential decay — memories from 50 ticks ago score ~0.78, from 200 ago ~0.37."""
    return decay ** (current_tick - memory_tick)


def score_relevance(memory: Memory, query_keywords: list[str]) -> float:
    """Keyword overlap between memory keywords and query context."""
    if not query_keywords or not memory.keywords:
        return 0.0
    memory_kw = set(k.lower() for k in memory.keywords)
    query_kw = set(k.lower() for k in query_keywords)
    overlap = len(memory_kw & query_kw)
    return overlap / math.sqrt(len(query_kw))


def retrieve_memories(
    memories: list[Memory],
    current_tick: int,
    query_keywords: list[str],
    top_k: int = 8,
) -> list[Memory]:
    """
    Score each memory by recency + importance + relevance, return top_k.
    All three components normalized to [0,1] then equally weighted.
    """
    if not memories:
        return []

    max_importance = 10.0

    scored = []
    for m in memories:
        r = score_recency(m.timestamp, current_tick)
        i = m.importance / max_importance
        v = score_relevance(m, query_keywords)
        score = (r + i + v) / 3.0
        scored.append((score, m))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [m for _, m in scored[:top_k]]


def should_reflect(memories: list[Memory], last_reflection_tick: int, current_tick: int) -> bool:
    """Trigger reflection when cumulative importance of new memories exceeds threshold."""
    threshold = 24.0
    new_memories = [m for m in memories if m.timestamp > last_reflection_tick]
    return sum(m.importance for m in new_memories) >= threshold


def build_memory_context(memories: list[Memory]) -> str:
    """Format retrieved memories as a compact string for the LLM prompt."""
    if not memories:
        return "No relevant memories."
    lines = []
    for m in memories:
        lines.append(f"- [tick {m.timestamp}, importance {m.importance:.1f}] {m.content}")
    return "\n".join(lines)
