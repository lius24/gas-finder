// Decision-math formula (v1 spec, design doc 2026-05-18).
//
//   net_savings = (baseline_price - station_price) × tank_size_gal
//               - (extra_round_trip_miles / assumed_mpg) × station_price
//
// where:
//   baseline_price = price at the *closest* station with a price for the
//                    selected octane (the "what I'd pay if I didn't drive
//                    anywhere" anchor).
//   station_price  = candidate station's price for the selected octane.
//                    null → no savings rendered.
//   extra_round_trip_miles = 2 × max(0, station_miles − baseline_miles)
//   tank_size_gal  = 12 (v1 default, no user input)
//   assumed_mpg    = 25 (v1 default, no user input)
//   station_miles  = haversine straight-line × 1.3 (rough road correction)
//
// To compensate for the fixed tank/mpg assumptions, the UI renders a range
// (±25% of the central estimate). Garage user input for these is a v1.1 item
// (see TODOS.md / open question #3 in the design doc).

import type { Octane, OctaneSelection, StationWithPrice } from './types';
import { octanesFor } from './types';
import { metersToMiles } from './geo';
import { isHidden } from './staleness';

export const DEFAULT_TANK_GAL = 12;
export const DEFAULT_MPG = 25;
export const ROAD_DISTANCE_FACTOR = 1.3;
export const SAVINGS_RANGE_FACTOR = 0.25;

export type Savings = {
  /** Central estimate in dollars. Can be negative (driving costs more than the price diff saves). */
  centralDollars: number;
  /** Lower-bound dollar estimate after applying SAVINGS_RANGE_FACTOR. */
  lowDollars: number;
  /** Upper-bound dollar estimate after applying SAVINGS_RANGE_FACTOR. */
  highDollars: number;
};

export type AnnotatedStation = StationWithPrice & {
  /** True only for the closest priced station for the selected octane — the
   *  comparison anchor. Card should suppress a savings badge on this card. */
  isBaseline: boolean;
  /** Net savings vs the baseline. Null when there's no priced baseline, or
   *  when this station itself has no price for the selected octane, or when
   *  this station IS the baseline. */
  savings: Savings | null;
};

export type AnnotateOpts = {
  tankSizeGal?: number;
  mpg?: number;
};

/**
 * Annotate a station list with savings vs the closest-priced station.
 *
 * Filters out stations whose price observation is older than the hide
 * threshold (>7d), per the staleness rule, by treating them as price-null
 * before computing the baseline. Stations are returned in input order
 * (sort separately).
 *
 * Pure function. Identical inputs always produce identical outputs.
 */
export function annotateWithSavings(
  stations: StationWithPrice[],
  selection: OctaneSelection,
  opts: AnnotateOpts = {},
): AnnotatedStation[] {
  const tankGal = opts.tankSizeGal ?? DEFAULT_TANK_GAL;
  const mpg = opts.mpg ?? DEFAULT_MPG;
  const allowed = new Set<Octane>(octanesFor(selection));
  const isAllowedOctane = (o: Octane | null): o is Octane =>
    o !== null && allowed.has(o);

  // Treat hidden (verified >7d ago) prices as null so a stale-but-cheap
  // reading can't become the baseline. Visibility reads last_verified_at
  // (system freshness — when refresh-prices last touched the row), NOT
  // observed_at (Google's updateTime, which can sit unchanged for weeks
  // when the pump's price is stable).
  const effective = stations.map((s) => {
    if (s.price_cents === null) return s;
    if (!isAllowedOctane(s.octane)) return s;
    if (isHidden(s.last_verified_at)) {
      return { ...s, price_cents: null, observed_at: null, last_verified_at: null };
    }
    return s;
  });

  const priced = effective.filter(
    (s) => s.price_cents !== null && isAllowedOctane(s.octane),
  );

  // Baseline = closest priced station. If none exists, every card is
  // baseline-less and savings is null everywhere.
  const baseline =
    priced.length === 0
      ? null
      : priced.reduce((min, s) =>
          s.distance_meters < min.distance_meters ? s : min,
        );

  return effective.map((s) => {
    const isBaseline = baseline !== null && s.id === baseline.id;
    let savings: Savings | null = null;

    if (
      baseline !== null &&
      !isBaseline &&
      s.price_cents !== null &&
      isAllowedOctane(s.octane) &&
      baseline.price_cents !== null
    ) {
      const stationMiles =
        metersToMiles(s.distance_meters) * ROAD_DISTANCE_FACTOR;
      const baselineMiles =
        metersToMiles(baseline.distance_meters) * ROAD_DISTANCE_FACTOR;
      const extraRoundTripMi = 2 * Math.max(0, stationMiles - baselineMiles);

      const priceDiffDollars =
        (baseline.price_cents - s.price_cents) / 100;
      const stationPriceDollars = s.price_cents / 100;

      const grossSavings = priceDiffDollars * tankGal;
      const driveCost = (extraRoundTripMi / mpg) * stationPriceDollars;
      const central = grossSavings - driveCost;

      const halfRange = Math.abs(central) * SAVINGS_RANGE_FACTOR;
      savings = {
        centralDollars: central,
        lowDollars: central - halfRange,
        highDollars: central + halfRange,
      };
    }

    return { ...s, isBaseline, savings };
  });
}

/**
 * Format a savings range for display. Always returns a two-ended dollar
 * range, e.g. "Save $0.80–$1.40" or "Costs $0.30–$0.50 extra".
 *
 * Returns null when the central estimate is below 10¢ — at that point the
 * answer is "essentially the same price," not actionable, and rendering it
 * is visual noise that competes with the price itself.
 */
export function formatSavingsRange(s: Savings): string | null {
  const abs = Math.abs(s.centralDollars);
  if (abs < 0.1) return null;
  const lo = Math.min(Math.abs(s.lowDollars), Math.abs(s.highDollars));
  const hi = Math.max(Math.abs(s.lowDollars), Math.abs(s.highDollars));
  const verb = s.centralDollars > 0 ? 'Save' : 'Costs';
  const tail = s.centralDollars > 0 ? '' : ' extra';
  return `${verb} $${lo.toFixed(2)}–$${hi.toFixed(2)}${tail}`;
}
