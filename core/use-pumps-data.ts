// Owns the entire Pumps-tab data & state graph: location, octane/radius/
// sort prefs, station fetch (with multi-octane fan-out for "any premium"),
// annotated savings, sorted list, hidden-unpriced count, favorites,
// search, recents, refresh.
//
// Each theme's Pumps view consumes this hook and renders its own layout.
// Logic stays here; layout decisions stay in the views.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { reverseGeocode, type GeoAddress } from './adapters/geocoding';
import { getCurrentCoords, GeolocationError } from './adapters/geolocation';
import { useAuth } from './auth';
import { annotateWithSavings, type AnnotatedStation } from './decision-math';
import { listFavoriteIds } from './favorites';
import {
  DEFAULT_OCTANE,
  DEFAULT_RADIUS_METERS,
  getPreferredOctane,
  getPreferredRadius,
  getPreferredSort,
  getRecentSearches,
  pushRecentSearch,
  setPreferredOctane,
  setPreferredRadius,
  setPreferredSort,
  type RadiusMeters,
  type RecentLocation,
  type SortKey,
} from './preferences';
import { supabase } from './supabase';
import { octanesFor, type OctaneSelection, type StationWithPrice } from './types';

export type Coords = { latitude: number; longitude: number };

export function formatLocationLabel(place: GeoAddress | null): string {
  if (!place) return '';
  const { city, region } = place;
  if (city && region) return `${city}, ${region}`;
  return city ?? region ?? '';
}

