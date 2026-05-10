"""
Smoke test: load one agent, inject a shock from CLI, run one tick, print output.
Usage: python3 -m engine.test_decision "your shock description here"
Requires ANTHROPIC_API_KEY in .env
"""
import sys
import json
from dotenv import load_dotenv
load_dotenv()

from engine.agent import Agent
from engine.decision import agent_tick

def run():
    if len(sys.argv) < 2:
        print("Usage: python3 -m engine.test_decision \"describe any event here\"")
        sys.exit(1)

    shock = sys.argv[1]

    with open("agents.json") as f:
        data = json.load(f)

    raw = next(a for a in data["agents"] if a["id"] == "agent_001")
    agent = Agent.from_dict(raw)

    print(f"Agent:  {agent.name} ({agent.occupation})")
    print(f"Shock:  {shock}\n")

    result = agent_tick(
        agent=agent,
        current_tick=1,
        world_event=shock,
        neighbor_actions=[],
        query_keywords=shock.lower().split()[:8],
    )

    print(f"Thought:   {result['thought']}")
    print(f"Action:    {result['action']}")
    print(f"Sentiment: {result['sentiment']}")
    print(f"Keywords:  {result['keywords']}")

if __name__ == "__main__":
    run()
