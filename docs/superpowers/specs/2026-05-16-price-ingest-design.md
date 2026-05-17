# Price Ingest — Design

Date: 2026-05-16
Status: approved, awaiting implementation plan

## Problem

The app already pulls **stations** from Google Places (`ingest-stations`) and supports crowd-OCR **price** uploads, but the `prices` table has no automated source. Without real price data the rest of the app is decorative.

This spec adds an automated price source backed by Google Places `fuelOptions`, scoped to a per-user "home zone" so cost is bounded, and reshapes the Pumps tab so the list still makes sense when a user browses outside any tracked area.

## Decisions

| Question | Answer |
|---|---|
| Primary data source | Google Places `fuelOptions` (Details New, Enterprise SKU). |
| Coverage model | Per-user "home zone" circle. Worker ingests union of all users' zones. |
| Zone storage | New `user_price_zones` table, one zone per user (PK = `user_id`). |
| Zone picker | Address search + tap-on-map + "use current location", radius chips 5 / 10 / 25 / 50 km, default 25 km. |
| Refresh cadence | Daily cron + on-demand pull-to-refresh (per-user quota). |
| Budget cap | None for v1 — watch Google billing dashboard. |
| Crowd OCR | Unchanged. Latest `observed_at` wins regardless of source. |

## Non-goals (v1)

- Multi-zone per user (Home + Work). Schema is forward-compatible.
- Diesel / E85 / non-gasoline fuels. DB `octane` CHECK still 87/89/91/93.
- Region-specific Premium overrides beyond the lat-cut heuristic.
- A daily $ kill switch on the worker.
- Fixing the known toolbar-collapse regression on the Pumps tab.

---

## Data model

Two migrations.

### `user_price_zones`

```sql
create table public.user_price_zones (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  latitude   double precision not null,
  longitude  double precision not null,
  radius_m   integer not null check (radius_m between 1000 and 50000),
  label      text,                       -- optional ("Home")
  updated_at timestamptz not null default now()
);

alter table public.user_price_zones enable row level security;

create policy user_price_zones_select_own on public.user_price_zones
  for select to authenticated using (user_id = auth.uid());
create policy user_price_zones_insert_own on public.user_price_zones
  for insert to authenticated with check (user_id = auth.uid());
create policy user_price_zones_update_own on public.user_price_zones
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_price_zones_delete_own on public.user_price_zones
  for delete to authenticated using (user_id = auth.uid());
```

One row per user. PK is `user_id` so upsert-by-user is trivial. If multi-zone is added later, the PK extends to `(user_id, slot)` — the existing row migrates to `slot = 0`.

### Widen `prices.source_kind`

```sql
alter table public.prices
  drop constraint prices_source_kind_check,
  add  constraint prices_source_kind_check
    check (source_kind in ('scrape','crowd','official','google'));
```

`'google'` is the new automated path. `'crowd'` continues to mean OCR uploads. `'scrape'` and `'official'` are kept for future sources / manual seeding.

### Dead-station tracking on `stations`

```sql
alter table public.stations
  add column places_fuel_seen_at timestamptz,
  add column places_fuel_attempts integer not null default 0;
```

Set by the worker: `places_fuel_seen_at = now()` on any successful fuelOptions response; `places_fuel_attempts` increments per attempt that returned no `fuelPrices`. Used by the worker's demotion logic — see below.

### `stations_in_any_zone` helper RPC

```sql
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
```

Worker uses this to compute its full work set in one query. Deduplicates stations covered by multiple users.

### `stations_in_circle` helper RPC

```sql
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
grant execute on function public.stations_in_circle(double precision, double precision, integer)
  to authenticated, service_role;
```

Used by the Settings screen after a zone save to seed the on-demand refresh.

### Widen `nearby_stations_with_price` to LEFT JOIN

The current RPC inner-joins `prices`, hiding any station without a row for the requested octane. After ingest, "no price yet" is a legitimate state. Switch to `left join`, mark price columns nullable, sort null-priced rows after priced ones:

```sql
-- (replaces existing RPC; full migration in implementation)
left join latest_price lp on lp.station_id = w.id
order by lp.price_cents asc nulls last, w.distance_meters asc;
```

`lib/types.ts:StationWithPrice` becomes:

```ts
type StationWithPrice = {
  id: string;
  brand: string | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  google_place_id: string | null;
  octane: Octane | null;
  price_cents: number | null;
  source_kind: SourceKind | null;
  observed_at: string | null;
  distance_meters: number;
};
```

