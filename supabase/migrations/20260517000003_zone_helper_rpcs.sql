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
