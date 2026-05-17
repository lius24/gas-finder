-- Price-drop notifications.
--
-- Adds:
--   * favorites.alert_octane            — which octane the threshold applies to.
--   * device_tokens                     — Expo push tokens per user/device.
--   * price_alerts                      — per-(user, station, octane, price_cents)
--                                         dedupe ledger so we send each drop once.
--   * pending_price_alerts() RPC        — returns rows the worker should send.
--   * mark_price_alert_sent() RPC       — atomic insert-if-missing dedupe row.

-- ----------------------------------------------------------------------------
-- favorites.alert_octane
-- ----------------------------------------------------------------------------
alter table public.favorites
  add column if not exists alert_octane smallint
    check (alert_octane is null or alert_octane in (87, 89, 91, 93));

-- ----------------------------------------------------------------------------
-- device_tokens
-- ----------------------------------------------------------------------------
create table public.device_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text check (platform in ('ios', 'android', 'web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, expo_push_token)
);

create index device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

create policy device_tokens_select_own
  on public.device_tokens for select
  to authenticated
  using (user_id = auth.uid());

create policy device_tokens_insert_own
  on public.device_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

create policy device_tokens_update_own
  on public.device_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy device_tokens_delete_own
  on public.device_tokens for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- price_alerts (dedupe ledger; service-role only)
-- ----------------------------------------------------------------------------
create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  octane smallint not null check (octane in (87, 89, 91, 93)),
  price_cents int not null,
  sent_at timestamptz not null default now()
);

-- One alert per (user, station, octane, price_cents). If the price drops
-- further later, that's a new (price_cents) row and a new alert.
create unique index price_alerts_dedupe_idx
  on public.price_alerts (user_id, station_id, octane, price_cents);

create index price_alerts_user_idx on public.price_alerts (user_id);

alter table public.price_alerts enable row level security;

-- Users can read their own alert history (for a future "alerts" tab); writes
-- happen via service role.
create policy price_alerts_select_own
  on public.price_alerts for select
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RPC: pending_price_alerts
--
-- Returns one row per favorite whose latest price for the chosen octane is at
-- or below the user's threshold AND has not been alerted on yet for that exact
-- (price_cents). The worker then sends pushes and writes a price_alerts row.
-- ----------------------------------------------------------------------------
create or replace function public.pending_price_alerts()
returns table (
  user_id uuid,
  station_id uuid,
  station_name text,
  station_brand text,
  octane smallint,
  price_cents int,
  threshold_cents int,
  observed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with latest_price as (
    select distinct on (station_id, octane)
      station_id, octane, price_cents, observed_at
    from public.prices
    order by station_id, octane, observed_at desc
  )
  select
    f.user_id,
    f.station_id,
    s.name           as station_name,
    s.brand          as station_brand,
    lp.octane,
    lp.price_cents,
    f.alert_threshold_cents as threshold_cents,
    lp.observed_at
  from public.favorites f
  join latest_price lp
    on lp.station_id = f.station_id
   and lp.octane     = f.alert_octane
  join public.stations s on s.id = f.station_id
  where f.alert_threshold_cents is not null
    and f.alert_octane          is not null
    and lp.price_cents <= f.alert_threshold_cents
    and not exists (
      select 1 from public.price_alerts pa
      where pa.user_id     = f.user_id
        and pa.station_id  = f.station_id
        and pa.octane      = lp.octane
        and pa.price_cents = lp.price_cents
    );
$$;

revoke all on function public.pending_price_alerts() from anon, authenticated;
grant execute on function public.pending_price_alerts() to service_role;

-- ----------------------------------------------------------------------------
-- RPC: mark_price_alert_sent
--
-- Inserts a dedupe row. Returns true if this call wrote a new row (i.e. the
-- caller "won" the dedupe race), false if a row already existed. The worker
-- should send the push only when this returns true.
-- ----------------------------------------------------------------------------
create or replace function public.mark_price_alert_sent(
  p_user_id uuid,
  p_station_id uuid,
  p_octane smallint,
  p_price_cents int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  insert into public.price_alerts (user_id, station_id, octane, price_cents)
  values (p_user_id, p_station_id, p_octane, p_price_cents)
  on conflict (user_id, station_id, octane, price_cents) do nothing;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.mark_price_alert_sent(uuid, uuid, smallint, int) from anon, authenticated;
grant execute on function public.mark_price_alert_sent(uuid, uuid, smallint, int) to service_role;
