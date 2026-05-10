from __future__ import annotations
import json
import anthropic
from engine.agent import Agent, Memory

_client = None

def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


IMPORTANCE_SYSTEM = "You are scoring the importance of a memory for a person. Return only a JSON object."

def score_importance(content: str, agent: Agent) -> tuple[float, list[str]]:
    """
    Ask the LLM to score importance (1-10) and extract keywords.
    Returns (importance_score, keywords).
    Uses a cheap, short call — no caching needed here.
    """
    prompt = f"""Rate how important this memory is for {agent.name} ({agent.occupation}) on a scale of 1-10.
Also extract 3-5 keywords that capture the core topics.

Memory: "{content}"

Respond with only valid JSON:
{{"importance": <float 1-10>, "keywords": ["keyword1", "keyword2", ...]}}"""

    resp = get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        system=IMPORTANCE_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        data = json.loads(resp.content[0].text.strip())
        return float(data["importance"]), data["keywords"]
    except Exception:
        return 5.0, ["event", "neighborhood"]


REFLECTION_SYSTEM = "You are synthesizing memories into a high-level insight. Return only a JSON object."

def reflect(agent: Agent, current_tick: int) -> Memory | None:
    """
    Synthesize recent high-importance memories into one higher-order belief.
    Returns a new Memory to add to the stream, or None if nothing to reflect on.
    """
    recent = sorted(agent.memory_stream, key=lambda m: m.importance, reverse=True)[:10]
    if not recent:
        return None

    memory_text = "\n".join(f"- {m.content}" for m in recent)

    prompt = f"""You are {agent.name}, {agent.age} years old, {agent.occupation}.
{agent.bio}

Based on these recent memories and observations:
{memory_text}

What is one high-level insight or belief you have formed? This should be a genuine synthesis, not just a summary.
Write it in first person as {agent.name} would think it.

Respond with only valid JSON:
{{"insight": "<insight in first person>", "keywords": ["keyword1", "keyword2", ...]}}"""

    resp = get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=150,
        system=REFLECTION_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        data = json.loads(resp.content[0].text.strip())
        importance, _ = score_importance(data["insight"], agent)
        return Memory(
            content=f"[Reflection] {data['insight']}",
            timestamp=current_tick,
            importance=min(importance + 1.0, 10.0),  # reflections weighted slightly higher
            keywords=data["keywords"],
        )
    except Exception:
        return None