export function usePumpsData() {
  const { session } = useAuth();

  const [octane, setOctaneState] = useState<OctaneSelection>(DEFAULT_OCTANE);
  const [radius, setRadiusState] = useState<RadiusMeters>(DEFAULT_RADIUS_METERS);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [coords, setCoords] = useState<Coords | null>(null);
  const [usingCurrentLocation, setUsingCurrentLocation] = useState(true);
  const [currentLocationLabel, setCurrentLocationLabel] = useState<string | null>(null);
  const [searchLabel, setSearchLabel] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentLocation[]>([]);
  const [stations, setStations] = useState<StationWithPrice[]>([]);
  const [sort, setSortState] = useState<SortKey>('cheapest');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const annotatedStations = useMemo<AnnotatedStation[]>(
    () => annotateWithSavings(stations, octane),
    [stations, octane],
  );

  const hiddenUnpriced = useMemo(
    () => annotatedStations.filter((s) => s.price_cents === null).length,
    [annotatedStations],
  );

  const visibleAnnotated = useMemo<AnnotatedStation[]>(
    () => annotatedStations.filter((s) => s.price_cents !== null),
    [annotatedStations],
  );

  const sortedStations = useMemo(() => {
    const copy = [...visibleAnnotated];
    copy.sort((a, b) => {
      if (sort === 'cheapest') {
        const ap = a.price_cents;
        const bp = b.price_cents;
        if (ap === null && bp === null) return a.distance_meters - b.distance_meters;
        if (ap === null) return 1;
        if (bp === null) return -1;
        return ap - bp;
      }
      return a.distance_meters - b.distance_meters;
    });
    return copy;
  }, [visibleAnnotated, sort]);

  const cheapestId = useMemo(() => {
    const priced = stations.filter((s) => s.price_cents !== null);
    if (priced.length === 0) return null;
    return priced.reduce((min, s) =>
      (s.price_cents as number) < (min.price_cents as number) ? s : min,
    ).id;
  }, [stations]);

  const closestId = useMemo(() => {
    if (stations.length === 0) return null;
    return stations.reduce((min, s) =>
      s.distance_meters < min.distance_meters ? s : min,
    ).id;
  }, [stations]);

  const fetchNearby = useCallback(
    async (
      lat: number,
      lon: number,
      selection: OctaneSelection,
      radiusVal: RadiusMeters,
    ) => {
      setError(null);
      const octanes = octanesFor(selection);
      const results = await Promise.all(
        octanes.map((o) =>
          supabase.functions.invoke<StationWithPrice[]>('nearby', {
            body: { latitude: lat, longitude: lon, octane: o, radius: radiusVal },
          }),
        ),
      );
      const fnError = results.find((r) => r.error)?.error;
      if (fnError) {
        setError(fnError.message);
        return;
      }
      const byId = new Map<string, StationWithPrice>();
      for (const { data } of results) {
        for (const s of data ?? []) {
          const prev = byId.get(s.id);
          if (!prev) {
            byId.set(s.id, s);
            continue;
          }
          const a = prev.price_cents;
          const b = s.price_cents;
          if (a === null && b !== null) byId.set(s.id, s);
          else if (a !== null && b !== null && b < a) byId.set(s.id, s);
        }
      }
      setStations(Array.from(byId.values()));
    },
    [],
  );

  const applyCurrentLocation = useCallback(async () => {
    setError(null);
    let position: Coords;
    try {
      position = await getCurrentCoords();
    } catch (e) {
      if (e instanceof GeolocationError && e.reason === 'denied') {
        setError('Location permission denied — search for a city above.');
      } else if (e instanceof GeolocationError && e.reason === 'timeout') {
        setError("Couldn't read your location — search for a city above.");
      } else {
        setError('Location unavailable — search for a city above.');
      }
      setLoading(false);
      return;
    }
    const next = { latitude: position.latitude, longitude: position.longitude };
    setSearchLabel(null);
    setUsingCurrentLocation(true);
    setCoords(next);
    try {
      const addr = await reverseGeocode(next);
      setCurrentLocationLabel(formatLocationLabel(addr) || null);
    } catch {
      setCurrentLocationLabel(null);
    }
  }, []);

  const setOctane = useCallback((next: OctaneSelection) => {
    setOctaneState(next);
    setPreferredOctane(next);
  }, []);

  const setRadius = useCallback((next: RadiusMeters) => {
    setRadiusState(next);
    setPreferredRadius(next);
  }, []);

  const setSort = useCallback((next: SortKey) => {
    setSortState(next);
    setPreferredSort(next);
  }, []);

  const applyRecent = useCallback((loc: RecentLocation) => {
    setUsingCurrentLocation(false);
    setSearchLabel(loc.label);
    setCoords({ latitude: loc.latitude, longitude: loc.longitude });
    setLoading(true);
  }, []);

  const applyLocationSelection = useCallback(
    async (loc: { label: string; latitude: number; longitude: number }) => {
      setError(null);
      setUsingCurrentLocation(false);
      setSearchLabel(loc.label);
      setCoords({ latitude: loc.latitude, longitude: loc.longitude });
      setLoading(true);
      await pushRecentSearch(loc);
      setRecents(await getRecentSearches());
    },
    [],
  );

  const onRefresh = useCallback(async () => {
    if (!coords) return;
    setRefreshing(true);
    await fetchNearby(coords.latitude, coords.longitude, octane, radius);
    setRefreshing(false);
  }, [coords, octane, radius, fetchNearby]);

  const onManualRefreshPrices = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    await supabase.functions.invoke('refresh-station-prices', {
      body: { station_ids: stations.slice(0, 25).map((s) => s.id) },
    });
    if (coords) await fetchNearby(coords.latitude, coords.longitude, octane, radius);
    setRefreshing(false);
  }, [session, stations, coords, octane, radius, fetchNearby]);

  useEffect(() => {
    (async () => {
      const [storedOctane, storedRadius, storedSort, storedRecents] = await Promise.all([
        getPreferredOctane(),
        getPreferredRadius(),
        getPreferredSort(),
        getRecentSearches(),
      ]);
      if (storedOctane) setOctaneState(storedOctane);
      if (storedRadius) setRadiusState(storedRadius);
      if (storedSort) setSortState(storedSort);
      setRecents(storedRecents);
      await applyCurrentLocation();
    })();
  }, [applyCurrentLocation]);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    (async () => {
      await fetchNearby(coords.latitude, coords.longitude, octane, radius);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [octane, radius, coords, fetchNearby]);

  useEffect(() => {
    if (!session?.user?.id) {
      setFavoriteIds(new Set());
      return;
    }
    let cancelled = false;
    listFavoriteIds(session.user.id).then((ids) => {
      if (!cancelled) setFavoriteIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  return {
    // data
    session,
    stations,
    annotatedStations,
    sortedStations,
    hiddenUnpriced,
    cheapestId,
    closestId,
    favoriteIds,
    loading,
    refreshing,
    error,

    // toolbar state
    octane,
    setOctane,
    radius,
    setRadius,
    sort,
    setSort,

    // location
    coords,
    usingCurrentLocation,
    currentLocationLabel,
    searchLabel,
    recents,
    applyCurrentLocation,
    applyRecent,
    applyLocationSelection,

    // refresh
    onRefresh,
    onManualRefreshPrices,
  };
}

export type PumpsData = ReturnType<typeof usePumpsData>;
