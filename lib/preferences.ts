import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Octane } from './types';

const OCTANE_KEY = 'preferences.octane';
const RADIUS_KEY = 'preferences.radius_meters';
const SORT_KEY = 'preferences.sort';
const VALID_OCTANES: Octane[] = [86, 87, 89, 91, 93, 94];

export type SortKey = 'cheapest' | 'closest';
const VALID_SORTS: SortKey[] = ['cheapest', 'closest'];

export const RADIUS_OPTIONS_METERS = [1609, 4828, 8047, 16093] as const;
export type RadiusMeters = (typeof RADIUS_OPTIONS_METERS)[number];
export const DEFAULT_RADIUS_METERS: RadiusMeters = 8047;
export const DEFAULT_OCTANE: Octane = 87;

export async function getPreferredOctane(): Promise<Octane | null> {
  const raw = await AsyncStorage.getItem(OCTANE_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return VALID_OCTANES.includes(parsed as Octane) ? (parsed as Octane) : null;
}

export async function setPreferredOctane(octane: Octane): Promise<void> {
  await AsyncStorage.setItem(OCTANE_KEY, String(octane));
}

export async function getPreferredRadius(): Promise<RadiusMeters | null> {
  const raw = await AsyncStorage.getItem(RADIUS_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return RADIUS_OPTIONS_METERS.includes(parsed as RadiusMeters)
    ? (parsed as RadiusMeters)
    : null;
}

export async function setPreferredRadius(meters: RadiusMeters): Promise<void> {
  await AsyncStorage.setItem(RADIUS_KEY, String(meters));
}

export async function getPreferredSort(): Promise<SortKey | null> {
  const raw = await AsyncStorage.getItem(SORT_KEY);
  if (!raw) return null;
  return VALID_SORTS.includes(raw as SortKey) ? (raw as SortKey) : null;
}

export async function setPreferredSort(sort: SortKey): Promise<void> {
  await AsyncStorage.setItem(SORT_KEY, sort);
}

const RECENTS_KEY = 'preferences.recent_searches';
const MAX_RECENTS = 5;

export type RecentLocation = {
  label: string;
  latitude: number;
  longitude: number;
};

export async function getRecentSearches(): Promise<RecentLocation[]> {
  const raw = await AsyncStorage.getItem(RECENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RecentLocation =>
        typeof r?.label === 'string' &&
        typeof r?.latitude === 'number' &&
        typeof r?.longitude === 'number',
    );
  } catch {
    return [];
  }
}

export async function pushRecentSearch(loc: RecentLocation): Promise<void> {
  const existing = await getRecentSearches();
  const filtered = existing.filter(
    (r) => r.label.toLowerCase() !== loc.label.toLowerCase(),
  );
  filtered.unshift(loc);
  await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(filtered.slice(0, MAX_RECENTS)));
}
