from __future__ import annotations
import json
import re
import logging
import urllib.request
import urllib.parse
import anthropic
from concurrent.futures import ThreadPoolExecutor, as_completed
from json_repair import repair_json

log = logging.getLogger(__name__)

# Default anchor (Brooklyn) — used as coordinate template; translated per scenario
_DEFAULT_CENTER_LAT, _DEFAULT_CENTER_LON = 40.7300, -73.9950
# Half-widths of the bounding box (~600m each side)
_LAT_HALF = 0.0055
_LON_HALF = 0.006

# Kept for backwards compat — callers that import these still get Brooklyn defaults
LAT_MIN, LAT_MAX = _DEFAULT_CENTER_LAT - _LAT_HALF, _DEFAULT_CENTER_LAT + _LAT_HALF
LON_MIN, LON_MAX = _DEFAULT_CENTER_LON - _LON_HALF, _DEFAULT_CENTER_LON + _LON_HALF
CENTER_LAT, CENTER_LON = _DEFAULT_CENTER_LAT, _DEFAULT_CENTER_LON


# ── Geocoding (OSM Nominatim — free, no API key) ──────────────────────────────

def _geocode(query: str) -> tuple[float, float] | None:
    """Return (lat, lon) for a place name, or None if not found / error."""
    try:
        encoded = urllib.parse.quote(query)
        url = f"https://nominatim.openstreetmap.org/search?q={encoded}&format=json&limit=1"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "SocietySim-CS153/1.0 (educational project)"},
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            results = json.loads(resp.read())
        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as exc:
        log.warning("geocode failed for '%s': %s", query, exc)
    return None


def _reverse_geocode(lat: float, lon: float) -> str | None:
    """Return a human-readable place name for the given coordinates via OSM Nominatim."""
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&zoom=14"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "SocietySim-CS153/1.0 (educational project)"},
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            result = json.loads(resp.read())
        addr = result.get("address", {})
        parts = [
            addr.get("neighbourhood") or addr.get("suburb"),
            addr.get("city") or addr.get("town") or addr.get("village"),
            addr.get("country"),
        ]
        return ", ".join(p for p in parts if p) or result.get("display_name", "")
    except Exception as exc:
        log.warning("reverse_geocode failed for (%.4f, %.4f): %s", lat, lon, exc)
    return None


def _bounds_for_center(c_lat: float, c_lon: float) -> dict:
    return {
        "lat_min": round(c_lat - _LAT_HALF, 6),
        "lat_max": round(c_lat + _LAT_HALF, 6),
        "lon_min": round(c_lon - _LON_HALF, 6),
        "lon_max": round(c_lon + _LON_HALF, 6),
        "center_lat": round(c_lat, 6),
        "center_lon": round(c_lon, 6),
    }


def _translate_coord(val: float, orig_min: float, orig_max: float,
                     new_min: float, new_max: float) -> float:
    """Map val from [orig_min, orig_max] → [new_min, new_max], clamped."""
    if orig_max == orig_min:
        return (new_min + new_max) / 2
    t = (val - orig_min) / (orig_max - orig_min)
    t = max(0.0, min(1.0, t))
    return round(new_min + t * (new_max - new_min), 6)

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


# ── Neighborhood cultural profile ─────────────────────────────────────────────