### `price_refresh_log` (on-demand quota)

```sql
create table public.price_refresh_log (
  user_id   uuid not null references auth.users(id) on delete cascade,
  called_at timestamptz not null default now(),
  station_count smallint not null
);
create index price_refresh_log_user_idx
  on public.price_refresh_log (user_id, called_at desc);
alter table public.price_refresh_log enable row level security;
-- no policies: only service role reads/writes.
```

Counted by `refresh-station-prices`; window is rolling 24h.

---

## Edge functions

### `refresh-prices` (cron, service role)

- Verb: POST, `verify_jwt = false` (cron-only).
- Reads station IDs from `stations_in_any_zone()`.
- Applies demotion: a station with `places_fuel_seen_at is null and places_fuel_attempts >= 3` is only processed on Sundays (UTC). Anything that has ever returned data is processed daily.
- For each station, calls `https://places.googleapis.com/v1/places/{place_id}` with field mask `id,fuelOptions`. Uses the existing `GOOGLE_PLACES_API_KEY`.
- Parses `fuelOptions.fuelPrices[]`. For each entry:
  - Map `type` → octane via the table in **Defaults**. If unmappable, skip.
  - `price = parseFloat(price.units + '.' + nanos→fraction)`, convert to cents.
  - Skip if `updateTime <= latest observed_at we have for (station, octane, 'google')` — saves a DB write but not the API call.
  - Else insert a `prices` row with `source_kind='google'`, `observed_at = updateTime`.
- Updates `stations.places_fuel_seen_at` / `places_fuel_attempts` accordingly.
- Returns `{ checked, updated, skipped, demoted }` for cron logs.

Cron via pg_cron + pg_net, mirroring `send-price-alerts`:

```sql
select cron.schedule('refresh-prices-daily', '0 11 * * *',
  $$ select net.http_post(url := ..., headers := ...) $$);
```

### `refresh-station-prices` (on-demand, JWT required)

- Body: `{ station_ids: string[] }`, max 25.
- Auth: JWT, derives `user_id`. No service-role bypass.
- Rate limit: count rows in `price_refresh_log` where `user_id = ? and called_at > now() - interval '24 hours'`. If `>= 5`, return `429 { error: 'quota_exceeded', retry_after: <seconds-until-oldest-row-ages-out> }`.
- Otherwise: same per-station Places call as `refresh-prices`, same upsert, returns the freshly-written rows so the client can render immediately.
- Inserts a `price_refresh_log` row on every call (even partial success) with the requested station_count.

### Existing `ingest-stations` — unchanged.

---

## Settings UI — `app/(tabs)/settings.tsx`

New card: **"Price tracking zone"**.

Layout:
1. Subtitle: "We refresh gas prices daily for stations inside this circle."
2. Embedded map (`react-native-maps`, ~180 px, non-scrollable inside the page) showing the current pin and radius circle.
3. Three pickers in a row:
   - **Search** — text input, submit calls `expo-location.geocodeAsync(q)`, takes the first result.
   - **Tap map** — `onPress` on the map drops the pin at the tap coords.
   - **Use current location** — calls `expo-location.getCurrentPositionAsync()` (foreground permission, mirrors the request the Pumps tab already makes).
4. Radius chips: `5 / 10 / 25 / 50 km`. Default 25. Tapping a chip updates the circle overlay immediately.
5. Footer: **Save zone** button, disabled until something changed.

On save:
1. Upsert `user_price_zones` row.
2. Call a new lightweight RPC `stations_in_circle(lat, lon, radius_m)` (returns `station_id[]`) to get the set of station IDs inside the new circle.
3. POST those IDs (chunked to ≤25 each) to `refresh-station-prices` and await the response. Show a toast based on what came back:
   - All chunks succeeded: "Refreshed prices for {N} stations."
   - Quota exhausted partway: "Refreshed first {N} of {M} — the rest land by tomorrow." (Cron picks up the remainder within 24h.)

Empty state (no zone set yet): card shows the pickers with a default pin on current GPS (if granted) or a copy nudge to enable location.

Implementation files:
- `components/zone-picker.tsx` — the new card and its state machine.
- `lib/zones.ts` — Supabase read/write for `user_price_zones`.
- `app/(tabs)/settings.tsx` — mounts `<ZonePicker />`.

---

