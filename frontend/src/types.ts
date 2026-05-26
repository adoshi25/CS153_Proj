export interface Agent {
  id: string;
  name: string;
  lat: number;
  lon: number;
  sentiment: number;
  thought: string;
  action: string;
  move_to: string;
  relationships: string[];
  // cascade (Track B)
  cascade_tier: 1 | 2 | 3 | null;
  knowledge_tick: number | null;
  impact_brief: string;
  // belief state (Track C)
  belief_about_event: string;
  belief_certainty: number;
  belief_source: string;
}

export interface PolicyRecommendation {
  intervention: string;
  likely_effect: string;
}

export interface Coalition {
  name: string;
  size: number;
  sentiment_direction: 'positive' | 'negative' | 'neutral';
  shared_concerns: string[];
  member_names: string[];
  formed_at_tick: number;
}

export interface BeliefCluster {
  label: string;
  agent_count: number;
  avg_certainty: number;
}

export interface Orchestrator {
  summary: string;
  top_concerns: string[];
  consensus_sentiment: number;
  policy_recommendations: PolicyRecommendation[];
  belief_fragmentation_score: number;
  belief_clusters: BeliefCluster[];
  coalitions: Coalition[];
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

export interface QueryMember {
  id: string;
  name: string;
  age: number;
  occupation: string;
  group: string;
  opinion: string;
  sentiment: number;
}

export interface QueryGroup {
  group: string;
  count: number;
  avg_sentiment: number;
  members: QueryMember[];
}

export interface CounterfactualPoint {
  tick: number;
  groups: Record<string, number>;
}

export interface CounterfactualResult {
  baseline: CounterfactualPoint[];
  with_policy: CounterfactualPoint[];
  delta_by_group: Record<string, number>;
  n_ticks: number;
  policy: string;
}

export interface NarrativeEntry {
  tick: number;
  text: string;
  kind: 'conversation' | 'action';
}

export interface CityDistrict {
  name: string;
  type: 'residential' | 'commercial' | 'industrial' | 'park' | 'government' | 'mixed';
}

export interface CityLandmark {
  name: string;
  type: 'school' | 'hospital' | 'government' | 'industry' | 'business' | 'community' | 'park' | 'transit' | 'other';
}

export interface CityLayout {
  districts: CityDistrict[];
  landmarks: CityLandmark[];
  roads: string[];
}

export interface HistoryPoint {
  tick: number;
  groups: Record<string, number>;
}

export interface QueryResult {
  question: string;
  overall_sentiment: number;
  total_responses: number;
  groups: QueryGroup[];
  all_responses: QueryMember[];
}
