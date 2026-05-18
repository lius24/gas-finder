// Shared between refresh-prices (cron) and refresh-station-prices (on-demand).
// Calls Google Places Details (New) for fuelOptions and maps Google's fuel
// type labels to the DB-allowed octane values (87/89/91/93/94).

export type FuelPrice = {
  type: string;
  price?: { currencyCode?: string; units?: string | number; nanos?: number };
  updateTime?: string;
};

export type FuelOptionsResponse = {
  id?: string;
  fuelOptions?: { fuelPrices?: FuelPrice[] };
};

export type MappedPrice = {
  octane: 87 | 89 | 91 | 93 | 94;
  price_cents: number;
  observed_at: string;
};

// Brands whose `PREMIUM` is regionally non-standard and should override the
// longitude-only heuristic. Keys MUST match the canonical brand strings in
// ingest-stations' KNOWN_BRANDS (apostrophe-sensitive, case-sensitive).
//
// How this gets populated: when dogfooding surfaces a station whose displayed
// octane doesn't match what the brand actually pumps, add the brand here.
// Caught 2026-05-18: Stewart's Shops east-coast premium is 91, not 93.
const BRAND_PREMIUM_OVERRIDE: Record<string, 91 | 93 | 94> = {
  "Stewart's Shops": 91,
};

// Premium = 93 east of the Mississippi cut, 91 west of it. Lat/lon-driven so
// the worker doesn't need a state lookup table for v1. Brand override wins
// when present (handles regional brands whose premium is non-standard).
function premiumOctaneFor(longitude: number, brand?: string | null): 91 | 93 | 94 {
  if (brand && BRAND_PREMIUM_OVERRIDE[brand] !== undefined) {
    return BRAND_PREMIUM_OVERRIDE[brand]!;
  }
  return longitude > -100 ? 93 : 91;
}

function octaneForType(
  type: string,
  longitude: number,
  brand?: string | null,
): 87 | 89 | 91 | 93 | 94 | null {
  switch (type) {
    case 'REGULAR_UNLEADED':
      return 87;
    case 'MIDGRADE':
      return 89;
    case 'PREMIUM':
      return premiumOctaneFor(longitude, brand);
    default:
      return null;
  }
}

function priceToCents(p: FuelPrice['price']): number | null {
  if (!p) return null;
  const units = typeof p.units === 'string' ? parseInt(p.units, 10) : (p.units ?? 0);
  const nanos = p.nanos ?? 0;
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return null;
  // units = whole dollars; nanos = fractional dollar × 1e9. Convert to cents.
  const cents = Math.round(units * 100 + nanos / 1e7);
  if (cents < 50 || cents > 1500) return null; // matches the DB CHECK
  return cents;
}

export function mapFuelPrices(
  prices: FuelPrice[] | undefined,
  longitude: number,
  brand?: string | null,
): MappedPrice[] {
  if (!prices) return [];
  const out: MappedPrice[] = [];
  const seen = new Set<number>();
  for (const fp of prices) {
    const octane = octaneForType(fp.type, longitude, brand);
    if (octane === null) continue;
    if (seen.has(octane)) continue; // dedupe if Google ever returns dupes
    const cents = priceToCents(fp.price);
    if (cents === null) continue;
    if (!fp.updateTime) continue;
    out.push({ octane, price_cents: cents, observed_at: fp.updateTime });
    seen.add(octane);
  }
  return out;
}

export async function fetchFuelOptions(
  placeId: string,
  apiKey: string,
): Promise<FuelOptionsResponse | { error: string; status: number }> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,fuelOptions',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    return { error: body.slice(0, 500), status: res.status };
  }
  return (await res.json()) as FuelOptionsResponse;
}
