import { storage as AsyncStorage } from './adapters/storage';
import type { Octane, OctaneSelection } from './types';

const OCTANE_KEY = 'preferences.octane';
const RADIUS_KEY = 'preferences.radius_meters';
const SORT_KEY = 'preferences.sort';
const VALID_OCTANES: Octane[] = [86, 87, 89, 91, 93, 94];

export type SortKey = 'cheapest' | 'closest';
const VALID_SORTS: SortKey[] = ['cheapest', 'closest'];

export const RADIUS_OPTIONS_METERS = [1609, 4828, 8047, 16093] as const;
export type RadiusMeters = (typeof RADIUS_OPTIONS_METERS)[number];
export const DEFAULT_RADIUS_METERS: RadiusMeters = 8047;
// Default selection is "any premium" — the wedge target is premium-octane
// drivers, and Google Places splits their pumps between 91 (Stewart's-style
// brands) and 93 (most east-coast), so a single 91 or 93 default would hide
// half the relevant stations. Regular-87 users can pick 87 explicitly;
// they're not the wedge.
export const DEFAULT_OCTANE: OctaneSelection = 'premium';

export async function getPreferredOctane(): Promise<OctaneSelection | null> {
  const raw = await AsyncStorage.getItem(OCTANE_KEY);
  if (!raw) return null;
  if (raw === 'premium') return 'premium';
  const parsed = Number(raw);
  return VALID_OCTANES.includes(parsed as Octane) ? (parsed as Octane) : null;
}

export async function setPreferredOctane(octane: OctaneSelection): Promise<void> {
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

// Home location — the user's "primary" address (e.g. home or work).
// Used as the default search anchor when GPS is unavailable, denied,
// or the user explicitly opts to plan trips from a known address.
const HOME_LOCATION_KEY = 'preferences.home-location';

export type HomeLocation = {
  label: string;
  latitude: number;
  longitude: number;
};

export async function getHomeLocation(): Promise<HomeLocation | null> {
  const v = await AsyncStorage.getItem(HOME_LOCATION_KEY);
  if (!v) return null;
  try {
    const parsed = JSON.parse(v);
    if (
      typeof parsed?.label === 'string' &&
      typeof parsed?.latitude === 'number' &&
      typeof parsed?.longitude === 'number'
    ) {
      return parsed as HomeLocation;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setHomeLocation(loc: HomeLocation | null): Promise<void> {
  if (!loc) {
    await AsyncStorage.removeItem(HOME_LOCATION_KEY);
    return;
  }
  await AsyncStorage.setItem(HOME_LOCATION_KEY, JSON.stringify(loc));
}
