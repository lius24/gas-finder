import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, DARK, LIGHT } from '@protomaps/basemaps';

import { stationMarkers } from '@core/atlas-markers';
import type { AnnotatedStation } from '@core/decision-math';
import type { Coords } from '@core/adapters/geolocation';

import 'maplibre-gl/dist/maplibre-gl.css';
import './MapView.css';

const BASEMAP_URL = import.meta.env.EXPO_PUBLIC_BASEMAP_URL;
if (!BASEMAP_URL) throw new Error('EXPO_PUBLIC_BASEMAP_URL is not set');

// Register the pmtiles:// protocol once for the whole app.
// Guard against Vite HMR double-registration on hot-reload.
const protocol = new Protocol();
let _pmtilesRegistered = false;
if (!_pmtilesRegistered) {
  // pmtiles v4 tile is a V3OrV4Protocol — cast to satisfy maplibre-gl v5's
  // AddProtocolAction (same runtime behavior, slightly different type shape).
  maplibregl.addProtocol('pmtiles', protocol.tile as Parameters<typeof maplibregl.addProtocol>[1]);
  _pmtilesRegistered = true;
}

const DEFAULT_ZOOM = 12;

// @protomaps/basemaps v5: layers(source, flavorObject, { lang }).
function buildStyle(theme: 'dark' | 'light'): maplibregl.StyleSpecification {
  const flavor = theme === 'dark' ? DARK : LIGHT;
  return {
    version: 8,
    glyphs:
      'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${BASEMAP_URL}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers('protomaps', flavor, { lang: 'en' }),
  };
}

type Props = {
  stations: AnnotatedStation[];
  cheapestId: string | null;
  center: Coords | null;
  theme: 'dark' | 'light';
  onStationClick: (id: string) => void;
};

export function MapView({ stations, cheapestId, center, theme, onStationClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Keep the latest click handler without re-running the marker effect.
  const onClickRef = useRef(onStationClick);
  onClickRef.current = onStationClick;
  // Tracks the theme currently applied to the map, so the theme effect only
  // calls setStyle on a real change — not on mount (the init effect already
  // applied it) and not on React StrictMode's double-invoke.
  const appliedTheme = useRef(theme);
  // The "your location" dot, pinned at the active center.
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(theme),
      center: center ? [center.longitude, center.latitude] : [-73.69, 42.73],
      zoom: DEFAULT_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Center/theme are applied by the effects below; init runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter on the active location and pin it with a "your location" dot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const lngLat: [number, number] = [center.longitude, center.latitude];
    map.flyTo({ center: lngLat, zoom: DEFAULT_ZOOM });
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat(lngLat);
    } else {
      const el = document.createElement('div');
      el.className = 'atlas-userdot';
      el.setAttribute('aria-label', 'Your location');
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(map);
    }
  }, [center]);

  // Swap the basemap style when the theme changes (skip the initial mount —
  // the init effect already applied the correct style).
  // Re-attach custom DOM markers once the new style has loaded — setStyle can
  // detach them, and the marker-sync effect does not re-run on a theme change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    map.setStyle(buildStyle(theme));
    map.once('styledata', () => {
      markersRef.current.forEach((m) => m.addTo(map));
      userMarkerRef.current?.addTo(map);
    });
  }, [theme]);

  // Sync markers to the station list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = stationMarkers(stations, cheapestId).map((d) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `atlas-marker atlas-marker--${d.variant}`;
      el.textContent = d.label;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClickRef.current(d.id);
      });
      return new maplibregl.Marker({ element: el })
        .setLngLat([d.longitude, d.latitude])
        .addTo(map);
    });
  }, [stations, cheapestId]);

  return <div ref={containerRef} className="atlas-map" />;
}
