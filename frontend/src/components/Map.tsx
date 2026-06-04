import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Agent } from '../types';

interface MapProps {
  agents: Agent[];
  onAgentSelect: (agent: Agent) => void;
}

const SOURCE_ID = 'agents-source';
const LAYER_ID = 'agents-layer';
const CLICK_LAYER_ID = 'agents-click-layer';

export default function Map({ agents, onAgentSelect }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const agentsRef = useRef<Agent[]>(agents);
  const initializedRef = useRef(false);

  // Keep agentsRef in sync so click handler can access latest data
  agentsRef.current = agents;

  function buildGeoJSON(agentList: Agent[]): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: agentList.map((a) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [a.lon, a.lat],
        },
        properties: {
          id: a.id,
          name: a.name,
          sentiment: a.sentiment,
        },
      })),
    };
  }

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: [-73.995, 40.73],
      zoom: 15,
    });

    mapRef.current = map;

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: buildGeoJSON(agentsRef.current),
      });

      // Invisible larger circles for easier clicking
      map.addLayer({
        id: CLICK_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 18,
          'circle-opacity': 0,
          'circle-stroke-opacity': 0,
        },
      });

      // Visible agent dots
      map.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 8,
          'circle-color': [
            'case',
            ['<=', ['get', 'sentiment'], -0.3], '#ef4444',
            ['>=', ['get', 'sentiment'], 0.3], '#22c55e',
            '#eab308',
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.9,
        },
      });

      // Click handler
      map.on('click', CLICK_LAYER_ID, (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const agentId = feature.properties?.id as string;
        const found = agentsRef.current.find((a) => a.id === agentId);
        if (found) onAgentSelect(found);
      });

      // Cursor change
      map.on('mouseenter', CLICK_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', CLICK_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update GeoJSON source when agents change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(buildGeoJSON(agents));
    }
  }, [agents]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: '60px',
        left: 0,
        right: 0,
        bottom: 0,
      }}
    />
  );
}
