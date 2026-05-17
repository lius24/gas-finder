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
