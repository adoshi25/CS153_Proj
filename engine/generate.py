from __future__ import annotations
import json
import re
import logging
import anthropic

log = logging.getLogger(__name__)

# Must match city-map.png coordinate bounds exactly
LAT_MIN, LAT_MAX = 40.7245, 40.7355
LON_MIN, LON_MAX = -74.001, -73.989
CENTER_LAT, CENTER_LON = 40.7300, -73.9950

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


_SYSTEM = (
    "You are a society simulation designer. Generate a realistic, diverse community "
    "of people for an agent-based simulation. Output ONLY valid JSON — no markdown, "
    "no preamble, no trailing commentary."
)

_PROMPT_TEMPLATE = """\
Scenario: {description}

Generate exactly 40 residents for this community. Use IDs agent_001 through agent_040.

Map coordinate bounds for home locations (stay within these):
  Latitude:  {lat_min} (south) to {lat_max} (north)
  Longitude: {lon_min} (west)  to {lon_max} (east)

Required occupation mix across all 40 agents:
  5  — Retirees (retired from jobs that relate to this scenario)
  4  — Government / city planning / administration
  3  — Teachers, school staff, educators
  3  — Healthcare (nurses, doctors, pharmacists)
  5  — Finance, tech, professional (bankers, engineers, architects, analysts)
  3  — Local business owners (shops, cafes, restaurants, services)
  3  — Public safety (police, firefighters, security)
  4  — Trades & services (electricians, plumbers, drivers, contractors)
  2  — Sports, fitness, recreation staff
  3  — Community & media (journalists, social workers, organizers, clergy)
  5  — Other residents (students, artists, freelancers, caregivers)

Relationship rules:
  • Each agent lists 3–5 other agents by ID
  • Keep relationships realistic: neighbors know neighbors, coworkers know coworkers, regulars at the same spots know each other
  • Cross-occupational ties are important (the teacher knows the nurse, the cop knows the shop owner)
  • Spread homes across the full coordinate range — don't cluster everyone in one corner

Return this exact JSON (nothing else):
{{
  "neighborhood": "<name of this specific community or district>",
  "center": {{"lat": {center_lat}, "lon": {center_lon}}},
  "city_layout": {{
    "districts": [
      {{"name": "<district name>", "type": "<residential|commercial|industrial|park|government|mixed>"}},
      {{"name": "<district name>", "type": "<type>"}},
      {{"name": "<district name>", "type": "<type>"}},
      {{"name": "<district name>", "type": "<type>"}},
      {{"name": "<district name>", "type": "<type>"}}
    ],
    "landmarks": [
      {{"name": "<landmark name>", "type": "<school|hospital|government|industry|business|community|park|transit|other>"}},
      {{"name": "<landmark name>", "type": "<type>"}},
      {{"name": "<landmark name>", "type": "<type>"}},
      {{"name": "<landmark name>", "type": "<type>"}},
      {{"name": "<landmark name>", "type": "<type>"}},
      {{"name": "<landmark name>", "type": "<type>"}}
    ],
    "roads": ["<main road name>", "<cross street name>", "<secondary road name>", "<secondary road name>"]
  }},
  "agents": [
    {{
      "id": "agent_001",
      "name": "<full name — vary ethnicities and genders across the 40>",
      "age": <integer 19-76>,
      "occupation": "<specific job title>",
      "bio": "<2-3 sentences: daily routine, what they care about, how they fit into this scenario's community>",
      "home": {{"lat": <float>, "lon": <float>}},
      "relationships": ["agent_XXX", "agent_YYY", "agent_ZZZ"],
      "memory_stream": [],
      "current_thought": "",
      "current_plan": "",
      "sentiment": 0.0,
      "last_action": ""
    }},
    ... (agent_002 through agent_040)
  ]
}}"""


def generate_agents(description: str) -> dict:
    """
    Single Sonnet call: generate 40 agents in full agents.json format for a new scenario.
    Returns {"neighborhood": str, "center": dict, "agents": list[dict]}.
    Raises ValueError if the LLM output can't be parsed or yields too few agents.
    """
    prompt = _PROMPT_TEMPLATE.format(
        description=description,
        lat_min=LAT_MIN, lat_max=LAT_MAX,
        lon_min=LON_MIN, lon_max=LON_MAX,
        center_lat=CENTER_LAT, center_lon=CENTER_LON,
    )

    log.info("generate_agents: calling Sonnet for '%s'", description[:80])
    resp = _get_client().messages.create(
        model="claude-sonnet-4-6",
        max_tokens=16000,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = resp.content[0].text.strip()

    # Strip markdown code fences if the model adds them
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.rstrip())

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Last-resort: grab the outermost {...} block
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise ValueError(f"Generator returned non-JSON output: {raw[:400]}")
        data = json.loads(match.group())

    agents = data.get("agents", [])
    if len(agents) < 10:
        raise ValueError(
            f"Generator only produced {len(agents)} agents — expected ~40. "
            f"The scenario description may need to be more specific."
        )

    valid_ids = {a["id"] for a in agents}

    for agent in agents:
        # Clamp home coordinates within map bounds
        home = agent.get("home", {})
        agent["home"] = {
            "lat": round(max(LAT_MIN, min(LAT_MAX, float(home.get("lat", CENTER_LAT)))), 6),
            "lon": round(max(LON_MIN, min(LON_MAX, float(home.get("lon", CENTER_LON)))), 6),
        }
        # Sanitize relationships: remove self-refs, unknown IDs, cap at 5
        agent["relationships"] = [
            r for r in agent.get("relationships", [])
            if r in valid_ids and r != agent["id"]
        ][:5]
        # Ensure all required empty-state fields exist
        for key, default in [
            ("memory_stream", []), ("current_thought", ""),
            ("current_plan", ""), ("sentiment", 0.0), ("last_action", ""),
            ("knowledge_tick", None), ("cascade_tier", None), ("impact_brief", ""),
        ]:
            agent.setdefault(key, default)

    log.info(
        "generate_agents: produced %d agents for '%s'",
        len(agents), data.get("neighborhood", "unnamed"),
    )
    return data
