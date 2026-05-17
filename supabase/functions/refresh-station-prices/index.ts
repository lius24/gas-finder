// refresh-station-prices
//
// On-demand price refresh for specific station IDs (typically those currently
// visible on the Pumps/Map tab, or those newly inside a just-saved zone).
//
// Auth: verify_jwt = true. Caller must be authenticated; we derive user_id
// from the JWT and enforce a 5-call rolling 24h quota per user.
//
// Body: { "station_ids": ["uuid", ...] }   (max 25)
// Returns: { fetched: N, updated: N, fresh_prices: [...] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { jsonResponse, preflight } from '../_shared/cors.ts';
import { fetchFuelOptions, mapFuelPrices } from '../_shared/places-fuel.ts';

const MAX_IDS = 25;
const QUOTA_PER_24H = 5;

type Body = { station_ids?: string[] };

Deno.serve(async (req) => {
  const cors = preflight(req);
  if (cors) return cors;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'missing bearer token' }, { status: 401 });
  }

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) {
    return jsonResponse(
      { error: 'GOOGLE_PLACES_API_KEY secret not set on this project' },
      { status: 500 },
    );
  }

  const authed = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, { status: 400 });
  }
  const ids = (body.station_ids ?? []).filter((s) => typeof s === 'string');
  if (ids.length === 0 || ids.length > MAX_IDS) {
    return jsonResponse(
      { error: `station_ids required, 1..${MAX_IDS} entries` },
      { status: 400 },
    );
  }

  // Quota check.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: cntErr } = await service
    .from('price_refresh_log')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('called_at', since);
  if (cntErr) return jsonResponse({ error: cntErr.message }, { status: 500 });
  if ((count ?? 0) >= QUOTA_PER_24H) {
    // Oldest call inside the window decides retry_after.
    const { data: oldest } = await service
      .from('price_refresh_log')
      .select('called_at')
      .eq('user_id', userId)
      .gt('called_at', since)
      .order('called_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const retryAfter = oldest
      ? Math.max(
          1,
          Math.ceil(
            (new Date(oldest.called_at).getTime() + 24 * 3600 * 1000 - Date.now()) / 1000,
          ),
        )
      : 60;
    return jsonResponse(
      { error: 'quota_exceeded', retry_after: retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // Log call up front so a runaway client can't spam.
  await service.from('price_refresh_log').insert({
    user_id: userId,
    station_count: ids.length,
  });

  // Fetch station metadata for each id.
  const { data: stations, error: stErr } = await service
    .from('stations')
    .select('id, google_place_id, longitude')
    .in('id', ids);
  if (stErr) return jsonResponse({ error: stErr.message }, { status: 500 });

  let updated = 0;
  const freshPrices: {
    station_id: string;
    octane: number;
    price_cents: number;
    observed_at: string;
  }[] = [];

  for (const s of stations as {
    id: string;
    google_place_id: string | null;
    longitude: number;
  }[]) {
    if (!s.google_place_id) continue;
    const resp = await fetchFuelOptions(s.google_place_id, apiKey);
    if ('error' in resp) continue;
    const mapped = mapFuelPrices(resp.fuelOptions?.fuelPrices, s.longitude);
    if (mapped.length === 0) continue;

    for (const m of mapped) {
      const { data: latest } = await service
        .from('prices')
        .select('observed_at')
        .eq('station_id', s.id)
        .eq('octane', m.octane)
        .eq('source_kind', 'google')
        .order('observed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest && new Date(latest.observed_at) >= new Date(m.observed_at)) continue;

      const { error: insErr } = await service.from('prices').insert({
        station_id: s.id,
        octane: m.octane,
        price_cents: m.price_cents,
        source_kind: 'google',
        observed_at: m.observed_at,
      });
      if (!insErr) {
        updated += 1;
        freshPrices.push({
          station_id: s.id,
          octane: m.octane,
          price_cents: m.price_cents,
          observed_at: m.observed_at,
        });
      }
    }

    await service
      .from('stations')
      .update({ places_fuel_seen_at: new Date().toISOString() })
      .eq('id', s.id);
  }

  return jsonResponse({ fetched: stations.length, updated, fresh_prices: freshPrices });
});
