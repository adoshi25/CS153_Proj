from __future__ import annotations
import json
import anthropic
from engine.agent import Agent

_client = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def converse(agent_a: Agent, agent_b: Agent, location: str, world_event: str, tick: int) -> dict:
    """
    Run a short dialogue between two agents who are at the same location.
    Returns {"agent_a_heard": str, "agent_b_heard": str, "summary": str}
    Uses one LLM call with both agents' context.
    """
    prompt = f"""These two people just ran into each other at {location}. Given the current situation ({world_event}), write a 2-3 line exchange between them in character. They have different backgrounds and may agree or disagree.

Person A — {agent_a.name}, {agent_a.age} years old, {agent_a.occupation}
Background: {agent_a.bio}
Currently thinking: {agent_a.current_thought}

Person B — {agent_b.name}, {agent_b.age} years old, {agent_b.occupation}
Background: {agent_b.bio}
Currently thinking: {agent_b.current_thought}

Respond with only valid JSON:
{{
  "agent_a_heard": "<what {agent_a.name} took away from this conversation, 1 sentence in first person as {agent_a.name}>",
  "agent_b_heard": "<what {agent_b.name} took away from this conversation, 1 sentence in first person as {agent_b.name}>",
  "summary": "<1 sentence neutral description of what happened between them, e.g. 'Maria and Harold argued about traffic impacts'>"
}}"""

    resp = get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=250,
        system="You are a novelist writing brief realistic dialogue exchanges between neighborhood residents. Return only valid JSON.",
        messages=[{"role": "user", "content": prompt}],
    )

    raw = resp.content[0].text.strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        result = json.loads(match.group()) if match else {
            "agent_a_heard": "",
            "agent_b_heard": "",
            "summary": f"{agent_a.name} and {agent_b.name} crossed paths at {location}.",
        }

    return {
        "agent_a_heard": result.get("agent_a_heard", ""),
        "agent_b_heard": result.get("agent_b_heard", ""),
        "summary": result.get("summary", f"{agent_a.name} and {agent_b.name} crossed paths at {location}."),
    }
