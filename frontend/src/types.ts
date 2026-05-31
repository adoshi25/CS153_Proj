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
}

export interface POI {
  name: string;
  lat: number;
  lon: number;
  type: string;
}
