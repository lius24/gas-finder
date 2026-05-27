-- Add `last_verified_at` to prices: the last time refresh-prices successfully
-- fetched this (station, octane) from the upstream feed, regardless of whether
-- a new row was written.
--
-- Why: `observed_at` carries Google's `fp.updateTime` — the timestamp the pump
-- last reported a price change. For low-volume or price-stable stations that
-- can sit unchanged for weeks while the cron is running daily and the price
-- is in fact current. The frontend's HIDE_AFTER_HOURS cutoff was reading
-- `observed_at` and hiding the entire list once Google's clock froze even
-- briefly, producing the "0 stations" symptom on 2026-05-27.
--
-- Split the two concerns: `observed_at` stays as truth-of-price-age (drives
-- the "Xd old" chip), and `last_verified_at` drives visibility (system
-- freshness — "we checked yesterday, the price is still what Google says").

alter table public.prices
  add column last_verified_at timestamptz not null default now();

-- Backfill so existing rows aren't instantly hidden on rollout. The cron
-- has been running daily and successfully fetching these (station, octane)
-- pairs — it just hasn't been writing new rows when Google's updateTime
-- didn't move. So at migration time every row was effectively verified
-- within the last cron interval. now() reflects that ground truth.
update public.prices set last_verified_at = now();

create index prices_station_octane_verified_idx
  on public.prices (station_id, octane, last_verified_at desc);

-- Replace nearby_stations_with_price to surface the new column. RPC shape is
-- additive; the frontend reads last_verified_at off each row.
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
  last_verified_at timestamptz,
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
      p.observed_at,
      p.last_verified_at
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
    lp.last_verified_at,
    w.distance_meters
  from within_radius w
  left join latest_price lp on lp.station_id = w.id
  order by lp.price_cents asc nulls last, w.distance_meters asc;
$$;

grant execute on function public.nearby_stations_with_price(
  double precision, double precision, smallint, double precision
) to anon, authenticated, service_role;
