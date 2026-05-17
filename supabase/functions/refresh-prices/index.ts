// refresh-prices
//
// Cron-triggered worker. For every station inside any user's price zone,
// fetches Google Places fuelOptions and upserts a 'google' row into prices
// when the upstream updateTime is newer than the latest stored row.
//
// Auth: verify_jwt = false. Must be reached only via service-role bearer
// (pg_cron + pg_net) — same posture as send-price-alerts.
//
// Required secret:
//   supabase secrets set GOOGLE_PLACES_API_KEY=...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { jsonResponse, preflight } from '../_shared/cors.ts';
import { fetchFuelOptions, mapFuelPrices } from '../_shared/places-fuel.ts';

type StationRow = {
  id: string;
  google_place_id: string | null;
  longitude: number;
  places_fuel_seen_at: string | null;
  places_fuel_attempts: number;
};

const DEMOTION_THRESHOLD = 3;

function shouldSkipDemoted(s: StationRow, nowUtc: Date): boolean {
  if (s.places_fuel_seen_at !== null) return false;
  if (s.places_fuel_attempts < DEMOTION_THRESHOLD) return false;
  // Demoted: process only on Sunday (UTC).
  return nowUtc.getUTCDay() !== 0;
}

Deno.serve(async (req) => {
  const cors = preflight(req);
  if (cors) return cors;

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) {
    return jsonResponse(
      { error: 'GOOGLE_PLACES_API_KEY secret not set on this project' },
      { status: 500 },
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Pull all stations that fall inside any user's zone.
  const { data: zoneIds, error: zoneErr } = await supabase.rpc('stations_in_any_zone');
  if (zoneErr) return jsonResponse({ error: zoneErr.message }, { status: 500 });

  const ids = (zoneIds ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) {
    return jsonResponse({ checked: 0, updated: 0, skipped: 0, demoted: 0 });
  }

  // Fetch the demotion + place_id metadata in one go.
  const { data: stations, error: stErr } = await supabase
    .from('stations')
    .select('id, google_place_id, longitude, places_fuel_seen_at, places_fuel_attempts')
    .in('id', ids);
  if (stErr) return jsonResponse({ error: stErr.message }, { status: 500 });

  const now = new Date();
  let updated = 0;
  let skipped = 0;
  let demoted = 0;
  let apiCalls = 0;

  for (const s of stations as StationRow[]) {
    if (!s.google_place_id) {
      skipped += 1;
      continue;
    }
    if (shouldSkipDemoted(s, now)) {
      demoted += 1;
      continue;
    }

    apiCalls += 1;
    const resp = await fetchFuelOptions(s.google_place_id, apiKey);
    if ('error' in resp) {
      skipped += 1;
      continue;
    }

    const mapped = mapFuelPrices(resp.fuelOptions?.fuelPrices, s.longitude);
    if (mapped.length === 0) {
      await supabase
        .from('stations')
        .update({ places_fuel_attempts: s.places_fuel_attempts + 1 })
        .eq('id', s.id);
      skipped += 1;
      continue;
    }

    // For each mapped fuel, only insert if observed_at is newer than what we
    // already have for (station, octane, 'google').
    for (const m of mapped) {
      const { data: latest } = await supabase
        .from('prices')
        .select('observed_at')
        .eq('station_id', s.id)
        .eq('octane', m.octane)
        .eq('source_kind', 'google')
        .order('observed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest && new Date(latest.observed_at) >= new Date(m.observed_at)) {
        continue;
      }

      const { error: insErr } = await supabase.from('prices').insert({
        station_id: s.id,
        octane: m.octane,
        price_cents: m.price_cents,
        source_kind: 'google',
        observed_at: m.observed_at,
      });
      if (!insErr) updated += 1;
    }

    await supabase
      .from('stations')
      .update({ places_fuel_seen_at: now.toISOString() })
      .eq('id', s.id);
  }

  return jsonResponse({ checked: stations.length, api_calls: apiCalls, updated, skipped, demoted });
});
