export interface Agent {
  id: string;
  name: string;
  lat: number;
  lon: number;
  sentiment: number;
  thought: string;
  action: string;
  move_to: string;
}

export interface PolicyRecommendation {
  intervention: string;
  likely_effect: string;
}

export interface Orchestrator {
  summary: string;
  top_concerns: string[];
  consensus_sentiment: number;
  policy_recommendations: PolicyRecommendation[];
}

export interface Conversation {
  location: string;
  summary: string;
}

export interface PublicAction {
  name: string;
  action: string;
  sentiment: number;
}

export interface Snapshot {
  tick: number;
  agents: Agent[];
  orchestrator: Orchestrator;
  conversations: Conversation[];
  public_actions: PublicAction[];
}
