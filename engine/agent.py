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
        )
