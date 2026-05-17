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
