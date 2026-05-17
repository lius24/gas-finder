# gas-finder backend

Schema migrations and Supabase edge functions backing the Expo client.

## Layout

```
supabase/
  config.toml                      Local CLI config
  migrations/
    20260425000000_initial_schema.sql
    20260502000000_alerts.sql      Price-drop notifications (favorites.alert_octane,
                                   device_tokens, price_alerts, RPCs)
  functions/
    _shared/
      cors.ts                      CORS + JSON helpers
      ocr.ts                       Price-photo OCR (stubbed; pluggable)
    nearby/index.ts                POST { lat, lon, octane, radius } → StationWithPrice[]
    station/index.ts               POST { id } → { station, prices[] }
    report/index.ts                POST { photo_path, lat, lon, station_id? } → { report_id, parsed_prices }
    send-price-alerts/index.ts     Cron-triggered. Scans favorites with thresholds,
                                   sends Expo pushes for new sub-threshold prices.
    ingest-stations/index.ts       Admin-only. Pulls gas stations from Google Places
                                   "Nearby Search" and upserts into `stations`.
```

## Local dev

```bash
# One-time
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>

# Day to day
supabase start                     # boots local Postgres + studio + auth + storage
supabase db reset                  # applies all migrations into the local DB
supabase functions serve nearby    # run a single function locally
```

Point the Expo client at the local API by setting in `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<from `supabase status`>
```

## Deploy

```bash
supabase db push                                # apply migrations to remote
supabase functions deploy nearby station report send-price-alerts ingest-stations
```

## What's modeled

- **stations** — public read. Generated `location` geography column + GiST index for fast `ST_DWithin` lookups.
- **prices** — public read. One row per (station, octane, observation). The "current" price for a station/octane is the most recent row.
- **favorites** — user-scoped via RLS (`auth.uid() = user_id`). `alert_threshold_cents` + `alert_octane` drive the price-drop push (see "Price alerts" below).
- **reports** — user-scoped read. Writes go through the `report` edge function with the service role.
- **device_tokens** — Expo push tokens, one row per (user, token). User-scoped RLS; the worker reads via service role.
- **price_alerts** — dedupe ledger, `(user_id, station_id, octane, price_cents)` unique. Inserted by `send-price-alerts` so each price drop only fires once.

Storage bucket `reports` accepts uploads from anon + authenticated. Reads are restricted to the uploader's own folder (`crowd/<uid>/...`) — the edge function reads via service role.

## OCR

`functions/_shared/ocr.ts` ships as a stub that returns `[]`. Reports land in `pending` for manual review until you wire a real provider.

To enable Google Cloud Vision:

1. Enable the Vision API in a GCP project, mint an API key, restrict it to Vision + your function's IP.
2. `supabase secrets set GOOGLE_VISION_API_KEY=...`
3. In `ocr.ts:ocrImage`, POST to `https://vision.googleapis.com/v1/images:annotate?key=...` with a `TEXT_DETECTION` feature, then feed the response text into `parsePricesFromText`.

The price parser is already shared between client and server (`lib/ocr.ts` mirrors `_shared/ocr.ts`). Keep them in sync.

## RLS smoke tests

```sql
-- anonymous: should succeed
select count(*) from stations;
select count(*) from prices;

-- anonymous: should fail
select * from favorites;

-- authenticated as user A: should only return A's rows
select * from favorites;
```

## Price alerts

When a favorite has both `alert_threshold_cents` and `alert_octane` set, the
`send-price-alerts` edge function fires an Expo push the next time the latest
price for that (station, octane) is at or below the threshold. Each unique
`(user, station, octane, price_cents)` only fires once — the dedupe row is
inserted atomically before any push is sent.

Schedule the worker via pg_cron + pg_net (already-enabled extensions on hosted
Supabase). Run this in the SQL editor once, swapping in your project URL and
service-role key:

