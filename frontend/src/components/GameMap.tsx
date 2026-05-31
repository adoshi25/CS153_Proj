import type { Agent, POI } from '../types';
import MapLibreMap from './MapLibreMap';

interface GameMapProps {
  agents: Agent[];
  onAgentSelect: (agent: Agent) => void;
  selectedAgentId: string | null;
  mapCenter?: { lat: number; lon: number } | null;
  setupMode?: boolean;
  onBoundaryGenerate?: (description: string, polygon: [number, number][]) => void;
  generating?: boolean;
  neighborhoodBoundary?: [number, number][] | null;
  pois?: POI[];
  shockPending?: boolean;
  selectedShockKeywords?: string[];
  spotlightPOI?: { lat: number; lon: number; name: string } | null;
}

export default function GameMap({
  agents, onAgentSelect, selectedAgentId,
  mapCenter, setupMode, onBoundaryGenerate, generating,
  neighborhoodBoundary, pois, shockPending, selectedShockKeywords, spotlightPOI,
}: GameMapProps) {
  return (
    <MapLibreMap
      agents={agents}
      onAgentSelect={onAgentSelect}
      selectedAgentId={selectedAgentId}
      mapCenter={mapCenter}
      setupMode={setupMode}
      onBoundaryGenerate={onBoundaryGenerate}
      generating={generating}
      neighborhoodBoundary={neighborhoodBoundary}
      pois={pois}
      shockPending={shockPending}
      selectedShockKeywords={selectedShockKeywords}
      spotlightPOI={spotlightPOI}
    />
  );
}
