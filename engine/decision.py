from __future__ import annotations
import json
import random
import anthropic
from engine.agent import Agent, Memory
from engine.memory import retrieve_memories, build_memory_context
from engine.pois import POI_NAMES, NEIGHBORHOOD_DESCRIPTION  # defaults for the static Brooklyn scenario

_client = None

def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


# Static per-agent content — eligible for prompt caching
def _build_static_block(agent: Agent, neighborhood_description: str = NEIGHBORHOOD_DESCRIPTION) -> str:
    return f"""You are {agent.name}, {agent.age} years old.
Occupation: {agent.occupation}
About you: {agent.bio}

{neighborhood_description}

IMPORTANT: You must respond ONLY as {agent.name} would. Your age, occupation, history, and daily routines are hard constraints on every word you say. Reference specific streets, buildings, and places from your neighborhood — never use generic or made-up location names."""


# Dynamic per-tick content — changes every step
def _build_dynamic_block(
    agent: Agent,
    current_tick: int,
    world_event: str,
    neighbor_actions: list[dict],
    query_keywords: list[str],
    public_actions: list[dict] | None = None,
    poi_names: list[str] = POI_NAMES,
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

    shuffled_pois = random.sample(poi_names, len(poi_names))
    location_options = "home, work, " + ", ".join(shuffled_pois)

    public_text = ""
    if public_actions:
        lines = "\n".join(f"- {a['name']}: {a['action']}" for a in public_actions[:3])
        public_text = f"\nPublic actions happening in the neighborhood right now:\n{lines}\n"

    if world_event.strip():
        event_block = f"Something just happened in your neighborhood: {world_event}"
        # Belief schema appended after keywords — only when the agent actually knows something
        belief_schema = (
            ',\n  "belief": {\n'
            '    "summary": "<1 sentence: what YOU believe actually happened — you may interpret, doubt, or reframe what you were told>",\n'
            '    "certainty": <float 0.0-1.0, how confident you are>,\n'
            '    "source": "<how you learned: direct | social | news | conversation>"\n'
            '  }'
        )
    else:
        event_block = "It's an ordinary day. Go about your normal life."
        belief_schema = ""

    return f"""
{event_block}
{public_text}
What people you know are doing right now:
{neighbor_text}

Your relevant memories:
{memory_text}

How does this affect YOUR daily life specifically — your job, your routines, the people you know? React as {agent.name}, not as a generic resident.

Respond with only valid JSON:
{{
  "thought": "<your internal reaction in first person, 1-3 sentences>",
  "action": "<what you concretely do or say right now, 1-2 sentences>",
  "sentiment": <float from -1.0 to 1.0>,
  "move_to": "<one of: {location_options}>",
  "is_public": <true if your action is visible to everyone, false if private>,
  "keywords": ["keyword1", "keyword2", "keyword3"]{belief_schema}
}}"""


def agent_tick(
    agent: Agent,
    current_tick: int,
    world_event: str,
    neighbor_actions: list[dict],
    query_keywords: list[str],
    public_actions: list[dict] | None = None,
    model: str = "claude-sonnet-4-6",
    neighborhood_description: str = NEIGHBORHOOD_DESCRIPTION,
    poi_names: list[str] = POI_NAMES,
) -> dict:
    """
    Run one decision tick for a single agent.
    Returns the structured output dict and updates agent state in place.
    Pass model="claude-haiku-4-5-20251001" for cheap forked/counterfactual runs.
    """
    static_block = _build_static_block(agent, neighborhood_description)
    dynamic_block = _build_dynamic_block(
        agent, current_tick, world_event, neighbor_actions, query_keywords, public_actions, poi_names
    )

    response = get_client().messages.create(
        model=model,
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

    agent.current_keywords = result.get("keywords", [])

    belief = result.get("belief") or {}
    if isinstance(belief, dict) and belief.get("summary"):
        agent.belief_about_event = belief["summary"]
        agent.belief_certainty = float(belief.get("certainty", 0.0))
        agent.belief_source = belief.get("source", "")

    memory_content = f"{agent.last_action}" if agent.last_action else agent.current_thought
    agent.memory_stream.append(Memory(
        content=memory_content,
        timestamp=current_tick,
        importance=5.0,
        keywords=result.get("keywords", []),
    ))

    return result
