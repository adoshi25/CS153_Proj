"""
Smoke test: plan a cascade for a shock and show the tier assignments.
Usage: python3 -m engine.test_shock "your shock here"
"""
import sys
import json
from engine.agent import Agent
from engine.orchestrator import plan_cascade
from engine.shock import CascadeState, seed_tier1, seed_tier2, seed_tier3, _extract_keywords


def run():
    if len(sys.argv) < 2:
        print("Usage: python3 -m engine.test_shock \"describe any event here\"")
        sys.exit(1)

    shock = sys.argv[1]

    with open("agents.json") as f:
        data = json.load(f)

    agents = [Agent.from_dict(a) for a in data["agents"]]

    print(f"Planning cascade for: \"{shock}\"\n")
    result = plan_cascade(agents, shock)

    keywords = _extract_keywords(shock)
    tier1_ids = [entry["id"] for entry in result["tier1"]]
    tier1_briefs = {entry["id"]: entry["brief"] for entry in result["tier1"]}

    cascade = CascadeState(
        shock_text=shock,
        keywords=keywords,
        start_tick=0,
        tier1_ids=tier1_ids,
        tier1_briefs=tier1_briefs,
        tier2_rumor=result["tier2_rumor"],
        tier3_news=result["tier3_news"],
    )

    seed_tier1(agents, cascade, tick=0)
    seed_tier2(agents, cascade, tick=1)
    seed_tier3(agents, cascade, tick=3)

    print("=== TIER 1 (directly affected) ===")
    for a in agents:
        if a.cascade_tier == 1:
            print(f"  {a.name:20s} ({a.occupation})")
            print(f"    Brief: {a.impact_brief[:120]}")
    print()

    print(f"=== TIER 2 rumor (social graph, tick 1) ===")
    print(f"  {cascade.tier2_rumor}")
    t2 = [a.name for a in agents if a.cascade_tier == 2]
    print(f"  → {len(t2)} agents: {', '.join(t2[:5])}{'...' if len(t2) > 5 else ''}")
    print()

    print(f"=== TIER 3 news (everyone else, tick 3) ===")
    print(f"  {cascade.tier3_news}")
    t3 = [a.name for a in agents if a.cascade_tier == 3]
    print(f"  → {len(t3)} agents")


if __name__ == "__main__":
    run()
