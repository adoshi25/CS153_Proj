from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class Agent:
    id: str
    name: str
    age: int
    occupation: str
    bio: str
    home: dict            # { "lat": float, "lon": float }
    relationships: list[str]
    shock_stance: Optional[str] = None    # 'agree' | 'disagree' | 'neutral' | None
    shock_rationale: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "age": self.age,
            "occupation": self.occupation,
            "bio": self.bio,
            "lat": self.home["lat"],
            "lon": self.home["lon"],
            "relationships": self.relationships,
            "shock_stance": self.shock_stance,
            "shock_rationale": self.shock_rationale,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Agent:
        home = d.get("home", {"lat": d.get("lat", 0.0), "lon": d.get("lon", 0.0)})
        return cls(
            id=d["id"],
            name=d["name"],
            age=d["age"],
            occupation=d["occupation"],
            bio=d["bio"],
            home=home,
            relationships=d.get("relationships", []),
            shock_stance=d.get("shock_stance"),
            shock_rationale=d.get("shock_rationale"),
        )
