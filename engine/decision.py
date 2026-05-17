from __future__ import annotations
import json
import random
import anthropic
from engine.agent import Agent, Memory
from engine.memory import retrieve_memories, build_memory_context
from engine.pois import POI_NAMES

_client = None

def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


# Static per-agent content — eligible for prompt caching
def _build_static_block(agent: Agent) -> str:
    return f"""You are {agent.name}, {agent.age} years old, living in Boerum Hill, Brooklyn.
Occupation: {agent.occupation}
About you: {agent.bio}

IMPORTANT: You must respond ONLY as {agent.name} would — not as a generic concerned resident. Your age, occupation, history, and relationships are not flavor text; they are hard constraints on every word you say. A {agent.age}-year-old {agent.occupation} thinks, speaks, and acts differently from everyone else in this neighborhood. Show that difference."""


# Dynamic per-tick content — changes every step
def _build_dynamic_block(
    agent: Agent,
    current_tick: int,
    world_event: str,
    neighbor_actions: list[dict],
    query_keywords: list[str],
    public_actions: list[dict] | None = None,
) -> str:
    memories = retrieve_memories(
        agent.memory_stream,
        current_tick=current_tick,
        query_keywords=query_keywords,
        top_k=8,
    )
    memory_text = build_memory_context(memories)

    neighbor_text = "None yet." if not neighbor_actions else "\n".join(
        f"- {a['name']}: {a['last_action']}" for a in neighbor_actions
    )

    shuffled_pois = random.sample(POI_NAMES, len(POI_NAMES))
    location_options = "home, work, " + ", ".join(shuffled_pois)

    public_text = ""
    if public_actions:
        lines = "\n".join(f"- {a['name']}: {a['action']}" for a in public_actions[:3])
        public_text = f"\nPublic actions happening in the neighborhood right now:\n{lines}\n"

    return f"""
SITUATION JUST HAPPENED:
{world_event}
{public_text}
What people you know are saying/doing right now:
{neighbor_text}

Your relevant memories:
{memory_text}

Respond as {agent.name} specifically. Ask yourself: how does this situation affect MY livelihood, MY daily life, MY relationships, MY history in this neighborhood? Your response must reflect your particular stake — not a generic resident's reaction.

Avoid phrases any neighbor could say. Ground your thought in a specific detail only YOU would notice given your occupation and history.

Respond with only valid JSON:
{{
  "thought": "<your internal reaction in first person, 1-3 sentences — must be specific to who YOU are>",
  "action": "<what you concretely do or say right now, 1-2 sentences>",
  "sentiment": <float from -1.0 (strongly negative/oppose) to 1.0 (strongly positive/support)>,
  "move_to": "<one of: {location_options}>",
  "is_public": <true if your action is visible to everyone (attending a meeting, posting a sign, calling media, organizing publicly) — false if private>,
  "keywords": ["keyword1", "keyword2", "keyword3"]
}}"""


def agent_tick(
    agent: Agent,
    current_tick: int,
    world_event: str,
    neighbor_actions: list[dict],
    query_keywords: list[str],
    public_actions: list[dict] | None = None,
) -> dict:
    """
    Run one decision tick for a single agent.
    Returns the structured output dict and updates agent state in place.
    """
    static_block = _build_static_block(agent)
    dynamic_block = _build_dynamic_block(
        agent, current_tick, world_event, neighbor_actions, query_keywords, public_actions
    )

    response = get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=[
            {
                "type": "text",
                "text": static_block,
                "cache_control": {"type": "ephemeral"},  # cache bio across ticks
            }
        ],
        messages=[{"role": "user", "content": dynamic_block}],
    )

    raw = response.content[0].text.strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        result = json.loads(match.group()) if match else {
            "thought": raw,
            "action": "",
            "sentiment": 0.0,
            "keywords": [],
        }

    agent.current_thought = result.get("thought", "")
    agent.last_action = result.get("action", "")
    agent.sentiment = float(result.get("sentiment", 0.0))
    agent.move_to = result.get("move_to", "home")
    agent.is_public_action = bool(result.get("is_public", False))

    memory_content = f"{agent.last_action}" if agent.last_action else agent.current_thought
    agent.memory_stream.append(Memory(
        content=memory_content,
        timestamp=current_tick,
        importance=5.0,
        keywords=result.get("keywords", []),
    ))

    return result
