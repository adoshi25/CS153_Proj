export interface Conversation {
  day: number;
  partner_id: string;
  partner_name: string;
  partner_occupation?: string;
  exchanges: { speaker: string; line: string }[];
  my_takeaway: string;
  at_lat?: number;
  at_lon?: number;
}

export interface Agent {
  id: string;
  name: string;
  age?: number;
  occupation?: string;
  bio?: string;
  lat: number;
  lon: number;
  shock_stance: 'agree' | 'disagree' | 'neutral' | null;
  shock_rationale: string | null;
  // Live position (animated)
  current_lat: number;
  current_lon: number;
  // Activation / movement
  activated: boolean;
  activation_score: number;
  destination_lat: number | null;
  destination_lon: number | null;
  destination_name: string | null;
  movement_intent: string | null;
  total_journey_days: number;
  journey_start_day: number;
  journey_day: number;
  journey_complete: boolean;
  // Social history
  conversations_log: Conversation[];
  experience_log: string[];
}

export interface ShockOption {
  id: string;
  title: string;
  description: string;
  poi_keywords?: string[];
}

export interface Snapshot {
  tick: number;
  agents: Agent[];
  sim_day?: number;
  sim_conversations?: { agent1_id: string; agent1_name: string; agent2_id: string; agent2_name: string; day: number }[];
  sim_complete?: boolean;
}

export interface POI {
  name: string;
  lat: number;
  lon: number;
  type: string;
}

export interface CounterfactualResult {
  baseline: { tick: number; groups: Record<string, number> }[];
  with_policy: { tick: number; groups: Record<string, number> }[];
  delta_by_group: Record<string, number>;
  n_ticks: number;
  policy: string;
}
