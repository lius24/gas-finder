// Geocoding adapter.
//
// Forward geocoding and address autocomplete go through the `places-search`
// edge function (Google Places `searchText`). Keyless OSM providers
// (Nominatim / Photon) lack residential street coverage, so a real address
// like "4 Riverstone Drive, Troy, NY" resolved to nothing. The Google API
// key stays server-side in the edge function — it never reaches the browser.
//
// Reverse geocoding (coordinates -> city label) still uses Nominatim: it only
// powers a low-volume "you are here" label and OSM coverage is fine at the
// city/region zoom level.

import { supabase } from '../supabase';

import type { Coords } from './geolocation';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// Replacement for expo-location's LocationGeocodedAddress in core/'s public
// API surface — keeps core/ free of any React Native type dependency.
export type GeoAddress = {
  city: string | null;
  region: string | null;
};

export type AddressSuggestion = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

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

/**
 * Query the `places-search` edge function (Google Places `searchText`).
 * Works for partial type-ahead queries and full addresses alike. An empty
 * array means no match; a thrown error means the request itself failed.
 */
async function searchPlaces(query: string): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const { data, error } = await supabase.functions.invoke('places-search', {
    body: { query: q },
  });
  if (error) {
    throw new Error(`Address search failed: ${error.message}`);
  }
  return Array.isArray(data) ? (data as AddressSuggestion[]) : [];
}

/** Forward-geocode a free-text place query. Empty array = no match. */
export async function geocode(query: string): Promise<Coords[]> {
  const places = await searchPlaces(query);
  return places.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
}

/** Address autocomplete for a type-ahead query. Empty array = no match. */
export async function autocompleteAddress(query: string): Promise<AddressSuggestion[]> {
  return searchPlaces(query);
}

/** Reverse-geocode coordinates to a city/region label. */
export async function reverseGeocode(coords: Coords): Promise<GeoAddress | null> {
  const url =
    `${NOMINATIM_BASE}/reverse?format=jsonv2&zoom=10` +
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
