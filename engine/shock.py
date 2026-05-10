from __future__ import annotations
from engine.agent import Agent, Memory


def inject_shock(agents: list[Agent], shock_text: str, tick: int = 0) -> None:
    """
    Inject a shock event into every agent's memory stream simultaneously.
    High importance so it surfaces in every agent's retrieval from tick 1 onward.
    The shock_text is whatever the user typed — no scenario assumptions.
    """
    keywords = _extract_keywords(shock_text)
    memory = Memory(
        content=shock_text,
        timestamp=tick,
        importance=9.5,
        keywords=keywords,
    )
    for agent in agents:
        agent.memory_stream.append(memory)


def _extract_keywords(text: str) -> list[str]:
    """
    Simple keyword extraction without an LLM call — just strip stopwords.
    Good enough for seeding retrieval; reflection will re-score later.
    """
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
