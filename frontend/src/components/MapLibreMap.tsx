import { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Agent, POI } from '../types';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_ZOOM = 15;

function stanceColor(stance: Agent['shock_stance']): string {
  if (stance === 'agree') return '#22c55e';
  if (stance === 'disagree') return '#ef4444';
  return '#d4a927';
}

// ── Per-agent organic movement helpers ───────────────────────────────────────

// Deterministic hash → personal walk speed (0.55 – 1.45×)
function personalSpeed(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = (h * 33 ^ id.charCodeAt(i)) & 0xffff;
  return 0.55 + (h % 100) / 111;
}

// Small sinusoidal wander: each agent has its own frequency & amplitude
function wanderOffset(id: string, t: number): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) & 0xffff;
  const freq = 0.00055 + (h % 15) * 0.000035;
  const amp  = 0.000016 + (h % 10) * 0.0000038;
  return [
    Math.sin(t * freq        + h) * amp,
    Math.cos(t * freq * 1.37 + h) * amp,
  ];
}

// Easing: agents accelerate away from stops, decelerate approaching them
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Agents are rendered as a GeoJSON circle layer (canvas-based, not HTML markers).
// This ensures perfect zoom/pan behavior — no DOM jitter.

function pointInPolygon(lon: number, lat: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// ── GeoJSON helpers ───────────────────────────────────────────────────────────
type LngLat = [number, number];

function polygonGeoJSON(ring: LngLat[]): GeoJSON.Feature {
  const closed = ring.length >= 2 ? [...ring, ring[0]] : ring;
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [closed] }, properties: {} };
}
function lineGeoJSON(pts: LngLat[]): GeoJSON.Feature {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} };
}
function pointsGeoJSON(pts: LngLat[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: pts.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} })) };
}
const EMPTY_POLYGON: GeoJSON.Feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] }, properties: {} };
const EMPTY_LINE: GeoJSON.Feature    = { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} };
const EMPTY_POINTS: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
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

type DrawMode = 'idle' | 'drawing' | 'selected';

