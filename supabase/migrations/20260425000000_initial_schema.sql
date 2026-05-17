-- Initial schema for gas-finder.
-- Tables: stations, prices, favorites, reports.
-- RPCs: nearby_stations_with_price, latest_prices_for_station, nearest_station.

create extension if not exists postgis;
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- stations
-- ----------------------------------------------------------------------------
create table public.stations (
  id uuid primary key default gen_random_uuid(),
  brand text,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  google_place_id text unique,
  location geography(point, 4326) generated always as (
    st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
  ) stored,
  created_at timestamptz not null default now()
);

create index stations_location_idx on public.stations using gist (location);
create index stations_brand_idx on public.stations (brand);

alter table public.stations enable row level security;

create policy stations_read_all
  on public.stations for select
  to anon, authenticated
  using (true);

-- Writes happen via edge functions using service role.

-- ----------------------------------------------------------------------------
-- prices
-- ----------------------------------------------------------------------------
create table public.prices (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  octane smallint not null check (octane in (87, 89, 91, 93)),
  price_cents int not null check (price_cents between 50 and 1500),
  source_kind text not null check (source_kind in ('scrape', 'crowd', 'official')),
  observed_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index prices_station_octane_observed_idx
  on public.prices (station_id, octane, observed_at desc);

alter table public.prices enable row level security;

create policy prices_read_all
  on public.prices for select
  to anon, authenticated
  using (true);

-- Writes happen via edge functions using service role.

-- ----------------------------------------------------------------------------
-- favorites
-- ----------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  alert_threshold_cents int,
  created_at timestamptz not null default now(),
  primary key (user_id, station_id)
);

create index favorites_user_idx on public.favorites (user_id);

alter table public.favorites enable row level security;

create policy favorites_select_own
  on public.favorites for select
  to authenticated
  using (user_id = auth.uid());

create policy favorites_insert_own
  on public.favorites for insert
  to authenticated
  with check (user_id = auth.uid());

create policy favorites_update_own
  on public.favorites for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy favorites_delete_own
  on public.favorites for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- reports
-- ----------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  photo_path text not null,
  parsed_prices jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_status_idx on public.reports (status);
create index reports_user_idx on public.reports (user_id);
create index reports_station_idx on public.reports (station_id);

alter table public.reports enable row level security;

create policy reports_select_own
  on public.reports for select
  to authenticated
  using (user_id = auth.uid());

-- Writes happen via edge functions using service role.

-- ----------------------------------------------------------------------------
-- Storage bucket: reports (photos uploaded by clients)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy reports_bucket_upload
  on storage.objects for insert
  to authenticated, anon
  with check (bucket_id = 'reports');

-- Read access for owner only (service role bypasses RLS).
create policy reports_bucket_read_own
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = 'crowd'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- RPC: nearby stations with latest price for an octane
-- ----------------------------------------------------------------------------
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
  join latest_price lp on lp.station_id = w.id
  order by w.distance_meters asc;
$$;

grant execute on function public.nearby_stations_with_price(
  double precision, double precision, smallint, double precision
) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RPC: latest price per octane for one station
-- ----------------------------------------------------------------------------
create or replace function public.latest_prices_for_station(p_station_id uuid)
returns table (
  octane smallint,
  price_cents int,
  source_kind text,
  observed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (octane)
    octane, price_cents, source_kind, observed_at
  from public.prices
  where station_id = p_station_id
  order by octane, observed_at desc;
$$;

grant execute on function public.latest_prices_for_station(uuid)
  to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RPC: nearest station within a radius (used by report function for snapping)
-- ----------------------------------------------------------------------------
create or replace function public.nearest_station(
  p_lat double precision,
  p_lon double precision,
  p_max_meters double precision default 200
)
returns table (id uuid, distance_meters double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    s.id,
    st_distance(s.location, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) as distance_meters
  from public.stations s
  where st_dwithin(
    s.location,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
    p_max_meters
  )
  order by distance_meters asc
  limit 1;
$$;

grant execute on function public.nearest_station(double precision, double precision, double precision)
  to anon, authenticated, service_role;
