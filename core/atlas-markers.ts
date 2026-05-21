import type { AnnotatedStation } from './decision-math';

export type MarkerVariant = 'best' | 'priced' | 'unpriced';

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
 * 'best' variant. Stations with no price render as a small 'unpriced' dot.
 */
export function stationMarkers(
  stations: AnnotatedStation[],
  cheapestId: string | null,
): StationMarker[] {
  return stations.map((s) => {
    if (s.price_cents === null) {
      return {
        id: s.id,
        latitude: s.latitude,
        longitude: s.longitude,
        label: '·',
        variant: 'unpriced' as const,
      };
    }
    return {
      id: s.id,
      latitude: s.latitude,
      longitude: s.longitude,
      label: `$${(s.price_cents / 100).toFixed(2)}`,
      variant: s.id === cheapestId ? ('best' as const) : ('priced' as const),
    };
  });
}
