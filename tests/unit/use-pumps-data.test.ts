import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StationWithPrice } from '@core/types';

// Hoisted mocks — the controller wires supabase + the browser adapters.
const { invoke, getCurrentCoordsMock } = vi.hoisted(() => ({
  invoke: vi.fn(),
  getCurrentCoordsMock: vi.fn(),
}));

vi.mock('@core/supabase', () => ({
  supabase: { functions: { invoke } },
}));

vi.mock('@core/adapters/geolocation', () => {
  class GeolocationError extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.name = 'GeolocationError';
      this.reason = reason;
    }
  }
  return { GeolocationError, getCurrentCoords: getCurrentCoordsMock };
});

vi.mock('@core/adapters/geocoding', () => ({
  geocode: vi.fn(async () => []),
  reverseGeocode: vi.fn(async () => null),
}));

const { usePumpsData } = await import('@core/use-pumps-data');

function station(over: Partial<StationWithPrice> & { id: string }): StationWithPrice {
  return {
    id: over.id,
    brand: over.brand ?? 'Brand',
    name: over.name ?? 'Station',
    address: over.address ?? '1 Main St',
    latitude: 42.7,
    longitude: -73.6,
    google_place_id: null,
    octane: over.octane ?? null,
    price_cents: over.price_cents ?? null,
    source_kind: 'google',
    observed_at: over.observed_at ?? new Date().toISOString(),
    last_verified_at: over.last_verified_at ?? new Date().toISOString(),
    distance_meters: over.distance_meters ?? 1000,
  };
}

beforeEach(() => {
  invoke.mockReset();
  getCurrentCoordsMock.mockReset();
  getCurrentCoordsMock.mockResolvedValue({ latitude: 42.7, longitude: -73.6 });

  // Default octane is "premium" -> octanesFor() fans out to [91, 93, 94].
  // Station A appears in both 91 and 93; the cheaper (93) must win.
  // Station C is price-null in 93 but priced in 94; the priced row must win.
  invoke.mockImplementation(
    async (_fn: string, opts: { body: { octane: number } }) => {
      switch (opts.body.octane) {
        case 91:
          return {
            data: [
              station({ id: 'a', octane: 91, price_cents: 500, distance_meters: 1000 }),
              station({ id: 'b', octane: 91, price_cents: 510, distance_meters: 2000 }),
            ],
            error: null,
          };
        case 93:
          return {
            data: [
              station({ id: 'a', octane: 93, price_cents: 480, distance_meters: 1000 }),
              station({ id: 'c', octane: 93, price_cents: null, distance_meters: 1500 }),
            ],
            error: null,
          };
        case 94:
          return {
            data: [
              station({ id: 'c', octane: 94, price_cents: 520, distance_meters: 1500 }),
            ],
            error: null,
          };
        default:
          return { data: [], error: null };
      }
    },
  );
});

describe('usePumpsData — octane fan-out merge', () => {
  it('merges the 3 premium-octane calls, keeping the cheapest row per station', async () => {
    const { result } = renderHook(() => usePumpsData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // One nearby call per premium octane (91, 93, 94).
    expect(invoke).toHaveBeenCalledTimes(3);

    const byId = new Map(result.current.stations.map((s) => [s.id, s]));
    expect(byId.size).toBe(3);

    // A: 93@480 beats 91@500.
    expect(byId.get('a')?.price_cents).toBe(480);
    expect(byId.get('a')?.octane).toBe(93);
    // B: only in the 91 call.
    expect(byId.get('b')?.price_cents).toBe(510);
    // C: the priced 94 row replaces the null 93 row.
    expect(byId.get('c')?.price_cents).toBe(520);
    expect(byId.get('c')?.octane).toBe(94);
  });

  it('derives cheapestId and closestId from the merged set', async () => {
    const { result } = renderHook(() => usePumpsData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cheapestId).toBe('a'); // 480 is the lowest price
    expect(result.current.closestId).toBe('a'); // 1000m is the nearest
  });

  it('sorts cheapest-first by default and by distance when sort flips', async () => {
    const { result } = renderHook(() => usePumpsData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sortedStations.map((s) => s.id)).toEqual(['a', 'b', 'c']);

    act(() => result.current.setSort('closest'));
    expect(result.current.sortedStations.map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });
});