## Pumps tab cleanup

Scoped to fallout from the new feature.

### `components/station-card.tsx`

- Null-price rendering: when `price_cents == null`, the pump display shows a dimmed `—.—` glyph; meta row omits source/stale; cheapest/closest stamps suppressed.
- `sourceLabel` switch becomes exhaustive: add `case 'google': return 'live'`. Default branch becomes `assertNever`. Add `case null: return null` (and skip the meta separator) for null-priced cards.

### `app/(tabs)/index.tsx`

- Empty/coverage states split:
  - **Zero stations in radius** (`data.length === 0`): "No stations within {radius} of here. Try a wider radius."
  - **Stations exist but no prices for this octane** (`data.length > 0 && data.every(s => s.price_cents == null)`): "Stations are here, but we don't have prices for them yet." Sub-action button: "Refresh prices for visible stations" → calls `refresh-station-prices` with the visible IDs (subject to quota).
- Sort comparator:
  - `'cheapest'`: priced rows ascending by `price_cents`, then null-priced rows by distance.
  - `'closest'`: by `distance_meters` ascending; null-priced rows participate normally.
- `cheapestId` / `closestId` derivations skip rows where `price_cents == null`.

### Default octane

- Flip the default from 93 → **87**. Currently hardcoded in `app/(tabs)/index.tsx` (`useState<Octane>(93)`) and the Map tab — extract to a new `DEFAULT_OCTANE = 87` export in `lib/preferences.ts` so the two tabs share one source.
- De-risks the regional `PREMIUM` mapping and ensures the highest-coverage fuel type is the default view.

### Map tab — `app/(tabs)/map.tsx`

- Markers with `price_cents == null` render in a muted color without a price badge. Same nullability flows from the same `nearby` RPC.

### Out of scope

- Collapsing-toolbar geometry (`project_open_scroll_collapse.md`).
- Search / recents UX.
- `locationCorner` 45° amber square.

---

## Defaults & edge cases

### Google fuel-type → DB octane

| Google `type` | DB `octane` |
|---|---|
| `REGULAR_UNLEADED` | 87 |
| `MIDGRADE` | 89 |
| `PREMIUM` | **93 if longitude > −100, else 91** (rough Mississippi cut) |
| `DIESEL`, `E85`, `BIO_DIESEL`, `TRUCK_DIESEL`, anything else | skip (DB constraint doesn't permit) |
| Unknown / new types | skip, log once |

The Premium heuristic is a pragmatic v1 — Troy NY lands on 93, Los Angeles lands on 91. If real-world drift is observed (e.g. stations near the cut), add a per-state override table in a follow-up.

### Source priority (collisions)

A station may accumulate `google` and `crowd` rows for the same (station, octane). The "latest price" RPCs already pick the most recent `observed_at`. Recency wins. Rationale: a user OCR'ing a pump *right now* should beat a 6-hour-old Google reading, and vice versa.

### Dead-station demotion

- `places_fuel_seen_at is null and places_fuel_attempts >= 3` ⇒ worker only processes on Sundays (UTC).
- First successful response clears the demotion (sets `places_fuel_seen_at`, leaves attempts alone — it's now treated as "active" regardless of attempt count).
- Demotion is silent — no surfacing to users.

### On-demand quota

- 5 refreshes/24h per user, sliding window over `price_refresh_log`.
- `429 { error: 'quota_exceeded', retry_after: <seconds> }` when over.
- Zone-change first-batch refreshes count against the quota. If the new zone has more stations than the quota allows, chunk what fits and show "first batch live, rest by tomorrow"; cron picks up the remainder within 24h.

### Cost estimate

- ~150 stations in a 25 km radius around Troy NY (rough order of magnitude).
- Daily cron: 150 × $0.02 = ~$3/day for one user.
- Multi-user dedup is automatic via `stations_in_any_zone()` — 10 users in the same metro is still ~150 stations.
- Pull-to-refresh: bounded at 5 × ~25 = 125 stations/user/day = ~$2.50/user/day worst case.
- No hard cap; watch Google billing dashboard.

---

## Open questions

None — all decisions captured above. Defaults marked as such; deviations should be raised at plan review.

## Deferred (intentionally) to later specs

- Multi-zone per user (Home + Work).
- Diesel / E85 / non-gasoline support.
- Per-state Premium override table.
- Daily $ kill switch on the worker.
- Toolbar-collapse fix on the Pumps tab.