def _get_neighborhood_profile(place_name: str, lat: float, lon: float) -> str:
    """
    Quick Haiku call: return a cultural/demographic profile for the location.
    Used to make agent occupations and behaviors location-specific rather than
    defaulting to a generic urban template.
    """
    try:
        prompt = (
            f"Location: {place_name} (coordinates {lat:.4f}°, {lon:.4f}°)\n\n"
            "You are helping design a realistic agent-based society simulation. "
            "Describe the real-world cultural and demographic character of this specific location "
            "so that AI agents can be generated with authentic occupations, values, and daily behaviors.\n\n"
            "Cover each section in 2–3 concrete sentences:\n\n"
            "1. INDUSTRIES & OCCUPATIONS — What industries dominate? Most common jobs? "
            "Rough split (e.g. '35% tech workers, 20% service industry, 15% government...'). "
            "Name actual major employers or sectors.\n\n"
            "2. CULTURE & VALUES — What do residents care about? Political leanings? "
            "Community identity? What makes this place's culture distinct?\n\n"
            "3. ECONOMIC CONTEXT — Cost of living, income range, economic trajectory "
            "(gentrifying, declining, stable, booming). Who lives here vs. who used to?\n\n"
            "4. DAILY LIFE — How do people commute? Where do they socialize and eat? "
            "Work culture and hours? Weekend habits?\n\n"
            "5. CULTURAL MARKERS — Give 4–6 specific, concrete signals that scream 'THIS place': "
            "e.g. 'Most driveways have a Tesla or Prius', 'Pickup trucks with contractor logos everywhere', "
            "'Everyone has a startup idea and stock options', 'Church attendance is the primary social fabric', "
            "'Outdoor gear in every garage', 'Multigenerational households are the norm', "
            "'Rent is so high most workers have roommates at 35'.\n\n"
            "6. LOCAL TENSIONS — What issues dominate community conversation? "
            "Housing, displacement, jobs, development, environment, crime, transit?\n\n"
            "Be hyper-specific to THIS location. No generic filler that could apply anywhere."
        )
        resp = _get_client().messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        profile = resp.content[0].text.strip()
        log.info("neighborhood profile for '%s': %d chars", place_name, len(profile))
        return profile
    except Exception as exc:
        log.warning("_get_neighborhood_profile failed for '%s': %s", place_name, exc)
        return ""


# ── Default occupation mix (used when no location profile is available) ────────

_DEFAULT_OCCUPATION_GUIDANCE = """\
Required occupation mix across all 40 agents:
  5  — Retirees (retired from jobs relevant to this scenario)
  4  — Government / city planning / administration
  3  — Teachers, school staff, educators
  3  — Healthcare (nurses, doctors, pharmacists)
  5  — Finance, tech, professional (bankers, engineers, architects, analysts)
  3  — Local business owners (shops, cafes, restaurants, services)
  3  — Public safety (police, firefighters, security)
  4  — Trades & services (electricians, plumbers, drivers, contractors)
  2  — Sports, fitness, recreation staff
  3  — Community & media (journalists, social workers, organizers, clergy)
  5  — Other residents (students, artists, freelancers, caregivers)"""


def _build_occupation_guidance(profile: str) -> str:
    if not profile:
        return _DEFAULT_OCCUPATION_GUIDANCE
    return """\
Occupation mix — ADAPT to the neighborhood profile above (total: exactly 40 agents):
  • Weight dominant occupations toward the industries described in the profile.
  • Minimum diversity floors — never go below these regardless of location:
      2  retirees
      2  government / civic workers
      2  education workers
      2  healthcare workers
      2  local business owners
      2  trades & services (plumbers, electricians, drivers, etc.)
  • Remaining 28 slots: reflect the actual local economy (e.g. for Bay Area weight tech
    workers, PMs, startup founders, VCs; for Appalachian coal town weight miners,
    mechanics, railroad workers; for Tokyo weight salaried office workers, engineers,
    service industry; for university district weight researchers, graduate students).
  • Job titles MUST be location-specific (e.g. "iOS Engineer at Stripe, remote" not
    "software engineer"; "Longwall Mining Operator" not "laborer"; "Izakaya Owner" not
    "restaurant owner"). Specificity signals authenticity."""


def _build_profile_section(profile: str, place_name: str) -> str:
    if not profile:
        return ""
    return f"=== NEIGHBORHOOD PROFILE: {place_name} ===\n{profile}\n=== END PROFILE ===\n\n"


# ── OSM Overpass real places ──────────────────────────────────────────────────

_OSM_AMENITY_TO_SIM_TYPE: dict[str, str] = {
    "school": "school", "college": "school", "university": "school", "kindergarten": "school",
    "hospital": "hospital", "clinic": "hospital", "doctors": "hospital", "pharmacy": "hospital",
    "townhall": "government", "courthouse": "government", "police": "government",
    "fire_station": "government", "post_office": "government",
    "cafe": "business", "restaurant": "business", "bar": "business", "pub": "business",
    "fast_food": "business", "bank": "business", "marketplace": "business",
    "library": "community", "community_centre": "community", "place_of_worship": "community",
    "social_facility": "community", "theatre": "community", "cinema": "community",
    "arts_centre": "community",
    "bus_station": "transit", "ferry_terminal": "transit", "subway_entrance": "transit",
}


