// refresh-prices
//
// Cron-triggered worker. For every station inside any user's price zone,
// fetches Google Places fuelOptions and upserts a 'google' row into prices
// when the upstream updateTime is newer than the latest stored row.
//
// Auth: verify_jwt = false. The Functions gateway only checks for a project
// key, so this worker additionally enforces an `x-cron-secret` header against
// the CRON_SECRET secret — without it, anyone holding the publishable key
// (which ships in the mobile app bundle) could spam the Google Places API
// and drain billing. Cron jobs send the header; see supabase/README.md.
//
// Body (optional): { "station_ids": ["uuid", ...] }
// When provided, refreshes exactly that list instead of the zone selection.
// Used for one-shot admin backfills when ingested stations live outside any
// user's zone (Sedona/Phoenix seed pre-Troy zone existed). CRON_SECRET still
// required, so this isn't an arbitrary-quota burner.
//
// Required secret:
//   supabase secrets set GOOGLE_PLACES_API_KEY=...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { jsonResponse, preflight, requireCronSecret } from '../_shared/cors.ts';
import { fetchFuelOptions, mapFuelPrices } from '../_shared/places-fuel.ts';

type StationRow = {
  id: string;
  brand: string | null;
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

  const denied = requireCronSecret(req);
  if (denied) return denied;

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

  // Optional override: caller can pass an explicit station_ids array (admin
  // backfill mode). Otherwise fall back to the zone-driven selection.
  let explicitIds: string[] | null = null;
  if (req.headers.get('content-length') && req.headers.get('content-length') !== '0') {
    try {
      const body = (await req.json()) as { station_ids?: unknown };
      if (
        Array.isArray(body.station_ids) &&
        body.station_ids.every((x) => typeof x === 'string')
      ) {
        explicitIds = body.station_ids as string[];
      }
    } catch {
      // Empty/invalid body is fine — treat as zone-driven invocation.
    }
  }

  let ids: string[];
  if (explicitIds !== null) {
    ids = explicitIds;
  } else {
    const { data: zoneIds, error: zoneErr } = await supabase.rpc('stations_in_any_zone');
    if (zoneErr) return jsonResponse({ error: zoneErr.message }, { status: 500 });
    ids = (zoneIds ?? []).map((r: { id: string }) => r.id);
  }

  if (ids.length === 0) {
    return jsonResponse({ checked: 0, api_calls: 0, updated: 0, skipped: 0, demoted: 0 });
  }

  // Fetch the demotion + place_id metadata in one go.
  const { data: stations, error: stErr } = await supabase
    .from('stations')
    .select('id, brand, google_place_id, longitude, places_fuel_seen_at, places_fuel_attempts')
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
      await supabase
        .from('stations')
        .update({ places_fuel_attempts: s.places_fuel_attempts + 1 })
        .eq('id', s.id);
      skipped += 1;
      continue;
    }

    const mapped = mapFuelPrices(resp.fuelOptions?.fuelPrices, s.longitude, s.brand);
    if (mapped.length === 0) {
      await supabase
        .from('stations')
        .update({ places_fuel_attempts: s.places_fuel_attempts + 1 })
        .eq('id', s.id);
      skipped += 1;
      continue;
    }

    // For each mapped fuel: insert a new row only if Google's updateTime
    // moved forward, but always bump `last_verified_at` on the latest row.
    // The visibility cutoff reads last_verified_at, so this keeps stations
    // visible when prices are stable but the cron is running.
    const verifiedAt = new Date().toISOString();
    for (const m of mapped) {
      const { data: latest } = await supabase
        .from('prices')
        .select('id, observed_at')
        .eq('station_id', s.id)
        .eq('octane', m.octane)
        .eq('source_kind', 'google')
        .order('observed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest && new Date(latest.observed_at) >= new Date(m.observed_at)) {
        await supabase
          .from('prices')
          .update({ last_verified_at: verifiedAt })
          .eq('id', latest.id);
        continue;
      }

      const { error: insErr } = await supabase.from('prices').insert({
        station_id: s.id,
        octane: m.octane,
        price_cents: m.price_cents,
        source_kind: 'google',
        observed_at: m.observed_at,
        last_verified_at: verifiedAt,
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
