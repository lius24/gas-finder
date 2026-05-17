# Price Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship automated per-station gas-price ingestion (Google Places `fuelOptions`) bounded to per-user "home zones," with a Settings zone picker and a Pumps tab that gracefully handles stations without price data.

**Architecture:** Two new edge functions — `refresh-prices` (daily cron) and `refresh-station-prices` (on-demand, JWT, quota-capped) — both call Google Places Details for stations inside any user's zone. A new `user_price_zones` table is the source of truth for what to ingest. The Pumps/Map UI is updated so missing prices render as a "no data yet" state instead of disappearing.

**Tech Stack:** Supabase (Postgres + PostGIS + pg_cron + pg_net + Edge Functions/Deno) · Expo / React Native · TypeScript · react-native-maps · expo-location

**Spec:** `docs/superpowers/specs/2026-05-16-price-ingest-design.md`

---

## File map

**New files (created by this plan):**
- `supabase/migrations/20260517000000_user_price_zones.sql`
- `supabase/migrations/20260517000001_widen_source_kind.sql`
- `supabase/migrations/20260517000002_dead_station_tracking.sql`
- `supabase/migrations/20260517000003_zone_helper_rpcs.sql`
- `supabase/migrations/20260517000004_nearby_left_join.sql`
- `supabase/migrations/20260517000005_price_refresh_log.sql`
- `supabase/functions/_shared/places-fuel.ts`
- `supabase/functions/refresh-prices/index.ts`
- `supabase/functions/refresh-station-prices/index.ts`
- `lib/zones.ts`
- `components/zone-picker.tsx`

**Modified files:**
- `supabase/config.toml` — register two new functions
- `lib/types.ts` — `Octane` widening already done; widen `SourceKind`; make price fields on `StationWithPrice` nullable
- `lib/preferences.ts` — add `DEFAULT_OCTANE` export
- `components/station-card.tsx` — null-price rendering, exhaustive `sourceLabel`
- `app/(tabs)/index.tsx` — use `DEFAULT_OCTANE`, split empty states, null-aware sort
- `app/(tabs)/map.tsx` — use `DEFAULT_OCTANE`, null-price markers
- `app/(tabs)/settings.tsx` — mount `<ZonePicker />`

**Deployment-time (not source files):**
- `pg_cron` schedule for `refresh-prices` (run from SQL editor / `psql`, captured in this plan)

---

## Conventions used in this plan

