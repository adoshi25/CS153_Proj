from __future__ import annotations
import logging
from concurrent.futures import ThreadPoolExecutor

import anthropic
from engine.agent import Agent

log = logging.getLogger(__name__)


def reset_all(agents: list[Agent]) -> None:
    for agent in agents:
        agent.shock_stance = None
        agent.shock_rationale = None


def _classify_agent(agent: Agent, shock_text: str) -> tuple[str, str]:
    client = anthropic.Anthropic()
    prompt = (
        f"You are {agent.name}, {agent.age} years old, {agent.occupation}.\n"
        f"Background: {agent.bio}\n\n"
        f"Policy announced in your neighborhood: {shock_text}\n\n"
        f"Respond with exactly:\n"
        f"Line 1: stance: agree|disagree|neutral\n"
        f"Line 2+: Your personal reaction in 5-7 sentences. You MUST cover all of the following:\n"
        f"  - How this directly affects your specific job, income, or daily commute\n"
        f"  - A named person in your life (neighbor, coworker, family) and how it affects them\n"
        f"  - Your emotional or gut reaction — are you angry, relieved, anxious, hopeful?\n"
        f"  - One concrete thing you plan to do or say in response\n"
        f"  - If neutral: the specific competing interests you are weighing and exactly what would tip you either way\n"
        f"No generic phrases. Speak as {agent.name} in this specific neighborhood, not as a policy analyst."
    )
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    import re as _re
    text = resp.content[0].text.strip()
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    stance = "neutral"
    rationale_lines: list[str] = []
    for line in lines:
        if line.lower().startswith("stance:"):
            val = line.split(":", 1)[1].strip().lower()
            if val in ("agree", "disagree", "neutral"):
                stance = val
        else:
            # Strip any stray stance word the model prepended to the rationale
            cleaned = _re.sub(r"^(agree|disagree|neutral)[:\s]+", "", line, flags=_re.IGNORECASE).strip()
            if cleaned:
                rationale_lines.append(cleaned)
    rationale = " ".join(rationale_lines)
    return stance, rationale


def fan_out(agents: list[Agent], shock_text: str) -> None:
    def process(agent: Agent) -> None:
        try:
            stance, rationale = _classify_agent(agent, shock_text)
            agent.shock_stance = stance
            agent.shock_rationale = rationale
        except Exception as exc:
            log.error("fan_out failed for %s: %s", agent.name, exc)
            agent.shock_stance = "neutral"
            agent.shock_rationale = ""

    with ThreadPoolExecutor(max_workers=10) as executor:
        list(executor.map(process, agents))
