import type { AnnotatedStation } from './decision-math';

export type MarkerVariant = 'best' | 'priced';

export type StationMarker = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  variant: MarkerVariant;
};

/**
 * Map annotated stations to map-marker descriptors. `cheapestId` is the id of
 * the cheapest priced station (from usePumpsData); that marker gets the
 * 'best' variant. Stations with no price are excluded — the Atlas map shows
 * only priced premium stations.
 */
export function stationMarkers(
  stations: AnnotatedStation[],
  cheapestId: string | null,
): StationMarker[] {
  return stations
    .filter((s) => s.price_cents !== null)
    .map((s) => ({
      id: s.id,
      latitude: s.latitude,
      longitude: s.longitude,
      label: `$${(s.price_cents! / 100).toFixed(2)}`,
      variant: s.id === cheapestId ? 'best' : 'priced',
    }));
}
