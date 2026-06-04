from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Memory:
    content: str
    timestamp: int          # tick or day number
    importance: float       # 1–10, LLM-scored
    keywords: list[str] = field(default_factory=list)


@dataclass
class Agent:
    id: str
    name: str
    age: int
    occupation: str
    bio: str
    home: dict              # { "lat": float, "lon": float }
    relationships: list[str]

    # Shock stance (existing)
    shock_stance: Optional[str] = None     # 'agree' | 'disagree' | 'neutral' | None
    shock_rationale: Optional[str] = None

    # Current position on the map (starts at home, moves during simulation)
    current_lat: Optional[float] = None
    current_lon: Optional[float] = None

    # Activation — set during selective shock scoring
    activated: bool = False
    activation_score: float = 0.0

    # Movement destination — set for activated agents that decide to go somewhere
    destination_lat: Optional[float] = None
    destination_lon: Optional[float] = None
    destination_name: Optional[str] = None
    movement_intent: Optional[str] = None  # why they're going there
    total_journey_days: int = 0
    journey_start_day: int = 1   # sim day on which this agent begins travelling
    journey_day: int = 0
    journey_complete: bool = False

    # Conversations had during this shock cycle
    conversations_log: list[dict] = field(default_factory=list)

    # Accumulated experiences across all shocks (persists across resets)
    experience_log: list[str] = field(default_factory=list)

    # Memory stream (used by decision.py / memory.py)
    memory_stream: list[Memory] = field(default_factory=list)

    # Tick-level decision state (set dynamically by decision.py)
    current_thought: str = ""
    last_action: str = ""
    sentiment: float = 0.0
    move_to: str = "home"
    is_public_action: bool = False
    current_keywords: list[str] = field(default_factory=list)

    # Belief state
    belief_about_event: str = ""
    belief_certainty: float = 0.0
    belief_source: str = ""

    # Counterfactual / cascade fields
    knowledge_tick: Optional[int] = None
    impact_brief: str = ""
    cascade_tier: int = 0

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
            # Live position
            "current_lat": self.current_lat if self.current_lat is not None else self.home["lat"],
            "current_lon": self.current_lon if self.current_lon is not None else self.home["lon"],
            # Activation / movement
            "activated": self.activated,
            "activation_score": self.activation_score,
            "destination_lat": self.destination_lat,
            "destination_lon": self.destination_lon,
            "destination_name": self.destination_name,
            "movement_intent": self.movement_intent,
            "total_journey_days": self.total_journey_days,
            "journey_start_day": self.journey_start_day,
            "journey_day": self.journey_day,
            "journey_complete": self.journey_complete,
            # Social / experience
            "conversations_log": self.conversations_log,
            "experience_log": self.experience_log,
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
            current_lat=d.get("current_lat"),
            current_lon=d.get("current_lon"),
            activated=d.get("activated", False),
            activation_score=d.get("activation_score", 0.0),
            destination_lat=d.get("destination_lat"),
            destination_lon=d.get("destination_lon"),
            destination_name=d.get("destination_name"),
            movement_intent=d.get("movement_intent"),
            total_journey_days=d.get("total_journey_days", 0),
            journey_start_day=d.get("journey_start_day", 1),
            journey_day=d.get("journey_day", 0),
            journey_complete=d.get("journey_complete", False),
            conversations_log=d.get("conversations_log", []),
            experience_log=d.get("experience_log", []),
        )
