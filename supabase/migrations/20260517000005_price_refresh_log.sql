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