export default function MapLibreMap({
  agents, onAgentSelect, selectedAgentId,
  mapCenter, setupMode = false, onBoundaryGenerate, generating = false,
  neighborhoodBoundary = null, pois = [], shockPending = false, selectedShockKeywords = [],
  selectedShockText = '', currentShock = '', spotlightPOI = null, shockFlashTrigger = 0,
}: Props) {
  const containerRef        = useRef<HTMLDivElement>(null);
  const mapRef              = useRef<maplibregl.Map | null>(null);
  const poiMarkersRef       = useRef<maplibregl.Marker[]>([]);
  const spotlightMarkerRef  = useRef<maplibregl.Marker | null>(null);
  const thinkingMarkersRef  = useRef<maplibregl.Marker[]>([]);
  const emojiMarkersRef       = useRef<Map<string, maplibregl.Marker>>(new Map());
  const emojiElementsRef      = useRef<Map<string, HTMLElement>>(new Map());
  const hoverPopupRef         = useRef<maplibregl.Popup | null>(null);
  // Records the real timestamp when each agent first became moving (for continuous position calc)
  const agentStartTimesRef    = useRef<Map<string, number>>(new Map());
  const onSelectRef   = useRef(onAgentSelect);
  const agentsRef     = useRef(agents);
  agentsRef.current   = agents;
  useEffect(() => { onSelectRef.current = onAgentSelect; }, [onAgentSelect]);

  const setupModeRef  = useRef(setupMode);
  setupModeRef.current = setupMode;
  const selectedIdRef = useRef(selectedAgentId);
  selectedIdRef.current = selectedAgentId;

  const [drawMode, setDrawMode]       = useState<DrawMode>(setupMode ? 'drawing' : 'idle');
  const [vertices, setVertices]       = useState<LngLat[]>([]);
  const [districtIds, setDistrictIds] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState('');

  const drawModeRef  = useRef<DrawMode>(setupMode ? 'drawing' : 'idle');
  const verticesRef  = useRef<LngLat[]>([]);
  const nearFirstRef = useRef(false);
  const lastClickRef = useRef<number>(0);
  drawModeRef.current = drawMode;
  verticesRef.current = vertices;


  const initialCenterRef = useRef<[number, number] | null>(
    mapCenter ? [mapCenter.lon, mapCenter.lat] : null,
  );

  const updateDrawLayers = useCallback((verts: LngLat[], mouse: LngLat | null) => {
    const map = mapRef.current;
    if (!map || !map.getSource('_draw-polygon')) return;
    const poly    = verts.length >= 3 ? polygonGeoJSON(verts) : EMPTY_POLYGON;
    // Preview line always closes back to verts[0] so it looks like a closing polygon
    const preview = mouse && verts.length >= 1
      ? lineGeoJSON([...verts, mouse, verts[0]])
      : verts.length >= 2 ? lineGeoJSON([...verts, verts[0]]) : EMPTY_LINE;
    const pts = pointsGeoJSON(verts);
    (map.getSource('_draw-polygon')  as maplibregl.GeoJSONSource).setData(poly);
    (map.getSource('_draw-preview')  as maplibregl.GeoJSONSource).setData(preview);
    (map.getSource('_draw-vertices') as maplibregl.GeoJSONSource).setData(pts);
  }, []);

  const closePolygon = useCallback((verts: LngLat[], allAgents: Agent[]) => {
    if (verts.length < 3) return;
    drawModeRef.current = 'selected';
    nearFirstRef.current = false;
    updateDrawLayers(verts, null);
    const map = mapRef.current;
    if (map?.getSource('_draw-snap-dot')) {
      (map.getSource('_draw-snap-dot') as maplibregl.GeoJSONSource).setData(EMPTY_POINTS);
    }
    if (map) map.getCanvas().style.cursor = '';
    const inside = new Set(allAgents.filter(a => pointInPolygon(a.lon, a.lat, verts)).map(a => a.id));
    setDistrictIds(inside);
    setDrawMode('selected');
  }, [updateDrawLayers]);

  const clearDistrict = useCallback(() => {
    const nextMode: DrawMode = setupMode ? 'drawing' : 'idle';
    drawModeRef.current = nextMode;
    nearFirstRef.current = false;
    setVertices([]);
    setDistrictIds(new Set());
    setDrawMode(nextMode);
    updateDrawLayers([], null);
    const map = mapRef.current;
    if (map?.getSource('_draw-snap-dot')) {
      (map.getSource('_draw-snap-dot') as maplibregl.GeoJSONSource).setData(EMPTY_POINTS);
    }
    if (map) map.getCanvas().style.cursor = nextMode === 'drawing' ? 'crosshair' : '';
  }, [updateDrawLayers, setupMode]);

  // ── Map initialisation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const startCenter: [number, number] = initialCenterRef.current ?? [0, 20];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: startCenter,
      zoom: DEFAULT_ZOOM,
      minZoom: 10,
      maxZoom: 19,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      // Persistent neighborhood boundary shown after generation
      map.addSource('_neighborhood', { type: 'geojson', data: EMPTY_POLYGON });
      map.addLayer({ id: '_neighborhood-fill',   type: 'fill', source: '_neighborhood',
        paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.12 } });
      map.addLayer({ id: '_neighborhood-border', type: 'line', source: '_neighborhood',
        paint: { 'line-color': '#818cf8', 'line-width': 2.5, 'line-dasharray': [5, 3] } });

      // POI flash source (populated when a shock scenario is selected)
      map.addSource('_poi-flash', { type: 'geojson', data: EMPTY_POINTS });
      map.addLayer({ id: '_poi-flash-circle', type: 'circle', source: '_poi-flash',
        paint: { 'circle-radius': 18, 'circle-color': '#f59e0b', 'circle-opacity': 0.0, 'circle-stroke-color': '#f59e0b', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.0 } });

      map.addSource('_draw-polygon',  { type: 'geojson', data: EMPTY_POLYGON });
      map.addSource('_draw-preview',  { type: 'geojson', data: EMPTY_LINE });
      map.addSource('_draw-vertices', { type: 'geojson', data: EMPTY_POINTS });
      map.addSource('_draw-snap-dot', { type: 'geojson', data: EMPTY_POINTS });

      map.addLayer({ id: '_draw-fill',         type: 'fill',   source: '_draw-polygon',
        paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.12 } });
      map.addLayer({ id: '_draw-border',       type: 'line',   source: '_draw-polygon',
        paint: { 'line-color': '#818cf8', 'line-width': 2.5, 'line-dasharray': [5, 3] } });
      map.addLayer({ id: '_draw-preview-line', type: 'line',   source: '_draw-preview',
        paint: { 'line-color': '#818cf8', 'line-width': 1.5, 'line-opacity': 0.6, 'line-dasharray': [3, 3] } });
      map.addLayer({ id: '_draw-dots',         type: 'circle', source: '_draw-vertices',
        paint: { 'circle-radius': 5, 'circle-color': '#818cf8', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: '_draw-snap-dot-layer', type: 'circle', source: '_draw-snap-dot',
        paint: { 'circle-radius': 8, 'circle-color': '#fff', 'circle-stroke-color': '#818cf8', 'circle-stroke-width': 2 } });

      // ── Agent canvas layers (GeoJSON circles — no DOM, perfect zoom) ──────────
      map.addSource('_agents', { type: 'geojson', data: EMPTY_POINTS });

      // Build 9-slice stretchable rounded-rect image for label backgrounds
      const LBL_W = 30, LBL_H = 22, LBL_R = 7;
      const lblCanvas = document.createElement('canvas');
      lblCanvas.width = LBL_W; lblCanvas.height = LBL_H;
      const lctx = lblCanvas.getContext('2d')!;
      lctx.clearRect(0, 0, LBL_W, LBL_H);
      lctx.fillStyle = 'rgba(8,11,24,0.88)';
      lctx.beginPath();
      lctx.moveTo(LBL_R, 0); lctx.lineTo(LBL_W - LBL_R, 0);
      lctx.arcTo(LBL_W, 0, LBL_W, LBL_R, LBL_R);
      lctx.lineTo(LBL_W, LBL_H - LBL_R);
      lctx.arcTo(LBL_W, LBL_H, LBL_W - LBL_R, LBL_H, LBL_R);
      lctx.lineTo(LBL_R, LBL_H);
      lctx.arcTo(0, LBL_H, 0, LBL_H - LBL_R, LBL_R);
      lctx.lineTo(0, LBL_R);
      lctx.arcTo(0, 0, LBL_R, 0, LBL_R);
      lctx.closePath();
      lctx.fill();
      lctx.strokeStyle = 'rgba(99,102,241,0.3)';
      lctx.lineWidth = 1;
      lctx.stroke();
      const lblData = lctx.getImageData(0, 0, LBL_W, LBL_H);
      map.addImage('_label-bg', { width: LBL_W, height: LBL_H, data: lblData.data }, {
        stretchX: [[LBL_R + 2, LBL_W - LBL_R - 2]],
        stretchY: [[LBL_R + 2, LBL_H - LBL_R - 2]],
        content:  [3, 3, LBL_W - 3, LBL_H - 3],
        pixelRatio: 1,
      });

      // Selection ring
      map.addLayer({ id: '_agent-ring', type: 'circle', source: '_agents',
        filter: ['==', ['get', 'selected'], true],
        paint: {
          'circle-radius': 22,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': 'rgba(255,255,255,0.45)',
        },
      });

      // Outer ring for activated (moving) agents — larger, more transparent
      map.addLayer({ id: '_agent-activated', type: 'circle', source: '_agents',
        filter: ['==', ['get', 'moving'], true],
        paint: {
          'circle-radius': 30,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': ['case',
            ['==', ['get', 'stance'], 'agree'],    'rgba(74,222,128,0.55)',
            ['==', ['get', 'stance'], 'disagree'], 'rgba(248,113,113,0.55)',
            'rgba(251,191,36,0.55)',
          ],
        },
      });

      // Soft glow behind each dot (stance-coloured, blurred)
      map.addLayer({ id: '_agent-glow', type: 'circle', source: '_agents',
        paint: {
          'circle-radius': 22,
          'circle-blur': 0.65,
          'circle-color': ['case',
            ['==', ['get', 'stance'], 'agree'],    '#4ade80',
            ['==', ['get', 'stance'], 'disagree'], '#f87171',
            '#fbbf24',
          ],
          'circle-opacity': 0.35,
        },
      });

      // Main dot
      map.addLayer({ id: '_agent-dots', type: 'circle', source: '_agents',
        paint: {
          'circle-radius': 13,
          'circle-color': ['case',
            ['==', ['get', 'stance'], 'agree'],    '#4ade80',
            ['==', ['get', 'stance'], 'disagree'], '#f87171',
            '#fbbf24',
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': 'rgba(255,255,255,0.9)',
          'circle-opacity': 1,
        },
      });

      // Agent name labels — dark rounded-rect box, culled when overlapping
      map.addLayer({ id: '_agent-labels', type: 'symbol', source: '_agents',
        layout: {
          'icon-image': '_label-bg',
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [4, 8, 4, 8],
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-offset': [0, 2.2],
          'text-anchor': 'top',
          'text-font': ['Open Sans Bold', 'Noto Sans Bold'],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#a5b4fc',
          'icon-opacity': 0.93,
        },
      });

      // Click / hover on agent dots
      map.on('click', '_agent-dots', (e) => {
        if (drawModeRef.current === 'drawing') return;
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        const agent = agentsRef.current.find(a => a.id === id);
        if (agent) onSelectRef.current(agent);
      });
      map.on('mouseenter', '_agent-dots', (e) => {
        if (drawModeRef.current === 'drawing') return;
        map.getCanvas().style.cursor = 'pointer';

        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        const agent = agentsRef.current.find(a => a.id === id);
        if (!agent) return;

        hoverPopupRef.current?.remove();

        const moving = agent.activated && agent.destination_lat != null && !agent.journey_complete;
        const atDest = moving && agent.journey_day >= agent.total_journey_days && agent.journey_day < agent.total_journey_days + 2;
        const returning = moving && agent.journey_day >= agent.total_journey_days + 2;
        const phase = returning ? 'Heading home'
                    : atDest   ? `At ${agent.destination_name}`
                    : moving   ? `Day ${agent.journey_day} → ${agent.destination_name}`
                    : '';

        const html = `<div style="font-family:system-ui,sans-serif;font-size:12px;color:#e2e8f0;line-height:1.5;">
          <div style="font-weight:700;margin-bottom:2px;">${agent.name}</div>
          <div style="color:#64748b;font-size:11px;">${agent.occupation ?? ''}</div>
          ${phase ? `<div style="color:#818cf8;font-size:11px;margin-top:4px;">${phase}</div>` : ''}
          ${moving && agent.movement_intent ? `<div style="color:#475569;font-size:10px;font-style:italic;margin-top:2px;">${agent.movement_intent}</div>` : ''}
        </div>`;

        hoverPopupRef.current = new maplibregl.Popup({
          closeButton: false, closeOnClick: false, offset: 16, maxWidth: '220px',
        }).setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on('mouseleave', '_agent-dots', () => {
        map.getCanvas().style.cursor = drawModeRef.current === 'drawing' ? 'crosshair' : '';
        hoverPopupRef.current?.remove();
        hoverPopupRef.current = null;
      });
    });

    map.on('click', (e) => {
      if (drawModeRef.current !== 'drawing') return;

      // Debounce: second click of a double-click arrives < 300ms after the first
      const now = Date.now();
      if (now - lastClickRef.current < 300) return;
      lastClickRef.current = now;

      // Snap-to-close: click near first vertex closes the polygon
      if (nearFirstRef.current && verticesRef.current.length >= 3) {
        closePolygon(verticesRef.current, agentsRef.current);
        return;
      }

      const newVert: LngLat = [e.lngLat.lng, e.lngLat.lat];
      const updated = [...verticesRef.current, newVert];
      verticesRef.current = updated;
      setVertices(updated);
    });

    map.on('dblclick', (e) => {
      if (drawModeRef.current !== 'drawing') return;
      e.preventDefault();
      // Do NOT add a vertex — just close with the existing vertices
      closePolygon(verticesRef.current, agentsRef.current);
    });

    map.on('mousemove', (e) => {
      if (drawModeRef.current !== 'drawing') return;
      const verts = verticesRef.current;
      updateDrawLayers(verts, [e.lngLat.lng, e.lngLat.lat]);

      if (verts.length >= 3 && map.getSource('_draw-snap-dot')) {
        const firstPx  = map.project(verts[0] as [number, number]);
        const dx = e.point.x - firstPx.x;
        const dy = e.point.y - firstPx.y;
        const near = Math.sqrt(dx * dx + dy * dy) < 18;
        nearFirstRef.current = near;
        map.getCanvas().style.cursor = near ? 'pointer' : 'crosshair';
        (map.getSource('_draw-snap-dot') as maplibregl.GeoJSONSource).setData(
          near ? pointsGeoJSON([verts[0]]) : EMPTY_POINTS,
        );
      }
    });

    mapRef.current = map;
    return () => {
      for (const m of poiMarkersRef.current) m.remove();
      poiMarkersRef.current = [];
      for (const m of flashMarkersRef.current) m.remove();
      flashMarkersRef.current = [];
      for (const m of shockTextMarkersRef.current) m.remove();
      shockTextMarkersRef.current = [];
      for (const m of thinkingMarkersRef.current) m.remove();
      thinkingMarkersRef.current = [];
      for (const m of emojiMarkersRef.current.values()) m.remove();
      emojiMarkersRef.current.clear();
      emojiElementsRef.current.clear();
      hoverPopupRef.current?.remove();
      spotlightMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { updateDrawLayers(vertices, null); }, [vertices, updateDrawLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = drawMode === 'drawing' ? 'crosshair' : '';
  }, [drawMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clearDistrict(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearDistrict]);

  useEffect(() => {
    if (!setupMode) {
      // Direct reset — avoids stale closure from clearDistrict
      drawModeRef.current = 'idle';
      nearFirstRef.current = false;
      setDrawMode('idle');
      setVertices([]);
      setDistrictIds(new Set());
      const map = mapRef.current;
      if (map) {
        map.getCanvas().style.cursor = '';
        if (map.getSource('_draw-snap-dot'))
          (map.getSource('_draw-snap-dot') as maplibregl.GeoJSONSource).setData(EMPTY_POINTS);
        updateDrawLayers([], null);
      }
      setTimeout(() => mapRef.current?.resize(), 100);
    }
  }, [setupMode, updateDrawLayers]);

  // Fly to map center
  const mapCenterAppliedRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapCenter) return;
    const move = () => {
      if (!mapCenterAppliedRef.current) {
        map.jumpTo({ center: [mapCenter.lon, mapCenter.lat], zoom: DEFAULT_ZOOM });
        mapCenterAppliedRef.current = true;
      } else {
        map.flyTo({ center: [mapCenter.lon, mapCenter.lat], zoom: DEFAULT_ZOOM, duration: 900 });
      }
    };
    if (map.loaded()) move(); else map.once('load', move);
  }, [mapCenter]);

  // ── Neighborhood boundary persistence ────────────────────────────────────────
  // Note: do NOT use map.loaded() + map.once('load') here — 'load' only fires
  // once on initial map load. If this effect runs during a flyTo (map.loaded()
  // === false), the once('load') listener would never fire.  GeoJSON sources
  // accept setData() at any time regardless of tile state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('_neighborhood') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(neighborhoodBoundary ? polygonGeoJSON(neighborhoodBoundary as LngLat[]) : EMPTY_POLYGON);
    } else {
      // Source not yet added (map hasn't fired 'load') — wait for it
      const onLoad = () => {
        const s = map.getSource('_neighborhood') as maplibregl.GeoJSONSource | undefined;
        if (s) s.setData(neighborhoodBoundary ? polygonGeoJSON(neighborhoodBoundary as LngLat[]) : EMPTY_POLYGON);
      };
      map.once('load', onLoad);
      return () => { map.off('load', onLoad); };
    }
  }, [neighborhoodBoundary]);

  // ── Shared POI matcher: keywords first, text fallback ────────────────────────
  const matchPOIs = useCallback((keywords: string[], text: string): POI[] => {
    if (!pois.length) return [];
    if (keywords.length) {
      const kws = keywords.map(k => k.toLowerCase());
      const hit = pois.filter(p => {
        const pn = p.name.toLowerCase();
        return kws.some(kw => pn.includes(kw) || kw.includes(pn));
      });
      if (hit.length) return hit;
    }
    if (!text) return [];
    const stopwords = new Set(['the','a','an','at','in','on','to','of','and','or','for','is','are','will','that','this','with','from','has','been']);
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopwords.has(w));
    return pois.filter(p => {
      const pn = p.name.toLowerCase();
      return words.some(w => pn.includes(w));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pois]);

  // ── POI highlight: keyword-based (fires when scenario card is selected) ────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of poiMarkersRef.current) m.remove();
    poiMarkersRef.current = [];

    if (!pois.length || (!selectedShockKeywords.length && !selectedShockText)) return;

    const matched = matchPOIs(selectedShockKeywords, selectedShockText);
    if (!matched.length) return;

    const addMarkers = () => {
      for (const poi of matched) {
        const outer = document.createElement('div');
        outer.style.cssText = 'position:relative;width:0;height:0;pointer-events:none;';
        const ring = document.createElement('div');
        ring.className = '_poi-ring';
        outer.appendChild(ring);
        const dot = document.createElement('div');
        dot.className = '_poi-dot';
        outer.appendChild(dot);
        poiMarkersRef.current.push(
          new maplibregl.Marker({ element: outer, anchor: 'center' })
            .setLngLat([poi.lon, poi.lat])
            .addTo(map)
        );
      }
    };

    if (map.loaded()) addMarkers(); else map.once('load', addMarkers);
  }, [selectedShockKeywords, selectedShockText, matchPOIs]);

  // ── Red flash on shock card click ────────────────────────────────────────────
  const flashMarkersRef = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    if (!shockFlashTrigger || !pois.length) return;
    const map = mapRef.current;
    if (!map) return;

    const matched = matchPOIs(selectedShockKeywords, selectedShockText);
    if (!matched.length) return;

    for (const m of flashMarkersRef.current) m.remove();
    flashMarkersRef.current = [];

    const addFlash = () => {
      for (const poi of matched) {
        const outer = document.createElement('div');
        outer.style.cssText = 'position:relative;width:0;height:0;pointer-events:none;';
        for (let i = 0; i < 3; i++) {
          const ring = document.createElement('div');
          ring.className = '_shock-flash-ring';
          ring.style.animationDelay = `${i * 0.13}s`;
          outer.appendChild(ring);
        }
        flashMarkersRef.current.push(
          new maplibregl.Marker({ element: outer, anchor: 'center' })
            .setLngLat([poi.lon, poi.lat])
            .addTo(map)
        );
      }
      setTimeout(() => {
        for (const m of flashMarkersRef.current) m.remove();
        flashMarkersRef.current = [];
      }, 1400);
    };

    if (map.loaded()) addFlash(); else map.once('load', addFlash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shockFlashTrigger, matchPOIs]);

  // ── POI highlight: text-based fallback (fires on shock injection) ─────────────
  // Only active for custom shocks where no poi_keywords were specified.
  const shockTextMarkersRef = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of shockTextMarkersRef.current) m.remove();
    shockTextMarkersRef.current = [];

    // Only run when there's a shock but NO keyword-based markers (custom shock path)
    if (!currentShock || selectedShockKeywords.length || !pois.length) return;

    const stopwords = new Set(['the','a','an','at','in','on','to','of','and','or','for','is','are','will','that','this','with','from','has','have','been','by','it','its','as','be']);
    const shockWords = currentShock.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopwords.has(w));
    const matched = pois.filter(p => {
      const pn = p.name.toLowerCase();
      return shockWords.some(w => pn.includes(w));
    });
    if (!matched.length) return;

    const addMarkers = () => {
      for (const poi of matched) {
        const outer = document.createElement('div');
        outer.style.cssText = 'position:relative;width:0;height:0;pointer-events:none;';
        const ring = document.createElement('div');
        ring.className = '_poi-ring';
        outer.appendChild(ring);
        const dot = document.createElement('div');
        dot.className = '_poi-dot';
        outer.appendChild(dot);
        shockTextMarkersRef.current.push(
          new maplibregl.Marker({ element: outer, anchor: 'center' })
            .setLngLat([poi.lon, poi.lat])
            .addTo(map)
        );
      }
    };

    if (map.loaded()) addMarkers(); else map.once('load', addMarkers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShock]);

  // ── Track activation times & manage emoji markers on each snapshot ───────────
  useEffect(() => {
    if (setupMode) {
      agentStartTimesRef.current.clear();
      for (const m of emojiMarkersRef.current.values()) m.remove();
      emojiMarkersRef.current.clear();
      return;
    }
    const map = mapRef.current;
    const now = performance.now();

    for (const a of agents) {
      const moving = a.activated && a.destination_lat != null && !a.journey_complete;

      if (moving) {
        // Record when this agent first started moving (only once per journey)
        if (!agentStartTimesRef.current.has(a.id)) {
          agentStartTimesRef.current.set(a.id, now);
        }
        // Create emoji marker if needed
        if (map && !emojiMarkersRef.current.has(a.id)) {
          const emoji = a.shock_stance === 'disagree' ? '📢'
                      : a.shock_stance === 'agree'    ? '🙋'
                      : '🚶';
          const el = document.createElement('div');
          el.style.cssText = 'font-size:15px;line-height:1;pointer-events:none;user-select:none;';
          el.textContent = emoji;
          const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -18] })
            .setLngLat([a.current_lon ?? a.lon, a.current_lat ?? a.lat])
            .addTo(map);
          emojiMarkersRef.current.set(a.id, marker);
          emojiElementsRef.current.set(a.id, el);
        }
      } else {
        // Journey ended — clean up
        agentStartTimesRef.current.delete(a.id);
        const em = emojiMarkersRef.current.get(a.id);
        if (em) { em.remove(); emojiMarkersRef.current.delete(a.id); emojiElementsRef.current.delete(a.id); }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, setupMode]);

  // ── RAF loop: per-agent organic continuous movement ───────────────────────────
  // Each agent moves at their own personal speed, with a subtle sinusoidal wander.
  // Position is computed from first principles (start time + speed) rather than
  // interpolating between backend snapshots — this makes movement feel human.
  useEffect(() => {
    let rafId: number;
    const DEST_STAY_DAYS = 2;
    const BASE_DAY_MS    = 20000; // matches backend tick interval

    const loop = (now: number) => {
      const map = mapRef.current;
      const src = map?.getSource('_agents') as maplibregl.GeoJSONSource | undefined;

      if (src && !setupModeRef.current && agentsRef.current.length > 0) {
        const features: GeoJSON.Feature[] = [];

        for (const a of agentsRef.current) {
          if (a.lat == null) continue;

          const moving = a.activated && a.destination_lat != null && !a.journey_complete;
          let lon: number, lat: number;

          if (moving) {
            const startTime  = agentStartTimesRef.current.get(a.id) ?? now;
            const speed      = personalSpeed(a.id);
            const totalDays  = (a.total_journey_days * 2) + DEST_STAY_DAYS;
            const totalMs    = (totalDays * BASE_DAY_MS) / speed;
            const progress   = Math.min(1, (now - startTime) / totalMs);

            const goFrac   = a.total_journey_days / totalDays;
            const stayFrac = DEST_STAY_DAYS / totalDays;
            const dLon     = a.destination_lon!;
            const dLat     = a.destination_lat!;

            if (progress <= goFrac) {
              const t = ease(progress / goFrac);
              lon = a.lon + t * (dLon - a.lon);
              lat = a.lat + t * (dLat - a.lat);
            } else if (progress <= goFrac + stayFrac) {
              lon = dLon; lat = dLat;
            } else {
              const t = ease(Math.min(1, (progress - goFrac - stayFrac) / goFrac));
              lon = dLon + t * (a.lon - dLon);
              lat = dLat + t * (a.lat - dLat);
            }

            // Organic micro-wander perpendicular to path
            const [wx, wy] = wanderOffset(a.id, now);
            lon += wx; lat += wy;

            const em = emojiMarkersRef.current.get(a.id);
            if (em) {
              em.setLngLat([lon, lat]);
              // Update emoji based on journey phase
              const el = emojiElementsRef.current.get(a.id);
              if (el) {
                const returning = progress > goFrac + stayFrac;
                const atDest    = progress > goFrac && progress <= goFrac + stayFrac;
                const next = returning ? '🏠'
                           : atDest    ? '📍'
                           : a.shock_stance === 'disagree' ? '📢'
                           : a.shock_stance === 'agree'    ? '🙋'
                           : '🚶';
                if (el.textContent !== next) el.textContent = next;
              }
            }
          } else {
            lon = a.current_lon ?? a.lon;
            lat = a.current_lat ?? a.lat;
          }

          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: {
              id: a.id,
              name: a.name ?? '',
              stance: a.shock_stance ?? 'neutral',
              selected: a.id === selectedIdRef.current,
              activated: a.activated ?? false,
              moving,
            },
          });
        }

        src.setData({ type: 'FeatureCollection', features });
      } else if (src && (setupModeRef.current || agentsRef.current.length === 0)) {
        src.setData(EMPTY_POINTS);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Shock-pending pulse animation ─────────────────────────────────────────────
  const pulseRafRef = useRef<number | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!shockPending || !map) {
      if (pulseRafRef.current) { cancelAnimationFrame(pulseRafRef.current); pulseRafRef.current = null; }
      if (map?.getLayer('_agent-dots')) map.setPaintProperty('_agent-dots', 'circle-opacity', 1);
      if (map?.getLayer('_agent-glow')) map.setPaintProperty('_agent-glow', 'circle-opacity', 0.28);
      return;
    }
    let t = 0;
    const tick = () => {
      t += 0.055;
      const opacity = 0.45 + 0.55 * (Math.sin(t) * 0.5 + 0.5);
      const glowOpacity = 0.12 + 0.2 * (Math.sin(t) * 0.5 + 0.5);
      try {
        map.setPaintProperty('_agent-dots', 'circle-opacity', opacity);
        map.setPaintProperty('_agent-glow', 'circle-opacity', glowOpacity);
      } catch { /* layer not ready */ }
      pulseRafRef.current = requestAnimationFrame(tick);
    };
    pulseRafRef.current = requestAnimationFrame(tick);
    return () => { if (pulseRafRef.current) { cancelAnimationFrame(pulseRafRef.current); pulseRafRef.current = null; } };
  }, [shockPending]);

  // ── Thinking ring markers (shown while shock is pending) ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    // Remove old thinking markers
    for (const m of thinkingMarkersRef.current) m.remove();
    thinkingMarkersRef.current = [];

    if (!shockPending || !map) return;

    // Create spinning ring marker for each agent with null stance
    const pending = agents.filter(a => a.shock_stance === null && a.lat != null && a.lon != null);
    for (const agent of pending) {
      const el = document.createElement('div');
      el.style.cssText = 'position:relative;width:0;height:0;pointer-events:none;';
      const ring = document.createElement('div');
      ring.className = '_think-ring';
      el.appendChild(ring);
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([agent.lon, agent.lat])
        .addTo(map);
      thinkingMarkersRef.current.push(marker);
    }

    return () => {
      for (const m of thinkingMarkersRef.current) m.remove();
      thinkingMarkersRef.current = [];
    };
  }, [shockPending, agents]);

  useEffect(() => {
    const map = mapRef.current;
    spotlightMarkerRef.current?.remove();
    spotlightMarkerRef.current = null;
    if (!spotlightPOI || !map) return;

    map.flyTo({ center: [spotlightPOI.lon, spotlightPOI.lat], zoom: 17, duration: 700, essential: true });

    const outer = document.createElement('div');
    outer.style.cssText = 'position:relative;width:0;height:0;pointer-events:none;';

    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('div');
      ring.className = '_spotlight-ring';
      ring.style.animationDelay = `${i * 0.28}s`;
      ring.style.animationIterationCount = '1';
      outer.appendChild(ring);
    }

    const dot = document.createElement('div');
    dot.className = '_spotlight-dot';
    outer.appendChild(dot);

    const marker = new maplibregl.Marker({ element: outer, anchor: 'center' })
      .setLngLat([spotlightPOI.lon, spotlightPOI.lat])
      .addTo(map);
    spotlightMarkerRef.current = marker;

    const t = setTimeout(() => { spotlightMarkerRef.current?.remove(); spotlightMarkerRef.current = null; }, 3500);
    return () => { clearTimeout(t); spotlightMarkerRef.current?.remove(); spotlightMarkerRef.current = null; };
  }, [spotlightPOI]);

  const zoomBtn: React.CSSProperties = {
    width: 32, height: 32,
    backgroundColor: 'rgba(255,255,255,0.95)',
    border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: 6, cursor: 'pointer',
    fontSize: 18, fontWeight: 400, color: '#374151',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    transition: 'background 0.1s',
    lineHeight: 1,
    fontFamily: 'system-ui, sans-serif',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <style>{`
        @keyframes _poiRing {
          0%   { width:6px;  height:6px;  top:-3px;  left:-3px;  opacity:0; }
          12%  { opacity:1; }
          100% { width:46px; height:46px; top:-23px; left:-23px; opacity:0; }
        }
        @keyframes _poiDot {
          0%,58% { opacity:0; transform:scale(0); }
          72%    { opacity:1; transform:scale(1.3); }
          100%   { opacity:1; transform:scale(1); }
        }
        ._poi-ring {
          position:absolute; border-radius:50%;
          border:2px solid #ef4444;
          animation: _poiRing 0.8s cubic-bezier(0.2,0,0.4,1) forwards;
        }
        ._poi-dot {
          position:absolute; width:8px; height:8px;
          top:-4px; left:-4px; border-radius:50%;
          background:#ef4444;
          box-shadow:0 0 5px #ef444488;
          animation: _poiDot 0.8s ease-out forwards;
        }
        @keyframes _spotlightRing {
          0%   { width:8px;  height:8px;  top:-4px;  left:-4px;  opacity:0; }
          10%  { opacity:1; }
          100% { width:56px; height:56px; top:-28px; left:-28px; opacity:0; }
        }
        ._spotlight-ring {
          position:absolute; border-radius:50%;
          border: 2.5px solid #818cf8;
          animation: _spotlightRing 0.9s cubic-bezier(0.2,0,0.35,1) forwards;
          animation-iteration-count: 3;
        }
        ._spotlight-dot {
          position:absolute; width:10px; height:10px;
          top:-5px; left:-5px; border-radius:50%;
          background: #818cf8;
          box-shadow: 0 0 8px #818cf8aa;
        }
        @keyframes _shockFlashRing {
          0%   { width:6px;  height:6px;  top:-3px;  left:-3px;  opacity:0.9; }
          30%  { opacity:1; }
          100% { width:90px; height:90px; top:-45px; left:-45px; opacity:0; }
        }
        ._shock-flash-ring {
          position:absolute; border-radius:50%;
          border:3px solid #ef4444;
          box-shadow:0 0 12px #ef444466;
          animation: _shockFlashRing 0.65s cubic-bezier(0.1,0,0.25,1) forwards;
        }
        @keyframes _thinkRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        ._think-ring {
          position: absolute;
          width: 44px; height: 44px;
          top: -22px; left: -22px;
          border-radius: 50%;
          border: 2.5px solid rgba(139,92,246,0.18);
          border-top-color: #a78bfa;
          border-right-color: rgba(167,139,250,0.55);
          animation: _thinkRing 0.85s linear infinite;
          pointer-events: none;
          box-shadow: 0 0 10px rgba(139,92,246,0.35);
        }
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%', filter: 'brightness(0.72) saturate(1.15)' }} />

      {/* ── Zoom controls ── */}
      <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          style={zoomBtn}
          onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.95)')}
          title="Zoom in"
        >+</button>
        <button
          style={zoomBtn}
          onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.95)')}
          title="Zoom out"
        >−</button>
      </div>

      {/* ── Draw toolbar ── */}
      <div style={{ position: 'absolute', top: 14, right: 60, zIndex: 10, display: 'flex', gap: 6 }}>
        {drawMode === 'idle' && (
          <button
            onClick={() => { setDrawMode('drawing'); setVertices([]); updateDrawLayers([], null); }}
            title="Draw a district boundary"
            style={{
              backgroundColor: 'rgba(10,12,28,0.92)', border: '1px solid #334155',
              borderRadius: 8, color: '#94a3b8', padding: '8px 14px',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLButtonElement).style.color = '#c7d2fe'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#334155'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="2,10 7,2 12,10" />
              <circle cx="2" cy="10" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="7"  cy="2"  r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="10" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            Draw District
          </button>
        )}

        {drawMode === 'drawing' && (
          <div style={{
            backgroundColor: 'rgba(4,6,16,0.93)', border: '1px solid #2d3348',
            borderRadius: 8, color: '#64748b', padding: '8px 14px',
            fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#4f5a7a' }} />
            {vertices.length === 0 ? 'Click to place first point' : `${vertices.length} point${vertices.length > 1 ? 's' : ''} · double-click to close`}
            <button onClick={clearDistrict} style={{ background: 'none', border: 'none', color: '#4f5a7a', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0 }}>✕</button>
          </div>
        )}

        {drawMode === 'selected' && (
          <button
            onClick={clearDistrict}
            style={{
              backgroundColor: 'rgba(99,102,241,0.12)', border: '1px solid #4f46e5',
              borderRadius: 8, color: '#a5b4fc', padding: '8px 14px',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
              <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
            </svg>
            Clear District
          </button>
        )}
      </div>

      {/* ── Setup mode: generate agents panel ── */}
      {setupMode && drawMode === 'selected' && (
        <div style={{
          position: 'absolute', bottom: 160, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, width: 420, maxWidth: '90vw',
          backgroundColor: 'rgba(10,12,24,0.97)',
          border: '1px solid #4f46e5',
          borderRadius: 12, padding: '18px 20px',
          boxShadow: '0 0 40px rgba(99,102,241,0.3), 0 12px 32px rgba(0,0,0,0.8)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Boundary set</span>
            </div>
            <button onClick={clearDistrict} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: '2px 4px' }}>✕</button>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px', lineHeight: 1.6 }}>
            Optionally describe what kind of community to simulate — or leave blank and the system will infer from the location.
          </p>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.metaKey && !generating)
                onBoundaryGenerate?.(description.trim() || 'A diverse urban neighborhood community', verticesRef.current as [number, number][]);
            }}
            placeholder="Optional: e.g. a working-class district facing a proposed highway expansion…"
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              backgroundColor: '#0d1425', border: '1px solid #1e3a5f',
              borderRadius: 8, padding: '9px 11px',
              fontSize: 12, color: '#e2e8f0', outline: 'none',
              fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5, marginBottom: 12,
            }}
            onFocus={e => (e.target.style.borderColor = '#4f46e5')}
            onBlur={e => (e.target.style.borderColor = '#1e3a5f')}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={clearDistrict} style={{
              flex: '0 0 auto', backgroundColor: 'transparent',
              border: '1px solid #1e293b', borderRadius: 7,
              color: '#475569', padding: '9px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>Redraw</button>
            <button
              onClick={() => { if (!generating) onBoundaryGenerate?.(description.trim() || 'A diverse urban neighborhood community', verticesRef.current as [number, number][]); }}
              disabled={generating}
              style={{
                flex: 1, backgroundColor: !generating ? '#4f46e5' : '#1e1b4b',
                border: 'none', borderRadius: 7, color: generating ? '#6366f1' : '#fff',
                padding: '9px 16px', cursor: !generating ? 'pointer' : 'default',
                fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                transition: 'background 0.15s',
              }}
            >
              {generating ? 'Generating agents…' : 'Generate 40 Agents →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Stance legend ── */}
      {drawMode === 'idle' && (
        <div style={{
          position: 'absolute', bottom: 42, right: 12, zIndex: 5,
          backgroundColor: 'rgba(8,11,24,0.86)',
          border: '1px solid rgba(99,102,241,0.18)',
          borderRadius: 8, padding: '8px 12px',
          display: 'flex', flexDirection: 'column', gap: 7,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
          fontFamily: 'system-ui, sans-serif',
        }}>
          {([
            { color: '#4ade80', label: 'Agree' },
            { color: '#fbbf24', label: 'Neutral' },
            { color: '#f87171', label: 'Disagree' },
          ]).map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: color, flexShrink: 0,
                boxShadow: `0 0 5px ${color}99`,
              }} />
              <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .maplibregl-ctrl-bottom-right { bottom:8px !important; right:8px !important; }
        .maplibregl-popup-content { background:#0d1425 !important; border:1px solid #1e293b !important; border-radius:8px !important; padding:10px 12px !important; box-shadow:0 4px 20px rgba(0,0,0,0.6) !important; }
        .maplibregl-popup-tip { display:none !important; }
      `}</style>
    </div>
  );
}
