import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_MPG,
  DEFAULT_TANK_GAL,
  ROAD_DISTANCE_FACTOR,
  SAVINGS_RANGE_FACTOR,
  annotateWithSavings,
  formatSavingsRange,
} from './decision-math';
import type { Octane, SourceKind, StationWithPrice } from './types';

const NOW = new Date('2026-05-19T12:00:00Z');
const fresh = new Date(NOW.getTime() - 3_600_000).toISOString(); // 1h ago

type Overrides = Partial<StationWithPrice>;

function station(id: string, overrides: Overrides = {}): StationWithPrice {
  return {
    id,
    brand: 'Test',
    name: id,
    address: `${id} st`,
    latitude: 42.7,
    longitude: -73.7,
    google_place_id: null,
    octane: 91 as Octane,
    price_cents: 400,
    source_kind: 'google' as SourceKind,
    observed_at: fresh,
    last_verified_at: fresh,
    distance_meters: 1000,
    ...overrides,
  };
}

describe('annotateWithSavings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty array for empty input', () => {
    expect(annotateWithSavings([], 91)).toEqual([]);
  });

  it('marks the closest priced station as baseline with null savings', () => {
    const stations = [
      station('a', { distance_meters: 500 }),
      station('b', { distance_meters: 2000 }),
    ];
    const out = annotateWithSavings(stations, 91);
    expect(out[0].isBaseline).toBe(true);
    expect(out[0].savings).toBeNull();
    expect(out[1].isBaseline).toBe(false);
  });

  it('preserves input order', () => {
    const stations = [
      station('z', { distance_meters: 2000 }),
      station('a', { distance_meters: 500 }),
    ];
    const out = annotateWithSavings(stations, 91);
    expect(out.map((s) => s.id)).toEqual(['z', 'a']);
    expect(out.find((s) => s.id === 'a')?.isBaseline).toBe(true);
  });

  it('matches the worked example from the design doc ($1.27 net for 87)', () => {
    // Founder's example: Sunoco 2mi at $4.49 vs closest 0.2mi at $4.65.
    // 16¢ × 12gal = $1.92 gross. 3.6mi × $4.49 / 25mpg = $0.647 drive cost.
    // Net = $1.27.
    const oneMileMeters = 1609.344;
    const stations = [
      station('closest', {
        distance_meters: 0.2 * oneMileMeters,
        price_cents: 465,
        octane: 87 as Octane,
      }),
      station('sunoco', {
        // round trip math uses haversine × 1.3, and the spec's worked example
        // pre-applied that road-correction (2 mi road, not 2 mi haversine).
        // Reverse it so the formula sees a 2 mi *road* distance.
        distance_meters: (2 / ROAD_DISTANCE_FACTOR) * oneMileMeters,
        price_cents: 449,
        octane: 87 as Octane,
      }),
    ];
    const out = annotateWithSavings(stations, 87);
    const sunoco = out.find((s) => s.id === 'sunoco')!;
    expect(sunoco.savings).not.toBeNull();
    // Allow a small tolerance (the 0.2mi baseline isn't *exactly* zero
    // contribution to round-trip).
    expect(sunoco.savings!.centralDollars).toBeCloseTo(1.27, 1);
  });

  it('hides prices last verified >7d ago from baseline selection', () => {
    const veryStale = new Date(NOW.getTime() - 8 * 24 * 3_600_000).toISOString();
    const stations = [
      // The closer station hasn't been re-verified in >7d → must NOT be the baseline.
      station('unverified-near', {
        distance_meters: 100,
        price_cents: 100,
        observed_at: veryStale,
        last_verified_at: veryStale,
      }),
      station('fresh-far', {
        distance_meters: 5000,
        price_cents: 400,
        observed_at: fresh,
        last_verified_at: fresh,
      }),
    ];
    const out = annotateWithSavings(stations, 91);
    expect(out.find((s) => s.id === 'fresh-far')!.isBaseline).toBe(true);
    expect(out.find((s) => s.id === 'unverified-near')!.isBaseline).toBe(false);
    // Hidden also has its price treated as null in the returned shape.
    expect(out.find((s) => s.id === 'unverified-near')!.price_cents).toBeNull();
  });

  it('keeps a price-aged-old station visible as long as it was verified recently', () => {
    // The product reality this fix exists for: Google's updateTime can sit
    // unchanged for weeks while refresh-prices is still successfully fetching
    // the same value daily. Old observed_at + fresh last_verified_at → visible.
    const monthOldPriceTime = new Date(NOW.getTime() - 30 * 24 * 3_600_000).toISOString();
    const stations = [
      station('aged-but-verified', {
        distance_meters: 1000,
        price_cents: 500,
        observed_at: monthOldPriceTime,
        last_verified_at: fresh,
      }),
    ];
    const out = annotateWithSavings(stations, 91);
    const s = out.find((x) => x.id === 'aged-but-verified')!;
    expect(s.price_cents).toBe(500);
    expect(s.isBaseline).toBe(true);
  });

  it('skips savings for stations of the wrong octane', () => {
    const stations = [
      station('a', { distance_meters: 500, octane: 91 as Octane }),
      station('b', { distance_meters: 2000, octane: 87 as Octane }),
    ];
    const out = annotateWithSavings(stations, 91);
    expect(out.find((s) => s.id === 'b')!.savings).toBeNull();
  });

  it('no baseline → every station has null savings', () => {
    const stations = [
      station('a', { distance_meters: 500, price_cents: null }),
      station('b', { distance_meters: 1000, price_cents: null }),
    ];
    const out = annotateWithSavings(stations, 91);
    expect(out.every((s) => s.savings === null)).toBe(true);
    expect(out.every((s) => s.isBaseline === false)).toBe(true);
  });

  it('range is symmetric around central by SAVINGS_RANGE_FACTOR', () => {
    const stations = [
      station('a', { distance_meters: 500, price_cents: 500 }),
      station('b', { distance_meters: 1000, price_cents: 400 }),
    ];
    const out = annotateWithSavings(stations, 91);
    const s = out.find((x) => x.id === 'b')!.savings!;
    const half = Math.abs(s.centralDollars) * SAVINGS_RANGE_FACTOR;
    expect(s.lowDollars).toBeCloseTo(s.centralDollars - half, 6);
    expect(s.highDollars).toBeCloseTo(s.centralDollars + half, 6);
  });

  it('"premium" selection treats 91 + 93 + 94 as one comparison pool', () => {
    // Stewart's 91, Sunoco 93, generic 94 — all premium. Cheapest is the
    // 94 station (5 mi out at $4.80). Closest priced (Stewart's at 0.5 mi
    // for $5.20) becomes baseline; the others should show savings.
    const stations = [
      station('stewarts', {
        id: 'stewarts',
        distance_meters: 500,
        octane: 91 as Octane,
        price_cents: 520,
      }),
      station('sunoco', {
        id: 'sunoco',
        distance_meters: 2000,
        octane: 93 as Octane,
        price_cents: 510,
      }),
      station('ultra94', {
        id: 'ultra94',
        distance_meters: 5000,
        octane: 94 as Octane,
        price_cents: 480,
      }),
    ];
    const out = annotateWithSavings(stations, 'premium');
    expect(out.find((s) => s.id === 'stewarts')!.isBaseline).toBe(true);
    expect(out.find((s) => s.id === 'sunoco')!.savings).not.toBeNull();
    expect(out.find((s) => s.id === 'ultra94')!.savings).not.toBeNull();
  });

  it('"premium" excludes 87 and 89 stations from baseline + comparison', () => {
    const stations = [
      // Closer regular station — must NOT become baseline in premium mode.
      station('reg', {
        id: 'reg',
        distance_meters: 100,
        octane: 87 as Octane,
        price_cents: 400,
      }),
      station('prem', {
        id: 'prem',
        distance_meters: 2000,
        octane: 93 as Octane,
        price_cents: 510,
      }),
    ];
    const out = annotateWithSavings(stations, 'premium');
    expect(out.find((s) => s.id === 'reg')!.isBaseline).toBe(false);
    expect(out.find((s) => s.id === 'reg')!.savings).toBeNull();
    expect(out.find((s) => s.id === 'prem')!.isBaseline).toBe(true);
  });

  it('honors tankSizeGal and mpg overrides', () => {
    const stations = [
      station('a', { distance_meters: 0, price_cents: 500 }),
      station('b', { distance_meters: 1609.344, price_cents: 400 }),
    ];
    const def = annotateWithSavings(stations, 91);
    const custom = annotateWithSavings(stations, 91, {
      tankSizeGal: DEFAULT_TANK_GAL * 2,
      mpg: DEFAULT_MPG,
    });
    const defB = def.find((s) => s.id === 'b')!.savings!;
    const customB = custom.find((s) => s.id === 'b')!.savings!;
    // Doubling tank size roughly doubles gross savings but drive cost is
    // unchanged → result is strictly greater than just doubling.
    expect(customB.centralDollars).toBeGreaterThan(defB.centralDollars * 1.5);
  });
});

describe('formatSavingsRange', () => {
  it('returns null when the central estimate is below 10¢', () => {
    expect(
      formatSavingsRange({ centralDollars: 0.05, lowDollars: 0.04, highDollars: 0.06 }),
    ).toBeNull();
  });

  it('"Save $0.80–$1.20" for positive savings', () => {
    expect(
      formatSavingsRange({ centralDollars: 1, lowDollars: 0.8, highDollars: 1.2 }),
    ).toBe('Save $0.80–$1.20');
  });

  it('"Costs $X–$Y extra" for negative savings', () => {
    expect(
      formatSavingsRange({
        centralDollars: -1,
        lowDollars: -1.2,
        highDollars: -0.8,
      }),
    ).toBe('Costs $0.80–$1.20 extra');
  });
});
