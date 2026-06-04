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
  selectedShockText?: string;
  currentShock?: string;
  spotlightPOI?: { lat: number; lon: number; name: string } | null;
  shockFlashTrigger?: number;
}

export default function GameMap({
  agents, onAgentSelect, selectedAgentId,
  mapCenter, setupMode, onBoundaryGenerate, generating,
  neighborhoodBoundary, pois, shockPending, selectedShockKeywords, selectedShockText,
  currentShock, spotlightPOI, shockFlashTrigger,
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
      selectedShockText={selectedShockText}
      currentShock={currentShock}
      spotlightPOI={spotlightPOI}
      shockFlashTrigger={shockFlashTrigger}
    />
  );
}
