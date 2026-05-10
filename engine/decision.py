from __future__ import annotations
import json
import anthropic
from engine.agent import Agent, Memory
from engine.memory import retrieve_memories, build_memory_context

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
About you: {agent.bio}"""


# Dynamic per-tick content — changes every step
def _build_dynamic_block(
    agent: Agent,
    current_tick: int,
    world_event: str,
    neighbor_actions: list[dict],
    query_keywords: list[str],
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

    return f"""
Current situation:
{world_event}

What people you know are saying/doing:
{neighbor_text}

Your relevant memories:
{memory_text}

Based on who you are and what you know, respond to this situation.
Think and act as this specific person would — shaped by your history, relationships, and values.
Your reaction should feel genuine, not generic.

Respond with only valid JSON:
{{
  "thought": "<your internal reaction in first person, 1-3 sentences>",
  "action": "<what you do or say out loud, 1-2 sentences>",
  "sentiment": <float from -1.0 (strongly oppose/negative) to 1.0 (strongly support/positive)>,
  "keywords": ["keyword1", "keyword2", "keyword3"]
}}"""


def agent_tick(
    agent: Agent,
    current_tick: int,
    world_event: str,
    neighbor_actions: list[dict],
    query_keywords: list[str],
) -> dict:
    """
    Run one decision tick for a single agent.
    Returns the structured output dict and updates agent state in place.
    """
    static_block = _build_static_block(agent)
    dynamic_block = _build_dynamic_block(
        agent, current_tick, world_event, neighbor_actions, query_keywords
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
        # Fallback: extract JSON from response if wrapped in markdown
        import re
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        result = json.loads(match.group()) if match else {
            "thought": raw,
            "action": "",
            "sentiment": 0.0,
            "keywords": [],
        }

    # Update agent state in place
    agent.current_thought = result.get("thought", "")
    agent.last_action = result.get("action", "")
    agent.sentiment = float(result.get("sentiment", 0.0))

    # Store this tick's reaction as a new memory
    memory_content = f"{agent.last_action}" if agent.last_action else agent.current_thought
    agent.memory_stream.append(Memory(
        content=memory_content,
        timestamp=current_tick,
        importance=5.0,  # will be re-scored async in reflection step
        keywords=result.get("keywords", []),
    ))

    return result
