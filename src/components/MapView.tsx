import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, DARK, LIGHT } from '@protomaps/basemaps';

import { stationMarkers } from '@core/atlas-markers';
import type { AnnotatedStation } from '@core/decision-math';
import type { Coords } from '@core/adapters/geolocation';

import 'maplibre-gl/dist/maplibre-gl.css';
import './MapView.css';

const BASEMAP_URL = import.meta.env.EXPO_PUBLIC_BASEMAP_URL as string;

// Register the pmtiles:// protocol once for the whole app.
const protocol = new Protocol();
// pmtiles v4 tile is a V3OrV4Protocol — cast to satisfy maplibre-gl v5's
// AddProtocolAction (same runtime behavior, slightly different type shape).
maplibregl.addProtocol('pmtiles', protocol.tile as Parameters<typeof maplibregl.addProtocol>[1]);

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

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(theme),
      center: center ? [center.longitude, center.latitude] : [-73.69, 42.73],
      zoom: 12,
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

  // Recenter when the location changes.
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.flyTo({ center: [center.longitude, center.latitude], zoom: 12 });
    }
  }, [center]);

  // Swap the basemap style when the theme changes.
  useEffect(() => {
    mapRef.current?.setStyle(buildStyle(theme));
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
