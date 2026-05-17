-- Allow regional / specialty octanes alongside the common four.
-- 86 = high-altitude regular (AZ / NM / CO).
-- 94 = Sunoco's premium (some east-coast / midwest).
-- The widened range (85–95) gives headroom for E15 (88) and 90/92 if needed
-- without another migration.

alter table public.prices
  drop constraint if exists prices_octane_check;

alter table public.prices
  add constraint prices_octane_check
  check (octane between 85 and 95);

alter table public.favorites
  drop constraint if exists favorites_alert_octane_check;

alter table public.favorites
  add constraint favorites_alert_octane_check
  check (alert_octane is null or alert_octane between 85 and 95);
