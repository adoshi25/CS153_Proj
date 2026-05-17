from __future__ import annotations
import json
import anthropic

_client = None

def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def orchestrate(agent_states: list[dict], tick: int) -> dict:
    lines = []
    for s in agent_states:
        lines.append(
            f"- {s['name']} (sentiment {s['sentiment']:+.2f}): {s['thought']} | Action: {s['action']}"
        )
    agents_text = "\n".join(lines)

    prompt = f"""Tick {tick}. Here are the current thoughts, sentiments, and actions of {len(agent_states)} community members in Boerum Hill, Brooklyn:

{agents_text}

Analyze this community snapshot and respond with only valid JSON:
{{
  "summary": "<2-3 sentence description of the community's collective state right now>",
  "top_concerns": ["<concern 1>", "<concern 2>", "<concern 3>"],
  "consensus_sentiment": <float from -1.0 to 1.0 representing overall community sentiment>,
  "policy_recommendations": [
    {{"intervention": "<concrete policy action>", "likely_effect": "<what effect this would have on community sentiment>"}},
    {{"intervention": "<concrete policy action>", "likely_effect": "<what effect this would have on community sentiment>"}}
  ]
}}

Focus on: what is the community collectively feeling, what are the top 2-3 concerns, where is consensus forming vs fracturing, and what 2 specific policy interventions would meaningfully shift community response."""

    resp = get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system="You are a sociologist observing a neighborhood in real time. Synthesize agent states into a community-level analysis. Return only valid JSON.",
        messages=[{"role": "user", "content": prompt}],
    )

    raw = resp.content[0].text.strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        import re
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
        "policy_recommendations": result.get("policy_recommendations", []),
    }
