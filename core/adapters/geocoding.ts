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

// Address autocomplete via Photon (photon.komoot.io) — a free, keyless,
// OpenStreetMap-based geocoder built for type-ahead. Keyless keeps it
// consistent with the no-API-key decision for the other geocoding here.
export type AddressSuggestion = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
  };
};

export async function autocompleteAddress(query: string): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=5&lang=en`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) {
    throw new Error(`Address search failed (${res.status})`);
  }

  const data = (await res.json()) as { features?: PhotonFeature[] };
  const out: AddressSuggestion[] = [];
  for (const f of data.features ?? []) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length !== 2) continue;
    const [lon, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const p = f.properties ?? {};
    const street =
      p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street;
    const label = [street ?? p.name, p.city, p.state].filter(Boolean).join(', ');
    if (!label) continue;

    out.push({
      id: `${p.osm_type ?? ''}${p.osm_id ?? ''}-${lon},${lat}`,
      label,
      latitude: lat,
      longitude: lon,
    });
  }
  return out;
}