def _osm_type_to_sim_type(tags: dict) -> str:
    amenity = tags.get("amenity", "")
    shop = tags.get("shop", "")
    leisure = tags.get("leisure", "")
    tourism = tags.get("tourism", "")
    if amenity in _OSM_AMENITY_TO_SIM_TYPE:
        return _OSM_AMENITY_TO_SIM_TYPE[amenity]
    if shop:
        return "business"
    if leisure in ("park", "playground", "garden", "nature_reserve", "common"):
        return "park"
    if leisure:
        return "community"
    if tourism in ("museum", "gallery", "attraction"):
        return "community"
    if tourism:
        return "other"
    return "other"


_OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def _overpass_query(query: str, timeout: int = 25) -> dict:
    """POST a query to Overpass API, trying mirrors on failure."""
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "SocietySim-CS153/1.0 (educational project)",
    }
    data = urllib.parse.urlencode({"data": query}).encode()
    last_err: Exception | None = None
    for endpoint in _OVERPASS_ENDPOINTS:
        try:
            req = urllib.request.Request(endpoint, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except Exception as exc:
            log.warning("Overpass %s failed: %s — trying next mirror", endpoint, exc)
            last_err = exc
    raise last_err or RuntimeError("All Overpass mirrors failed")


def _fetch_osm_pois(lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> list[dict]:
    """
    Fetch named POIs from the Overpass API within a bounding box.
    Queries both node elements (cafes, shops) and way/relation elements
    (buildings, large venues) — using `out center` to get centroids for polygons.
    """
    bbox = f"{lat_min},{lon_min},{lat_max},{lon_max}"
    # Query nodes AND ways for every major tag category.
    # `out center` returns the centroid lat/lon for way/relation elements.
    query = (
        f"[out:json][timeout:22];\n(\n"
        # nodes
        f'  node["amenity"]["name"]({bbox});\n'
        f'  node["shop"]["name"]({bbox});\n'
        f'  node["leisure"]["name"]({bbox});\n'
        f'  node["tourism"]["name"]({bbox});\n'
        f'  node["historic"]["name"]({bbox});\n'
        # ways (buildings, large venues — centroid via `out center`)
        f'  way["amenity"]["name"]({bbox});\n'
        f'  way["shop"]["name"]({bbox});\n'
        f'  way["leisure"]["name"]({bbox});\n'
        f'  way["tourism"]["name"]({bbox});\n'
        f'  way["building"]["name"]({bbox});\n'
        f'  way["historic"]["name"]({bbox});\n'
        f");\nout center;"
    )
    try:
        result = _overpass_query(query, timeout=18)
        elements = result.get("elements", [])
        pois: list[dict] = []
        seen: set[str] = set()
        for el in elements:
            name = el.get("tags", {}).get("name", "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            tags = el.get("tags", {})
            if el.get("type") == "way":
                center = el.get("center", {})
                lat = center.get("lat")
                lon = center.get("lon")
            else:
                lat = el.get("lat")
                lon = el.get("lon")
            if lat is None or lon is None:
                continue
            pois.append({
                "name": name,
                "lat": float(lat),
                "lon": float(lon),
                "type": _osm_type_to_sim_type(tags),
                "_amenity": (
                    tags.get("amenity") or tags.get("shop") or tags.get("leisure")
                    or tags.get("tourism") or tags.get("historic") or tags.get("building", "")
                ),
            })
        log.info("OSM Overpass: %d named POIs in bbox (nodes+ways)", len(pois))
        return pois
    except Exception as exc:
        log.warning("_fetch_osm_pois failed: %s", exc)
        return []


def _fetch_osm_streets(lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> list[str]:
    """Fetch street names from the Overpass API within a bounding box."""
    bbox = f"{lat_min},{lon_min},{lat_max},{lon_max}"
    query = f'[out:json][timeout:15];\nway["highway"]["name"]({bbox});\nout tags;'
    try:
        result = _overpass_query(query, timeout=18)
        names: set[str] = {
            el.get("tags", {}).get("name", "")
            for el in result.get("elements", [])
            if el.get("tags", {}).get("name")
        }
        streets = sorted(names)[:25]
        log.info("OSM Overpass: %d street names in bbox", len(streets))
        return streets
    except Exception as exc:
        log.warning("_fetch_osm_streets failed: %s", exc)
        return []


def _sample_pois(pois: list[dict], max_count: int = 35) -> list[dict]:
    """Select a diverse set of POIs across types."""
    by_type: dict[str, list[dict]] = {}
    for p in pois:
        by_type.setdefault(p["type"], []).append(p)
    type_limits = [
        ("business", 12), ("community", 6), ("park", 4),
        ("school", 3), ("government", 3), ("hospital", 3), ("transit", 2), ("other", 4),
    ]
    selected: list[dict] = []
    for t, lim in type_limits:
        selected.extend(by_type.get(t, [])[:lim])
    already = {p["name"] for p in selected}
    for p in pois:
        if len(selected) >= max_count:
            break
        if p["name"] not in already:
            selected.append(p)
    return selected[:max_count]


def _build_real_places_section(pois: list[dict], streets: list[str], place_name: str) -> str:
    """Build a prompt section listing real OSM venues and streets for agent bio grounding."""
    if not pois and not streets:
        return ""
    lines = [
        f"=== REAL PLACES IN {place_name.upper()} (from OpenStreetMap — use these exact names) ===",
        "CRITICAL: Agent bios MUST use these actual venue and street names. Do NOT invent fictional places.\n",
    ]
    if pois:
        lines.append("Venues agents visit, work at, or reference:")
        for p in pois:
            amenity = p.get("_amenity", p["type"])
            lines.append(f"  • {p['name']} ({amenity})")
    if streets:
        lines.append("\nStreets agents live on and commute via:")
        lines.append("  " + ", ".join(streets[:20]))
    lines.append("\n=== END REAL PLACES ===\n")
    return "\n".join(lines)


_SYSTEM = (
    "You are a society simulation designer. Generate a realistic, diverse community "
    "of people for an agent-based simulation. Output ONLY valid JSON — no markdown, "
    "no preamble, no trailing commentary."
)

_PROMPT_TEMPLATE = """\
{neighborhood_profile_section}{real_places_section}Scenario: {description}

Generate exactly 40 residents for this community. Use IDs agent_001 through agent_040.

Map coordinate bounds for home locations (stay within these):
  Latitude:  {lat_min} (south) to {lat_max} (north)
  Longitude: {lon_min} (west)  to {lon_max} (east)

{occupation_guidance}

Relationship rules:
  • Each agent lists 3–5 other agents by ID
  • Keep relationships realistic: neighbors know neighbors, coworkers know coworkers, regulars at the same spots know each other
  • Cross-occupational ties are important (the teacher knows the nurse, the cop knows the shop owner)
  • Spread homes across the full coordinate range — don't cluster everyone in one corner

Bio writing — each agent must feel like they could ONLY live in {place_hint}:
  • For each agent, find the 2-3 POIs from the real places section whose lat/lon coordinates are closest to
    this agent's home lat/lon, and mention those places by name in the bio
  • Reference specific local transportation (BART, Caltrain, subway, pickup truck, cycling — whatever fits HERE)
  • Use the REAL place names listed above exactly as written (streets, cafes, parks, transit) — no fictional substitutes
  • Values and daily habits must match the neighborhood profile above
  • Include at least one cultural marker per bio that signals THIS location (EV owner, union member, etc.)
  • Occupation titles must be SPECIFIC — "Senior ML Engineer at Anthropic" not "engineer"

Return this exact JSON (nothing else):
{{
  "neighborhood": "<name of this specific community or district>",
  "real_world_location": "<the closest real-world city and country this scenario maps to, e.g. 'Harlan, Kentucky, USA' or 'Shoreditch, London, UK' or 'Shinjuku, Tokyo, Japan' — used for map centering>",
  "center": {{"lat": {center_lat}, "lon": {center_lon}}},
  "neighborhood_description": "<3-4 sentences describing this community's layout, key streets, landmarks, and character — written as if orienting a new resident. Name specific streets, districts, and gathering places that agents should reference in conversation.>",
  "pois": [
    {{"name": "<location name>", "lat": <float within bounds>, "lon": <float within bounds>, "type": "<school|hospital|government|industry|business|community|park|transit|other>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}},
    {{"name": "<location name>", "lat": <float>, "lon": <float>, "type": "<type>"}}
  ],
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
      "bio": "<2 sentences MAX, 45 words max: name 1-2 nearby POIs closest to home, their job context, one cultural marker for THIS place. No filler.>",
      "home": {{"lat": <float>, "lon": <float>}},
      "relationships": ["agent_XXX", "agent_YYY", "agent_ZZZ"]
    }},
    ... (agent_002 through agent_040)
  ]
}}"""


def generate_agents(
    description: str,
    center_lat: float | None = None,
    center_lon: float | None = None,
    polygon: list[list[float]] | None = None,
) -> dict:
    """
    Single Sonnet call: generate 40 agents.

    If center_lat/center_lon or polygon is provided the coordinates are used directly
    and no Nominatim forward-geocoding step is needed.  A reverse-geocode call is still
    made to enrich the prompt with the real place name.

    Otherwise the legacy flow applies: generate in Brooklyn template space, forward-
    geocode real_world_location, then translate coordinates.
    """
    # ── Determine coordinate bounds ──────────────────────────────────────────────
    explicit_bounds = False
    place_hint = ""

    if polygon and len(polygon) >= 3:
        # GeoJSON ring: [[lon, lat], ...]
        lons = [p[0] for p in polygon]
        lats = [p[1] for p in polygon]
        lat_min, lat_max = min(lats), max(lats)
        lon_min, lon_max = min(lons), max(lons)
        c_lat = (lat_min + lat_max) / 2
        c_lon = (lon_min + lon_max) / 2
        explicit_bounds = True
        log.info("generate_agents: using polygon bounds lat=[%.4f,%.4f] lon=[%.4f,%.4f]",
                 lat_min, lat_max, lon_min, lon_max)
    elif center_lat is not None and center_lon is not None:
        c_lat, c_lon = center_lat, center_lon
        lat_min = c_lat - _LAT_HALF
        lat_max = c_lat + _LAT_HALF
        lon_min = c_lon - _LON_HALF
        lon_max = c_lon + _LON_HALF
        explicit_bounds = True
        log.info("generate_agents: using explicit center (%.4f, %.4f)", c_lat, c_lon)
    else:
        lat_min, lat_max = LAT_MIN, LAT_MAX
        lon_min, lon_max = LON_MIN, LON_MAX
        c_lat, c_lon = CENTER_LAT, CENTER_LON

    # ── Build location-aware prompt variables ────────────────────────────────────
    place_name = ""
    profile = ""
    osm_pois: list[dict] = []
    real_places_section = ""

    if explicit_bounds:
        # Run reverse geocode in parallel with OSM queries — saves ~2s on the critical path.
        # Profile needs the place name so it runs after this group completes.
        with ThreadPoolExecutor(max_workers=3) as pool:
            f_name    = pool.submit(_reverse_geocode, c_lat, c_lon)
            f_pois    = pool.submit(_fetch_osm_pois, lat_min, lat_max, lon_min, lon_max)
            f_streets = pool.submit(_fetch_osm_streets, lat_min, lat_max, lon_min, lon_max)
        place_name = f_name.result() or f"{c_lat:.4f}°, {c_lon:.4f}°"
        raw_pois   = f_pois.result()
        streets    = f_streets.result()
        log.info("Reverse-geocoded to: %s", place_name)

        profile = _get_neighborhood_profile(place_name, c_lat, c_lon)

        osm_pois = _sample_pois(raw_pois, max_count=20)
        real_places_section = _build_real_places_section(osm_pois, streets, place_name)

    neighborhood_profile_section = _build_profile_section(profile, place_name)
    occupation_guidance = _build_occupation_guidance(profile)
    place_hint = place_name if place_name else "this specific neighborhood"

    # ── Step 1 — LLM call ────────────────────────────────────────────────────────
    prompt = _PROMPT_TEMPLATE.format(
        description=description,
        neighborhood_profile_section=neighborhood_profile_section,
        real_places_section=real_places_section,
        occupation_guidance=occupation_guidance,
        place_hint=place_hint,
        lat_min=round(lat_min, 6), lat_max=round(lat_max, 6),
        lon_min=round(lon_min, 6), lon_max=round(lon_max, 6),
        center_lat=round(c_lat, 6), center_lon=round(c_lon, 6),
    )

    log.info("generate_agents: calling Sonnet for '%s'", description[:80])
    resp = _get_client().messages.create(
        model="claude-sonnet-4-6",
        max_tokens=12000,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = resp.content[0].text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.rstrip())

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as first_err:
        log.warning("JSON parse failed at char %d (%s) — attempting repair", first_err.pos, first_err.msg)
        try:
            data = json.loads(repair_json(raw))
        except Exception:
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if not match:
                raise ValueError(f"Generator returned non-JSON output: {raw[:400]}")
            data = json.loads(repair_json(match.group()))

    # Defensive: repair_json can produce dicts/nulls where strings are expected.
    # Drop any agent that lacks a valid string id or a dict home so downstream
    # code (set comprehensions, float() casts) never crashes.
    raw_agents = data.get("agents", [])
    agents = [
        a for a in raw_agents
        if isinstance(a, dict)
        and isinstance(a.get("id"), str)
        and isinstance(a.get("home"), dict)
    ]
    if len(agents) < 10:
        raise ValueError(
            f"Generator only produced {len(agents)} valid agents (raw={len(raw_agents)}) — expected ~40."
        )

    if explicit_bounds:
        # Coordinates are already in the right space — just clamp & clean
        bounds = {
            "lat_min": round(lat_min, 6), "lat_max": round(lat_max, 6),
            "lon_min": round(lon_min, 6), "lon_max": round(lon_max, 6),
            "center_lat": round(c_lat, 6), "center_lon": round(c_lon, 6),
        }
    else:
        # ── Step 2 — geocode to real-world location ───────────────────────────────
        real_loc = data.get("real_world_location", "")
        geo = _geocode(real_loc) if real_loc else None
        if geo:
            c_lat, c_lon = geo
            log.info("Geocoded '%s' → (%.4f, %.4f)", real_loc, c_lat, c_lon)
        else:
            c_lat, c_lon = _DEFAULT_CENTER_LAT, _DEFAULT_CENTER_LON
            log.warning("Geocoding failed for '%s', defaulting to Brooklyn", real_loc)
        bounds = _bounds_for_center(c_lat, c_lon)

    valid_ids = {a["id"] for a in agents}

    if explicit_bounds:
        # No translation needed — sanitize relationships only
        for agent in agents:
            agent["relationships"] = [
                r for r in agent.get("relationships", [])
                if r in valid_ids and r != agent["id"]
            ][:5]
    else:
        # ── Step 3 — translate coordinates from Brooklyn template → real location ──
        def xlat_lat(v: float) -> float:
            return _translate_coord(v, LAT_MIN, LAT_MAX, bounds["lat_min"], bounds["lat_max"])

        def xlat_lon(v: float) -> float:
            return _translate_coord(v, LON_MIN, LON_MAX, bounds["lon_min"], bounds["lon_max"])

        for agent in agents:
            home = agent.get("home", {})
            agent["home"] = {
                "lat": xlat_lat(float(home.get("lat", CENTER_LAT))),
                "lon": xlat_lon(float(home.get("lon", CENTER_LON))),
            }
            agent["relationships"] = [
                r for r in agent.get("relationships", [])
                if r in valid_ids and r != agent["id"]
            ][:5]

        for poi in data.get("pois", []):
            poi["lat"] = xlat_lat(float(poi.get("lat", CENTER_LAT)))
            poi["lon"] = xlat_lon(float(poi.get("lon", CENTER_LON)))

    # Override LLM-invented POIs with real OSM venues when we fetched enough
    if osm_pois and len(osm_pois) >= 3:
        data["pois"] = [
            {"name": p["name"], "lat": p["lat"], "lon": p["lon"], "type": p["type"]}
            for p in osm_pois
        ]
        log.info("Replaced LLM POIs with %d real OSM POIs", len(osm_pois))

    data["map_center"] = {"lat": c_lat, "lon": c_lon}
    data["map_bounds"] = bounds

    log.info(
        "generate_agents: %d agents, explicit_bounds=%s, center=(%.4f, %.4f)",
        len(agents), explicit_bounds, c_lat, c_lon,
    )
    return data