- **Verification:** This codebase has no JS/TS unit-test runner configured (no `jest`, no `vitest`). Verification at each step uses what exists: `tsc --noEmit`, `npm run lint`, `supabase db reset`, `supabase functions serve`, and curl. The Plan calls each one out explicitly.
- **Deno checks** require `deno` installed (`brew install deno`). If unavailable, the equivalent check is `supabase functions serve <fn-name>` — a syntax error there will fail to boot.
- **Commit cadence:** one commit per task (after the task's verification passes).
- **Working tree:** the repo has uncommitted WIP from prior work. Do NOT stage with `git add .` — each step lists the exact files to stage.
- **DB migrations:** filenames use a single date prefix (`20260517...`) with a 6-digit sequence so the migrations apply in the listed order.

---

## Task 1: Migration — `user_price_zones`

**Files:**
- Create: `supabase/migrations/20260517000000_user_price_zones.sql`

- [ ] **Step 1: Write migration**

```sql
-- Per-user "home zone" for automated price ingestion.
-- One circle per user (PK = user_id) for v1. Extending to multi-zone later
-- means widening the PK to (user_id, slot smallint not null default 0).

create table public.user_price_zones (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  latitude   double precision not null,
  longitude  double precision not null,
  radius_m   integer not null check (radius_m between 1000 and 50000),
  label      text,
  updated_at timestamptz not null default now()
);

alter table public.user_price_zones enable row level security;

create policy user_price_zones_select_own
  on public.user_price_zones for select
  to authenticated
  using (user_id = auth.uid());

create policy user_price_zones_insert_own
  on public.user_price_zones for insert
  to authenticated
  with check (user_id = auth.uid());

create policy user_price_zones_update_own
  on public.user_price_zones for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_price_zones_delete_own
  on public.user_price_zones for delete
  to authenticated
  using (user_id = auth.uid());
```

- [ ] **Step 2: Apply locally**

Run: `supabase db reset`
Expected: completes without error and prints "Finished `supabase db reset`."

- [ ] **Step 3: Verify shape**

Run:
```bash
supabase db psql -c "\d public.user_price_zones"
```
Expected: table exists with columns `user_id, latitude, longitude, radius_m, label, updated_at` and a PRIMARY KEY on `user_id`.

- [ ] **Step 4: Verify RLS**

Run:
```bash
supabase db psql -c "select polname from pg_policy where polrelid = 'public.user_price_zones'::regclass order by polname;"
```
Expected: four rows — `user_price_zones_delete_own`, `..._insert_own`, `..._select_own`, `..._update_own`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260517000000_user_price_zones.sql
git commit -m "feat(db): add user_price_zones table"
```

---

## Task 2: Migration — widen `prices.source_kind`

**Files:**
- Create: `supabase/migrations/20260517000001_widen_source_kind.sql`

- [ ] **Step 1: Write migration**

```sql
-- Add 'google' source kind for the automated Places-fuelOptions ingest path.
-- 'crowd' remains user OCR; 'scrape'/'official' kept for future / manual seeding.

alter table public.prices
  drop constraint if exists prices_source_kind_check;

alter table public.prices
  add constraint prices_source_kind_check
  check (source_kind in ('scrape','crowd','official','google'));
```

- [ ] **Step 2: Apply locally**

Run: `supabase db reset`
Expected: completes without error.

- [ ] **Step 3: Verify constraint**

Run:
```bash
supabase db psql -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'prices_source_kind_check';"
```
Expected: output contains `'scrape', 'crowd', 'official', 'google'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000001_widen_source_kind.sql
git commit -m "feat(db): add 'google' to prices.source_kind"
```

---

## Task 3: Migration — dead-station tracking columns

**Files:**
- Create: `supabase/migrations/20260517000002_dead_station_tracking.sql`

- [ ] **Step 1: Write migration**

```sql
-- Tracking columns used by refresh-prices to demote stations that never
-- return fuelOptions data from daily to weekly retries.
--
-- places_fuel_seen_at: last time Google returned at least one fuelPrice row.
--                      Once non-null, the station stays on the daily schedule.
-- places_fuel_attempts: incremented each refresh that returned no fuelPrices.
--                      Demotion kicks in at 3+ attempts AND seen_at IS NULL.

alter table public.stations
  add column if not exists places_fuel_seen_at  timestamptz,
  add column if not exists places_fuel_attempts integer not null default 0;
```

- [ ] **Step 2: Apply locally**

Run: `supabase db reset`
Expected: completes without error.

- [ ] **Step 3: Verify columns**

Run:
```bash
supabase db psql -c "select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'stations' and column_name like 'places_fuel%' order by column_name;"
```
Expected: two rows — `places_fuel_attempts integer NO 0` and `places_fuel_seen_at timestamp with time zone YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000002_dead_station_tracking.sql
git commit -m "feat(db): add dead-station tracking columns to stations"
```

---

## Task 4: Migration — zone helper RPCs

**Files:**
- Create: `supabase/migrations/20260517000003_zone_helper_rpcs.sql`

- [ ] **Step 1: Write migration**

```sql
-- Helpers used by the price-ingest worker and the Settings zone picker.

create or replace function public.stations_in_any_zone()
returns table (id uuid)
language sql stable security definer set search_path = public, extensions
as $$
  select distinct s.id
  from public.stations s
  join public.user_price_zones z
    on st_dwithin(
      s.location,
      st_setsrid(st_makepoint(z.longitude, z.latitude), 4326)::geography,
      z.radius_m
    );
$$;

grant execute on function public.stations_in_any_zone() to service_role;

create or replace function public.stations_in_circle(
  p_lat double precision,
  p_lon double precision,
  p_radius_m integer
)
returns table (id uuid)
language sql stable security definer set search_path = public, extensions
as $$
  select s.id
  from public.stations s
  where st_dwithin(
    s.location,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
    p_radius_m
  );
$$;

grant execute on function public.stations_in_circle(
  double precision, double precision, integer
) to authenticated, service_role;
```

- [ ] **Step 2: Apply locally**

Run: `supabase db reset`
Expected: completes without error.

- [ ] **Step 3: Verify functions exist**

Run:
```bash
supabase db psql -c "select proname from pg_proc where proname in ('stations_in_any_zone','stations_in_circle') order by proname;"
```
Expected: two rows.

- [ ] **Step 4: Smoke-test `stations_in_circle`**

Run:
```bash
supabase db psql -c "insert into stations (name, address, latitude, longitude) values ('Test', '1 Test St', 42.7284, -73.6918) returning id;"
supabase db psql -c "select count(*) from stations_in_circle(42.7284, -73.6918, 1000);"
```
Expected: count = 1.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260517000003_zone_helper_rpcs.sql
git commit -m "feat(db): add stations_in_any_zone and stations_in_circle RPCs"
```

---

## Task 5: Migration — `nearby_stations_with_price` LEFT JOIN

**Files:**
- Create: `supabase/migrations/20260517000004_nearby_left_join.sql`

- [ ] **Step 1: Write migration**

```sql
-- Replace the existing nearby_stations_with_price RPC so stations without
-- a price row for the requested octane are still returned (with NULL price
-- fields). Required so the Pumps/Map tabs can render "no price yet" for
-- stations outside any user's ingest zone.

create or replace function public.nearby_stations_with_price(
  p_lat double precision,
  p_lon double precision,
  p_octane smallint,
  p_radius_m double precision
)
returns table (
  id uuid,
  brand text,
  name text,
  address text,
  latitude double precision,
  longitude double precision,
  google_place_id text,
  octane smallint,
  price_cents int,
  source_kind text,
  observed_at timestamptz,
  distance_meters double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography as g
  ),
  within_radius as (
    select
      s.id,
      s.brand,
      s.name,
      s.address,
      s.latitude,
      s.longitude,
      s.google_place_id,
      st_distance(s.location, (select g from origin)) as distance_meters
    from public.stations s
    where st_dwithin(s.location, (select g from origin), p_radius_m)
  ),
  latest_price as (
    select distinct on (p.station_id)
      p.station_id,
      p.octane,
      p.price_cents,
      p.source_kind,
      p.observed_at
    from public.prices p
    where p.octane = p_octane
    order by p.station_id, p.observed_at desc
  )
  select
    w.id,
    w.brand,
    w.name,
    w.address,
    w.latitude,
    w.longitude,
    w.google_place_id,
    lp.octane,
    lp.price_cents,
    lp.source_kind,
    lp.observed_at,
    w.distance_meters
  from within_radius w
  left join latest_price lp on lp.station_id = w.id
  order by lp.price_cents asc nulls last, w.distance_meters asc;
$$;

grant execute on function public.nearby_stations_with_price(
  double precision, double precision, smallint, double precision
) to anon, authenticated, service_role;
```

- [ ] **Step 2: Apply locally**

Run: `supabase db reset`
Expected: completes without error.

- [ ] **Step 3: Verify nullability**

Run:
```bash
supabase db psql -c "insert into stations (name, address, latitude, longitude) values ('NullPrice', '1 Null St', 42.7284, -73.6918) on conflict do nothing returning id;"
supabase db psql -c "select id, price_cents, octane from nearby_stations_with_price(42.7284, -73.6918, 87::smallint, 5000) limit 5;"
```
Expected: at least one row with `price_cents = NULL` and `octane = NULL` (the seeded station has no `prices` rows).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000004_nearby_left_join.sql
git commit -m "feat(db): widen nearby_stations_with_price to LEFT JOIN prices"
```

---

## Task 6: Migration — `price_refresh_log`

**Files:**
- Create: `supabase/migrations/20260517000005_price_refresh_log.sql`

- [ ] **Step 1: Write migration**

```sql
-- On-demand refresh quota ledger. One row per refresh-station-prices call.
-- Worker reads it under service role; no policies needed (RLS denies all to
-- authenticated/anon by default).

create table public.price_refresh_log (
  user_id       uuid not null references auth.users(id) on delete cascade,
  called_at     timestamptz not null default now(),
  station_count smallint not null check (station_count >= 0)
);

create index price_refresh_log_user_idx
  on public.price_refresh_log (user_id, called_at desc);

alter table public.price_refresh_log enable row level security;
```

- [ ] **Step 2: Apply locally**

Run: `supabase db reset`
Expected: completes without error.

- [ ] **Step 3: Verify shape**

Run:
```bash
supabase db psql -c "\d public.price_refresh_log"
```
Expected: table with `user_id`, `called_at`, `station_count`; the `_user_idx` shows up.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000005_price_refresh_log.sql
git commit -m "feat(db): add price_refresh_log quota ledger"
```

---

## Task 7: Shared module — `places-fuel.ts`

**Files:**
- Create: `supabase/functions/_shared/places-fuel.ts`

- [ ] **Step 1: Write the module**

```ts
// Shared between refresh-prices (cron) and refresh-station-prices (on-demand).
// Calls Google Places Details (New) for fuelOptions and maps Google's fuel
// type labels to the DB-allowed octane values (87/89/91/93).

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
  octane: 87 | 89 | 91 | 93;
  price_cents: number;
  observed_at: string;
};

// Premium = 93 east of the Mississippi cut, 91 west of it. Lat/lon-driven so
// the worker doesn't need a state lookup table for v1.
function premiumOctaneFor(longitude: number): 91 | 93 {
  return longitude > -100 ? 93 : 91;
}

function octaneForType(type: string, longitude: number): 87 | 89 | 91 | 93 | null {
  switch (type) {
    case 'REGULAR_UNLEADED':
      return 87;
    case 'MIDGRADE':
      return 89;
    case 'PREMIUM':
      return premiumOctaneFor(longitude);
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
): MappedPrice[] {
  if (!prices) return [];
  const out: MappedPrice[] = [];
  const seen = new Set<number>();
  for (const fp of prices) {
    const octane = octaneForType(fp.type, longitude);
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
```

- [ ] **Step 2: TypeScript / syntax check**

Run from the repo root:
```bash
deno check supabase/functions/_shared/places-fuel.ts
```
Expected: no errors. If `deno` isn't installed, install it with `brew install deno` first.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/places-fuel.ts
git commit -m "feat(fn): add shared Places fuelOptions fetcher + octane mapper"
```

---

## Task 8: Edge function — `refresh-prices` (cron)

**Files:**
- Create: `supabase/functions/refresh-prices/index.ts`

- [ ] **Step 1: Write the function**

```ts
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
```

- [ ] **Step 2: Syntax check**

Run:
```bash
deno check supabase/functions/refresh-prices/index.ts
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/refresh-prices/index.ts
git commit -m "feat(fn): add refresh-prices cron worker"
```

---

## Task 9: Edge function — `refresh-station-prices` (on-demand)

**Files:**
- Create: `supabase/functions/refresh-station-prices/index.ts`

- [ ] **Step 1: Write the function**

```ts
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
```

- [ ] **Step 2: Syntax check**

Run:
```bash
deno check supabase/functions/refresh-station-prices/index.ts
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/refresh-station-prices/index.ts
git commit -m "feat(fn): add refresh-station-prices on-demand worker"
```

---

## Task 10: Register the two functions in `supabase/config.toml`

**Files:**
- Modify: `supabase/config.toml` (append two `[functions.*]` blocks)

- [ ] **Step 1: Append the two blocks at the end of the file**

Add exactly this text to the end of `supabase/config.toml`:

```toml

# Daily cron worker — refreshes Google Places fuelOptions for any station
# inside a user's zone. Service-role only.
[functions.refresh-prices]
verify_jwt = false

# On-demand pull-to-refresh of specific station IDs. Authed user; quota-capped
# in the function body via price_refresh_log.
[functions.refresh-station-prices]
verify_jwt = true
```

- [ ] **Step 2: Verify Supabase loads it**

Run:
```bash
supabase functions list-local 2>/dev/null || true
supabase functions serve refresh-prices --no-verify-jwt --debug & sleep 3; kill %1 2>/dev/null || true
```
Expected: `serve` prints `Serving Functions on http://localhost:54321/functions/v1/refresh-prices` without erroring on config.

- [ ] **Step 3: Commit**

```bash
git add supabase/config.toml
git commit -m "feat(fn): register refresh-prices + refresh-station-prices in config"
```

---

## Task 11: Local smoke test of both edge functions

**Files:** none (verification only)

- [ ] **Step 1: Seed a test zone + station with a real Google place_id**

Pick any real gas-station Google place_id near Troy, NY. Easy way: open Google Maps, click a gas station, the URL contains a `!1s0x…` segment — but the cleanest source is to first run `ingest-stations` against your coords (already documented in `supabase/README.md`). If you've already seeded stations, skip ahead.

Run (substitute the service role key from `supabase status`):
```bash
supabase functions serve ingest-stations --no-verify-jwt &
SUPABASE_KEY=$(supabase status -o env | grep SERVICE_ROLE | cut -d= -f2 | tr -d '"')
curl -X POST http://localhost:54321/functions/v1/ingest-stations \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"latitude":42.7284,"longitude":-73.6918,"radius_m":5000}'
kill %1 2>/dev/null
```
Expected: JSON response with `found > 0` and `upserted > 0`.

- [ ] **Step 2: Seed a user_price_zones row for any local test user**

Run:
```bash
supabase db psql -c "select id from auth.users limit 1;"
# Take the printed UUID and substitute below:
supabase db psql -c "insert into user_price_zones (user_id, latitude, longitude, radius_m) values ('<uuid>', 42.7284, -73.6918, 5000);"
```
Expected: `INSERT 0 1`.

- [ ] **Step 3: Set the Google Places key as a local secret**

Run:
```bash
echo "GOOGLE_PLACES_API_KEY=<your-key>" > supabase/.env.local
```
(`supabase functions serve` reads from this file when present.)

- [ ] **Step 4: Run `refresh-prices` once and verify rows landed**

Run:
```bash
supabase functions serve refresh-prices --no-verify-jwt --env-file supabase/.env.local &
sleep 2
curl -X POST http://localhost:54321/functions/v1/refresh-prices -H "Content-Type: application/json" -d '{}'
kill %1 2>/dev/null
supabase db psql -c "select count(*) from prices where source_kind = 'google';"
```
Expected: HTTP 200 with a JSON body like `{ "checked": N, "api_calls": N, "updated": >0, ... }` and the SQL count is non-zero.

- [ ] **Step 5: Run `refresh-station-prices` and verify quota**

Run (substitute any seeded station UUID + a JWT for the test user — `supabase auth signin --email <email>` then copy `access_token`):
```bash
supabase functions serve refresh-station-prices --env-file supabase/.env.local &
sleep 2
JWT=<paste-access-token>
curl -X POST http://localhost:54321/functions/v1/refresh-station-prices \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"station_ids":["<uuid>"]}'
# Repeat 5 more times — the 6th should 429 with retry_after.
kill %1 2>/dev/null
```
Expected: first 5 calls return 200 with `fetched`/`updated`; the 6th returns 429 with `retry_after > 0`.

- [ ] **Step 6: Commit nothing — verification only.**

(If the smoke test surfaces a bug in tasks 7–9, fix the bug, re-run, then squash the fix into the original task's commit via `git commit --amend` or land a follow-up commit.)

---

## Task 12: Client types — widen `SourceKind`, nullable price fields

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Apply edits**

Replace lines 16 and 28-34 with:

```ts
export type SourceKind = 'scrape' | 'crowd' | 'official' | 'google';

export type Station = {
  id: string;
  brand: string | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  google_place_id: string | null;
};

export type StationWithPrice = Station & {
  octane: Octane | null;
  price_cents: number | null;
  source_kind: SourceKind | null;
  observed_at: string | null;
  distance_meters: number;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: errors **only** in `components/station-card.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/map.tsx`, and possibly `app/station/[id].tsx`. Those are the call sites the next tasks will fix — do not fix them here. If errors appear outside that set, stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): widen SourceKind to include 'google', allow nullable price fields"
```

---

## Task 13: Add `DEFAULT_OCTANE` export

**Files:**
- Modify: `lib/preferences.ts`

- [ ] **Step 1: Apply edit**

After the existing `DEFAULT_RADIUS_METERS` line (line 15), add:

```ts
export const DEFAULT_OCTANE: Octane = 87;
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: same errors as task 12 — no new ones.

- [ ] **Step 3: Commit**

```bash
git add lib/preferences.ts
git commit -m "feat(prefs): export DEFAULT_OCTANE = 87"
```

---

## Task 14: `StationCard` — null-price rendering + exhaustive `sourceLabel`

**Files:**
- Modify: `components/station-card.tsx`

- [ ] **Step 1: Replace the `sourceLabel` function (lines 100-109)**

Replace with:

```ts
function sourceLabel(kind: StationWithPrice['source_kind']): string | null {
  if (kind === null) return null;
  switch (kind) {
    case 'scrape':
      return 'auto';
    case 'crowd':
      return 'reported';
    case 'official':
      return 'verified';
    case 'google':
      return 'live';
    default: {
      const never: never = kind;
      void never;
      return null;
    }
  }
}
```

- [ ] **Step 2: Replace the right-side pump display (lines 82-93) and the meta row (lines 59-79)**

Replace the entire `<View style={styles.right}>` block with:

```tsx
<View style={styles.right}>
  {station.price_cents === null ? (
    <View style={[styles.pumpDisplay, styles.pumpDisplayEmpty]}>
      <Text style={styles.priceEmpty}>—.—</Text>
    </View>
  ) : (
    <View style={styles.pumpDisplay}>
      <Text style={styles.priceWhole}>
        {Math.floor(station.price_cents / 100)}
      </Text>
      <Text style={styles.priceDot}>.</Text>
      <Text style={styles.priceFraction}>
        {(station.price_cents % 100).toString().padStart(2, '0')}
      </Text>
    </View>
  )}
  <Text style={styles.octaneTag}>
    {station.octane !== null ? `${station.octane} OCTANE` : 'NO PRICE YET'}
  </Text>
</View>
```

And replace the `<View style={styles.metaRow}>` block with one that conditionally shows source/stale only when there's a price:

```tsx
<View style={styles.metaRow}>
  <Text style={styles.metaPrimary}>
    {formatDistance(station.distance_meters)}
  </Text>
  {station.source_kind !== null && sourceLabel(station.source_kind) ? (
    <>
      <Text style={styles.metaDot}>·</Text>
      <Text style={styles.meta}>{sourceLabel(station.source_kind)}</Text>
    </>
  ) : null}
  {station.observed_at && staleLabel(station.observed_at) ? (
    <>
      <Text style={styles.metaDot}>·</Text>
      <Text style={[styles.meta, styles.metaStale]}>
        {staleLabel(station.observed_at)}
      </Text>
    </>
  ) : null}
  {favorited ? (
    <>
      <Text style={styles.metaDot}>·</Text>
      <Text style={styles.metaFav}>♡ saved</Text>
    </>
  ) : null}
</View>
```

- [ ] **Step 3: Suppress cheapest/closest stamps when price is null**

Replace the `{isCheapest || isClosest ? (` block with:

```tsx
{station.price_cents !== null && (isCheapest || isClosest) ? (
  <View style={styles.stampRow}>
    {isCheapest ? (
      <View style={[styles.stamp, styles.stampCheapest]}>
        <Text style={styles.stampText}>★ CHEAPEST</Text>
      </View>
    ) : null}
    {isClosest ? (
      <View style={[styles.stamp, styles.stampClosest]}>
        <Text style={[styles.stampText, styles.stampTextClosest]}>
          ⌖ CLOSEST
        </Text>
      </View>
    ) : null}
  </View>
) : null}
```

- [ ] **Step 4: Add the two new styles to the StyleSheet**

Inside `StyleSheet.create({...})`, alongside `pumpDisplay` and the other price styles, add:

```ts
pumpDisplayEmpty: {
  opacity: 0.5,
},
priceEmpty: {
  fontFamily: fonts.priceHeavy,
  fontSize: 22,
  color: colors.amber,
  lineHeight: 24,
  letterSpacing: 1,
},
```

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: `components/station-card.tsx` errors are gone. Remaining errors should be in `app/(tabs)/index.tsx`, `app/(tabs)/map.tsx`, possibly `app/station/[id].tsx`.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors in the modified file.

- [ ] **Step 7: Commit**

```bash
git add components/station-card.tsx
git commit -m "feat(card): render no-price state and add 'google' source label"
```

---

## Task 15: Pumps tab — empty states, null-aware sort, use DEFAULT_OCTANE

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Import `DEFAULT_OCTANE` and use it**

In the imports from `@/lib/preferences`, add `DEFAULT_OCTANE`. Then change the `useState<Octane>(93)` initializer (line 60) to:

```ts
const [octane, setOctane] = useState<Octane>(DEFAULT_OCTANE);
```

- [ ] **Step 2: Make the cheapest/closest derivations null-aware**

Replace the `cheapestId` and `closestId` memos with:

```ts
const cheapestId = useMemo(() => {
  const priced = stations.filter((s) => s.price_cents !== null);
  if (priced.length === 0) return null;
  return priced.reduce((min, s) =>
    (s.price_cents as number) < (min.price_cents as number) ? s : min,
  ).id;
}, [stations]);

const closestId = useMemo(() => {
  if (stations.length === 0) return null;
  return stations.reduce((min, s) =>
    s.distance_meters < min.distance_meters ? s : min,
  ).id;
}, [stations]);
```

- [ ] **Step 3: Null-aware sort comparator**

Replace the `sortedStations` memo with:

```ts
const sortedStations = useMemo(() => {
  const copy = [...stations];
  copy.sort((a, b) => {
    if (sort === 'cheapest') {
      const ap = a.price_cents;
      const bp = b.price_cents;
      if (ap === null && bp === null) return a.distance_meters - b.distance_meters;
      if (ap === null) return 1;
      if (bp === null) return -1;
      return ap - bp;
    }
    return a.distance_meters - b.distance_meters;
  });
  return copy;
}, [stations, sort]);
```

- [ ] **Step 4: Split empty-state copy**

Replace the existing `stations.length === 0 ? (` branch (a single `<View style={styles.center}>` with the "No stations with…" copy) with the two branches below:

```tsx
) : stations.length === 0 ? (
  <View style={styles.center}>
    <Text style={styles.muted}>
      No stations within {Math.round(radius / 1000)} km of here. Try a wider radius.
    </Text>
  </View>
) : stations.every((s) => s.price_cents === null) ? (
  <View style={styles.center}>
    <Text style={styles.muted}>
      Stations are here, but we don&apos;t have prices for {octane} octane yet.
    </Text>
    <Pressable
      style={styles.linkButton}
      onPress={async () => {
        if (!session) return;
        setRefreshing(true);
        await supabase.functions.invoke('refresh-station-prices', {
          body: { station_ids: stations.slice(0, 25).map((s) => s.id) },
        });
        if (coords) await fetchNearby(coords.latitude, coords.longitude, octane, radius);
        setRefreshing(false);
      }}>
      <Text style={styles.linkButtonText}>Refresh prices</Text>
    </Pressable>
  </View>
```

(Keep the existing `: (` for the `Animated.FlatList` branch unchanged.)

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: errors in `app/(tabs)/index.tsx` are gone. Remaining errors should be in `app/(tabs)/map.tsx` and possibly `app/station/[id].tsx`.

- [ ] **Step 6: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "feat(pumps): default octane to 87, null-aware sort, split empty states"
```

---

## Task 16: Map tab — null-price markers + DEFAULT_OCTANE

**Files:**
- Modify: `app/(tabs)/map.tsx`
- Possibly modify: `app/station/[id].tsx` (only if `tsc` flags it after the above)

- [ ] **Step 1: Add `DEFAULT_OCTANE` to the existing `preferences` import**

Replace the `import { ... } from '@/lib/preferences';` block (around lines 13-20) with:

```ts
import {
  DEFAULT_OCTANE,
  DEFAULT_RADIUS_METERS,
  getPreferredOctane,
  getPreferredRadius,
  setPreferredOctane,
  setPreferredRadius,
  type RadiusMeters,
} from '@/lib/preferences';
```

- [ ] **Step 2: Use `DEFAULT_OCTANE` for the initial octane state**

Replace:

```ts
const [octane, setOctane] = useState<Octane>(93);
```

with:

```ts
const [octane, setOctane] = useState<Octane>(DEFAULT_OCTANE);
```

- [ ] **Step 3: Make the `Marker` render null-aware**

Replace the `{stations.map((s) => (` Marker block (lines 146-162) with:

```tsx
{stations.map((s) => {
  const hasPrice = s.price_cents !== null;
  return (
    <Marker
      key={s.id}
      coordinate={{ latitude: s.latitude, longitude: s.longitude }}
      title={s.brand ?? s.name}
      description={
        hasPrice && s.octane !== null
          ? `${formatPriceCents(s.price_cents as number)} · ${s.octane}`
          : 'no price yet'
      }
      onCalloutPress={() =>
        router.push({
          pathname: '/station/[id]',
          params: { id: s.id, seed: JSON.stringify(s) },
        })
      }>
      <View style={[styles.priceBadge, !hasPrice && styles.priceBadgeMuted]}>
        <Text style={[styles.priceText, !hasPrice && styles.priceTextMuted]}>
          {hasPrice ? formatPriceCents(s.price_cents as number) : '—'}
        </Text>
      </View>
    </Marker>
  );
})}
```

- [ ] **Step 4: Update the empty banner copy**

Replace the existing empty-banner text (around lines 184-186) with two cases:

```tsx
{!refreshing && stations.length === 0 ? (
  <View style={styles.emptyBanner} pointerEvents="none">
    <Text style={styles.emptyBannerText}>
      No stations within this radius. Try a wider radius.
    </Text>
  </View>
) : !refreshing && stations.every((s) => s.price_cents === null) ? (
  <View style={styles.emptyBanner} pointerEvents="none">
    <Text style={styles.emptyBannerText}>
      Stations are here, but no prices for {octane} octane yet.
    </Text>
  </View>
) : null}
```

- [ ] **Step 5: Add the muted badge styles**

Inside `StyleSheet.create({...})`, after the existing `priceText` entry, add:

```ts
priceBadgeMuted: {
  borderColor: colors.paperEdge,
  opacity: 0.6,
},
priceTextMuted: { color: colors.inkSoft },
```

- [ ] **Step 6: TypeScript + lint check**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors related to `map.tsx`. If `app/station/[id].tsx` shows errors about now-nullable `StationWithPrice` fields, fix the smallest set of read sites needed (typical pattern: replace `seed.price_cents` reads with `seed.price_cents ?? null` and guard before formatting). Stage it together with `map.tsx`.

- [ ] **Step 7: Commit**

```bash
git add app/\(tabs\)/map.tsx
# include app/station/[id].tsx if you had to touch it
git commit -m "feat(map): handle null prices on markers + use DEFAULT_OCTANE"
```

---

## Task 17: Client zone helpers — `lib/zones.ts`

**Files:**
- Create: `lib/zones.ts`

- [ ] **Step 1: Write the module**

```ts
import { supabase } from './supabase';

export type UserPriceZone = {
  user_id: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  label: string | null;
  updated_at: string;
};

export const ZONE_RADIUS_OPTIONS_METERS = [5000, 10000, 25000, 50000] as const;
export type ZoneRadiusMeters = (typeof ZONE_RADIUS_OPTIONS_METERS)[number];
export const DEFAULT_ZONE_RADIUS_METERS: ZoneRadiusMeters = 25000;

export async function getZone(userId: string): Promise<UserPriceZone | null> {
  const { data, error } = await supabase
    .from('user_price_zones')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as UserPriceZone) ?? null;
}

export async function saveZone(input: {
  user_id: string;
  latitude: number;
  longitude: number;
  radius_m: ZoneRadiusMeters;
  label?: string | null;
}): Promise<UserPriceZone> {
  const { data, error } = await supabase
    .from('user_price_zones')
    .upsert(
      {
        user_id: input.user_id,
        latitude: input.latitude,
        longitude: input.longitude,
        radius_m: input.radius_m,
        label: input.label ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as UserPriceZone;
}

export async function stationsInCircle(
  latitude: number,
  longitude: number,
  radius_m: number,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('stations_in_circle', {
    p_lat: latitude,
    p_lon: longitude,
    p_radius_m: radius_m,
  });
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id);
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/zones.ts
git commit -m "feat(zones): client helpers for user_price_zones + stations_in_circle"
```

---

## Task 18: `components/zone-picker.tsx`

**Files:**
- Create: `components/zone-picker.tsx`

- [ ] **Step 1: Write the component**

```tsx
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Circle, Marker, type LatLng } from 'react-native-maps';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius as radii, space } from '@/lib/theme';
import {
  DEFAULT_ZONE_RADIUS_METERS,
  ZONE_RADIUS_OPTIONS_METERS,
  type ZoneRadiusMeters,
  getZone,
  saveZone,
  stationsInCircle,
} from '@/lib/zones';

type Pin = LatLng;

const RADIUS_CHIP_LABEL: Record<ZoneRadiusMeters, string> = {
  5000: '5 km',
  10000: '10 km',
  25000: '25 km',
  50000: '50 km',
};

export function ZonePicker() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [pin, setPin] = useState<Pin | null>(null);
  const [zoneRadius, setZoneRadius] = useState<ZoneRadiusMeters>(
    DEFAULT_ZONE_RADIUS_METERS,
  );
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [original, setOriginal] = useState<{
    pin: Pin;
    radius: ZoneRadiusMeters;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const z = await getZone(userId);
      if (z) {
        const p: Pin = { latitude: z.latitude, longitude: z.longitude };
        const r = (ZONE_RADIUS_OPTIONS_METERS.includes(z.radius_m as ZoneRadiusMeters)
          ? z.radius_m
          : DEFAULT_ZONE_RADIUS_METERS) as ZoneRadiusMeters;
        setPin(p);
        setZoneRadius(r);
        setOriginal({ pin: p, radius: r });
      } else {
        // No zone yet — try current location as the default pin.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setPin({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      }
    })();
  }, [userId]);

  const changed = useMemo(() => {
    if (!pin) return false;
    if (!original) return true;
    return (
      pin.latitude !== original.pin.latitude ||
      pin.longitude !== original.pin.longitude ||
      zoneRadius !== original.radius
    );
  }, [pin, zoneRadius, original]);

  const doSearch = useCallback(async () => {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await Location.geocodeAsync(q);
      if (res.length > 0) {
        setPin({ latitude: res[0].latitude, longitude: res[0].longitude });
      } else {
        setToast(`No results for "${q}"`);
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [search]);

  const useGps = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setToast('Location permission denied');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setPin({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
  }, []);

  const save = useCallback(async () => {
    if (!userId || !pin) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await saveZone({
        user_id: userId,
        latitude: pin.latitude,
        longitude: pin.longitude,
        radius_m: zoneRadius,
      });
      setOriginal({ pin, radius: zoneRadius });

      const ids = await stationsInCircle(pin.latitude, pin.longitude, zoneRadius);
      if (ids.length === 0) {
        setToast('Zone saved — no stations to refresh yet.');
        return;
      }

      const firstChunk = ids.slice(0, 25);
      const remaining = Math.max(0, ids.length - firstChunk.length);

      const { error } = await supabase.functions.invoke('refresh-station-prices', {
        body: { station_ids: firstChunk },
      });
      if (error) {
        setToast(`Zone saved. First refresh failed: ${error.message}`);
      } else if (remaining > 0) {
        setToast(
          `Refreshed ${firstChunk.length} of ${ids.length} — the rest land by tomorrow.`,
        );
      } else {
        setToast(`Refreshed prices for ${firstChunk.length} stations.`);
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [userId, pin, zoneRadius]);

  if (!userId) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>
        We refresh gas prices daily for stations inside this circle.
      </Text>

      <View style={styles.mapWrap}>
        {pin ? (
          <MapView
            style={styles.map}
            region={{
              latitude: pin.latitude,
              longitude: pin.longitude,
              latitudeDelta: zoneRadius / 50000,
              longitudeDelta: zoneRadius / 50000,
            }}
            onPress={(e) => setPin(e.nativeEvent.coordinate)}>
            <Marker coordinate={pin} pinColor={colors.rust} />
            <Circle
              center={pin}
              radius={zoneRadius}
              strokeColor={colors.rust}
              fillColor="rgba(178, 84, 56, 0.12)"
            />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.muted}>Pick a location to begin.</Text>
          </View>
        )}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={15} color={colors.inkSoft} />
          <TextInput
            style={styles.searchInput}
            placeholder="search city, zip, or address"
            placeholderTextColor={colors.inkFaint}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={doSearch}
            editable={!searching}
          />
          {searching ? <ActivityIndicator color={colors.rust} /> : null}
        </View>
        <Pressable
          onPress={useGps}
          style={({ pressed }) => [styles.gpsButton, pressed && styles.btnPressed]}>
          <Ionicons name="navigate" size={14} color={colors.amber} />
          <Text style={styles.gpsButtonText}>GPS</Text>
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        {ZONE_RADIUS_OPTIONS_METERS.map((r) => {
          const active = r === zoneRadius;
          return (
            <Pressable
              key={r}
              onPress={() => {
                if (!active) Haptics.selectionAsync();
                setZoneRadius(r);
              }}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {RADIUS_CHIP_LABEL[r]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        disabled={!changed || saving}
        onPress={save}
        style={({ pressed }) => [
          styles.saveButton,
          (!changed || saving) && styles.saveButtonDisabled,
          pressed && styles.btnPressed,
        ]}>
        <Text style={styles.saveButtonText}>
          {saving ? 'SAVING…' : 'SAVE ZONE'}
        </Text>
      </Pressable>

      {toast ? <Text style={styles.toast}>{toast}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.paperEdge,
    gap: 10,
  },
  subtitle: {
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    color: colors.inkSoft,
  },
  mapWrap: { height: 180, borderRadius: radii.md, overflow: 'hidden' },
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  muted: {
    color: colors.inkSoft,
    fontFamily: fonts.bodyItalic,
    fontSize: 14,
  },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.paperEdge,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.ink,
    borderRadius: radii.md,
  },
  gpsButtonText: {
    color: colors.amber,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  chipsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.dust,
    backgroundColor: colors.paper,
  },
  chipActive: {
    borderColor: colors.rust,
    backgroundColor: colors.rust,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.inkSoft,
    letterSpacing: 1,
  },
  chipTextActive: { color: colors.paper, fontFamily: fonts.bodyBold },
  saveButton: {
    marginTop: 6,
    paddingVertical: 12,
    backgroundColor: colors.rust,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  saveButtonDisabled: { backgroundColor: colors.dust },
  saveButtonText: {
    color: colors.paper,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 2,
  },
  btnPressed: { opacity: 0.85 },
  toast: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.inkSoft,
  },
});
```

- [ ] **Step 2: TypeScript + lint check**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/zone-picker.tsx
git commit -m "feat(settings): zone picker component (map + search + GPS + chips)"
```

---

## Task 19: Mount `<ZonePicker />` in Settings

**Files:**
- Modify: `app/(tabs)/settings.tsx`

- [ ] **Step 1: Add the import**

Near the top, add:

```ts
import { ZonePicker } from '@/components/zone-picker';
```

- [ ] **Step 2: Mount the section**

Between the `ACCOUNT` section and the `FAVORITES` section (after the closing `</View>` of the account section, before the `{session ? (` favorites block), add:

```tsx
{session ? (
  <View style={styles.section}>
    <Text style={styles.sectionHeader}>PRICE TRACKING ZONE</Text>
    <ZonePicker />
  </View>
) : null}
```

- [ ] **Step 3: TypeScript + lint check**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/settings.tsx
git commit -m "feat(settings): mount zone picker between Account and Favorites"
```

---

## Task 20: Schedule the daily cron

**Files:** none (one-time DB action; document in `supabase/README.md`)

- [ ] **Step 1: Pick the project-specific URL + service-role key**

```bash
supabase status            # local
supabase projects list     # hosted
```

For a hosted project, the function URL is `https://<project-ref>.functions.supabase.co/refresh-prices`. The service-role key is in the project's API settings page.

- [ ] **Step 2: Schedule pg_cron via SQL editor**

Run (substitute `<url>` and `<service-role-key>`):

```sql
select cron.schedule(
  'refresh-prices-daily',
  '0 11 * * *',
  $$
    select net.http_post(
      url := '<url>',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <service-role-key>'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

Expected: returns a non-null job_id.

- [ ] **Step 3: Verify the job exists**

Run: `select jobid, schedule, jobname from cron.job where jobname = 'refresh-prices-daily';`
Expected: one row.

- [ ] **Step 4: Append to `supabase/README.md`**

Under the existing "Price alerts" / cron section, add a paragraph explaining the new daily `refresh-prices` schedule and where to bump cadence.

- [ ] **Step 5: Commit**

```bash
git add supabase/README.md
git commit -m "docs(supabase): document the refresh-prices daily cron schedule"
```

---

## Task 21: End-to-end smoke test in Expo Go

**Files:** none (verification only)

- [ ] **Step 1: Boot the app**

Run: `npm install && npx expo start`
Open in Expo Go on a device signed in to a test account.

- [ ] **Step 2: Set a zone**

- Navigate to **Garage** (Settings).
- New section **PRICE TRACKING ZONE** is visible below Account.
- Tap **GPS** → pin lands on Troy NY (or wherever you are).
- Tap a chip (e.g. 25 km) → circle resizes on the map.
- Tap **SAVE ZONE** → toast: `Refreshed prices for N stations.`

- [ ] **Step 3: Verify Pumps tab reflects real prices**

- Navigate to **Pumps**.
- Default octane chip = 87 (highlighted).
- Stations inside your zone show real `$` prices with the `live` source label.
- Pull to refresh — list re-fetches without errors.

- [ ] **Step 4: Verify out-of-zone empty states**

- In the Pumps search box, type a city far outside your zone (e.g. "Phoenix, AZ") and submit.
- If `ingest-stations` was never run there, expect: "No stations within {radius} of here…"
- Run `ingest-stations` for that area, repeat. Expect: "Stations are here, but we don&apos;t have prices for 87 octane yet." with a **Refresh prices** button.
- Tap Refresh prices — quota-allowed call succeeds; list re-renders with prices.

- [ ] **Step 5: Verify Map tab**

- Navigate to **Atlas**.
- Markers in zone show price badges; markers outside (if any) show muted `—`.

- [ ] **Step 6: Done — no commit (verification only)**

If anything in this step fails, file a bug against the relevant earlier task and fix forward.

---

## Self-review notes (already addressed)

- Every spec section maps to a task: data model → 1–6, edge functions → 7–11, settings UI → 17–19, Pumps cleanup → 12–16, cron → 20, smoke → 21.
- No placeholders — every code step shows the actual code, every command shows the actual command.
- Type consistency: `MappedPrice` shape, `StationWithPrice` nullable fields, and `SourceKind` widening match across tasks 7, 8, 9, 12, 14, 15, 16.
- The Settings UI requires Task 17 (`lib/zones.ts`) before Task 18 (`zone-picker.tsx`); Task 19 mounts. Ordering is enforced by the file dependencies.
- Task 11 is non-committing verification but flagged so the runner knows to amend the precipitating task if a bug surfaces.
