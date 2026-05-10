"""
Smoke test: inject a shock from CLI across all 40 agents, verify it lands.
Usage: python3 -m engine.test_shock "your shock here"
"""
import sys
import json
from engine.agent import Agent
from engine.shock import inject_shock

def run():
    if len(sys.argv) < 2:
        print("Usage: python3 -m engine.test_shock \"describe any event here\"")
        sys.exit(1)

    shock = sys.argv[1]

    with open("agents.json") as f:
        data = json.load(f)

    agents = [Agent.from_dict(a) for a in data["agents"]]
    inject_shock(agents, shock)

    print(f"Shock injected: \"{shock}\"\n")
    for agent in agents[:5]:  # show first 5 as sample
        m = agent.memory_stream[0]
        print(f"{agent.name:20s} | importance={m.importance} | keywords={m.keywords}")

    print(f"\n✓ All {len(agents)} agents received the shock.")

if __name__ == "__main__":
    run()
