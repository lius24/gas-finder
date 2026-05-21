// Geocoding adapter — Nominatim (OpenStreetMap), client-side, keyless
// (eng-review decision D3). No API key means nothing to leak in the bundle.
//
// Nominatim's usage policy requires an identifying Referer/User-Agent and
// forbids heavy or auto-triggered bulk use. Browser fetch sends Referer
// automatically and User-Agent is a forbidden header here; for this app's
// low-volume, user-initiated city searches that is within policy. If traffic
// ever outgrows it, swap this one module for a keyed provider.

import type { Coords } from './geolocation';

const BASE = 'https://nominatim.openstreetmap.org';

// Replacement for expo-location's LocationGeocodedAddress in core/'s public
// API surface — keeps core/ free of any React Native type dependency.
export type GeoAddress = {
  city: string | null;
  region: string | null;
};

type NominatimSearchResult = { lat: string; lon: string };

type NominatimReverseResult = {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    suburb?: string;
    county?: string;
    state?: string;
  };
};

/** Forward-geocode a free-text place query. Empty array = no match. */
export async function geocode(query: string): Promise<Coords[]> {
  const url =
    `${BASE}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status})`);
  }
  const data = (await res.json()) as NominatimSearchResult[];
  return data
    .map((r) => ({
      latitude: Number(r.lat),
      longitude: Number(r.lon),
    }))
    .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
}

/** Reverse-geocode coordinates to a city/region label. */
export async function reverseGeocode(coords: Coords): Promise<GeoAddress | null> {
  const url =
    `${BASE}/reverse?format=jsonv2&zoom=10` +
    `&lat=${coords.latitude}&lon=${coords.longitude}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) {
    throw new Error(`Reverse geocoding failed (${res.status})`);
  }
  const data = (await res.json()) as NominatimReverseResult;
  const a = data.address;
  if (!a) return null;
  return {
    city: a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.county ?? null,
    region: a.state ?? null,
  };
}
