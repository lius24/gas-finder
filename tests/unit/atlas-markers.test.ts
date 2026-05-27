import { describe, expect, it } from 'vitest';

import { stationMarkers } from '@core/atlas-markers';
import type { AnnotatedStation } from '@core/decision-math';

function station(overrides: Partial<AnnotatedStation>): AnnotatedStation {
  return {
    id: 's1',
    brand: 'Sunoco',
    name: 'Sunoco',
    address: '1 Main St',
    latitude: 42.73,
    longitude: -73.69,
    google_place_id: null,
    octane: 93,
    price_cents: 399,
    source_kind: 'google',
    observed_at: '2026-05-21T00:00:00Z',
    last_verified_at: '2026-05-21T00:00:00Z',
    distance_meters: 800,
    isBaseline: false,
    savings: null,
    ...overrides,
  };
}

describe('stationMarkers', () => {
  it('builds a priced marker with a dollar label', () => {
    const out = stationMarkers([station({ id: 'a', price_cents: 399 })], null);
    expect(out).toEqual([
      {
        id: 'a',
        latitude: 42.73,
        longitude: -73.69,
        label: '$3.99',
        variant: 'priced',
      },
    ]);
  });

  it('marks the cheapest station as the best variant', () => {
    const out = stationMarkers([station({ id: 'a' }), station({ id: 'b' })], 'b');
    expect(out.find((m) => m.id === 'b')?.variant).toBe('best');
    expect(out.find((m) => m.id === 'a')?.variant).toBe('priced');
  });

  it('excludes a station with price_cents: null', () => {
    const out = stationMarkers([station({ id: 'a', price_cents: null })], null);
    expect(out).toHaveLength(0);
  });
});