```sql
select cron.schedule(
  'send-price-alerts',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://<your-project-ref>.supabase.co/functions/v1/send-price-alerts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $job$
);
```

Alternatively use the Supabase Studio "Cron jobs" UI under Database, which
exposes the same primitive without raw SQL.

To smoke-test the worker without waiting for cron:

```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/send-price-alerts" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
# → { "scanned": N, "sent": M, "deduped": K, "invalidated": 0 }
```

The function also auto-purges any token that returns `DeviceNotRegistered`
from Expo, so stale records don't pile up.

## Daily price refresh (Google Places `fuelOptions`)

`refresh-prices` is a cron-triggered worker that pulls live gas prices from
Google Places `fuelOptions` for every station inside any user's
`user_price_zones` circle, upserting rows into `prices` with
`source_kind = 'google'`. The companion `refresh-station-prices` handles
on-demand pull-to-refresh from the app (JWT-authed, 5 calls / 24 h per user
via `price_refresh_log`).

Required secret (server-side; do **not** reuse the mobile maps key — restrict
the server key to "Places API (New)" only):

```bash
supabase secrets set GOOGLE_PLACES_API_KEY=AIza...
```

Schedule the daily worker via pg_cron + pg_net. Run this in the SQL editor
once, swapping in your project URL and service-role key (the
`cron.unschedule` guard makes it safe to re-run):

```sql
do $$
begin
  perform cron.unschedule('refresh-prices-daily');
exception when others then null;
end $$;

select cron.schedule(
  'refresh-prices-daily',
  '0 11 * * *',
  $job$
    select net.http_post(
      url := 'https://<your-project-ref>.supabase.co/functions/v1/refresh-prices',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $job$
);
```

Cadence dial: `'0 11 * * *'` is daily at 11:00 UTC. Switch to `'0 11 */2 * *'`
for every other day (halves the bill) or `'0 11 */3 * *'` for every third
day. Gas prices typically move once a day, so daily is the upper bound on
freshness anyone needs.

Stations that return no usable `fuelOptions` get their `places_fuel_attempts`
counter incremented; after three failures and `places_fuel_seen_at IS NULL`
they're demoted to Sunday-only retries — cost control for permanently dead
place IDs.

To smoke-test the worker without waiting for cron:

```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/refresh-prices" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
# → { "checked": N, "api_calls": N, "updated": M, "skipped": K, "demoted": D }
```

## Bulk station ingestion (Google Places)

Bootstrap a region's stations without hand-curating SQL. Uses Google Places
**Nearby Search (New)** API; you need a GCP project with the Places API
enabled and a billing account attached (free tier covers most personal
use — pricing at https://developers.google.com/maps/billing-and-pricing).

```bash
# 1. Set the secret (server-side; do NOT reuse the mobile maps key here —
# server-side keys can stay unrestricted but should be server-side only)
supabase secrets set GOOGLE_PLACES_API_KEY=AIza...

# 2. Deploy the function
supabase functions deploy ingest-stations

# 3. Invoke for a 5km radius around downtown Sedona
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/ingest-stations" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"latitude":34.8697,"longitude":-111.7610,"radius_m":5000}'
# → { "found": 14, "upserted": 14, "sample": [{name, brand}, ...] }
```

Limits: Google's `circle.radius` is capped at 50km and the API returns at
most 20 results per call. To cover a wider region, call this multiple times
with overlapping circle centers — the upsert key (`google_place_id`)
deduplicates automatically.

The function does NOT seed prices. After ingestion you still need price data
from a scraper or crowd reports; the `prices` table stays empty until something
writes to it.

Brand detection is name-based against a known-brand list. Unknown brands are
left as `null` and the station still appears in queries.

## Open follow-ups

- Admin UI / SQL workflow to flip `reports.status` between `pending`/`accepted`/`rejected` after manual review, and to backfill `prices` rows from accepted reports if OCR is off.
- Seed data — none included; ingest pipeline (scrapers) lives outside this repo.
