from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Memory:
    content: str
    timestamp: int        # tick number
    importance: float     # 0-10, LLM-scored
    keywords: list[str]   # for keyword-based retrieval


@dataclass
class Agent:
    id: str
    name: str
    age: int
    occupation: str
    bio: str
    home: dict            # { "lat": float, "lon": float }
    relationships: list[str]          # list of agent_ids
    memory_stream: list[Memory] = field(default_factory=list)
    current_thought: str = ""
    current_plan: str = ""
    sentiment: float = 0.0            # -1.0 (oppose) to 1.0 (support), 0 = neutral
    last_action: str = ""
    # Information cascade tracking
    knowledge_tick: int | None = None  # tick when agent first heard the shock; None = uninformed
    cascade_tier: int | None = None    # 1=directly affected, 2=social graph, 3=general news
    impact_brief: str = ""             # personalized brief written by orchestrator
    # Belief state (may diverge from what the agent was told)
    belief_about_event: str = ""       # agent's own interpretation of what happened
    belief_certainty: float = 0.0      # 0-1: how confident they are in their belief
    belief_source: str = ""            # "direct", "social", "news", "conversation", or ""
    # Keywords from the most recent decision tick — used for coalition detection
    current_keywords: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "age": self.age,
            "occupation": self.occupation,
            "bio": self.bio,
            "home": self.home,
            "relationships": self.relationships,
            "memory_stream": [
                {
                    "content": m.content,
                    "timestamp": m.timestamp,
                    "importance": m.importance,
                    "keywords": m.keywords,
                }
                for m in self.memory_stream
            ],
            "current_thought": self.current_thought,
            "current_plan": self.current_plan,
            "sentiment": self.sentiment,
            "last_action": self.last_action,
            "knowledge_tick": self.knowledge_tick,
            "cascade_tier": self.cascade_tier,
            "impact_brief": self.impact_brief,
            "belief_about_event": self.belief_about_event,
            "belief_certainty": self.belief_certainty,
            "belief_source": self.belief_source,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Agent:
        memories = [
            Memory(
                content=m["content"],
                timestamp=m["timestamp"],
                importance=m["importance"],
                keywords=m["keywords"],
            )
            for m in d.get("memory_stream", [])
        ]
        return cls(
            id=d["id"],
            name=d["name"],
            age=d["age"],
            occupation=d["occupation"],
            bio=d["bio"],
            home=d["home"],
            relationships=d["relationships"],
            memory_stream=memories,
            current_thought=d.get("current_thought", ""),
            current_plan=d.get("current_plan", ""),
            sentiment=d.get("sentiment", 0.0),
            last_action=d.get("last_action", ""),
            knowledge_tick=d.get("knowledge_tick"),
            cascade_tier=d.get("cascade_tier"),
            impact_brief=d.get("impact_brief", ""),
            belief_about_event=d.get("belief_about_event", ""),
            belief_certainty=float(d.get("belief_certainty", 0.0)),
            belief_source=d.get("belief_source", ""),
        )
