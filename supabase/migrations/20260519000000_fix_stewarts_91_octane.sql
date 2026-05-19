-- Backfill: Stewart's Shops premium is 91, not 93.
--
-- Until commit 9030bbb the places-fuel mapping used the east-coast default
-- (PREMIUM = 93). Every existing Stewart's price row got filed under 93, so
-- the Pumps tab's 91 view was empty in Stewart's coverage area — exactly
-- the GasBuddy failure-mode the wedge exists to fix. The code override was
-- deployed but historic rows need explicit correction.
--
-- This UPDATE is safe to re-run: after Stewart's 93 rows are re-labeled 91,
-- a subsequent execution affects zero rows. There's no unique constraint
-- on (station_id, octane, observed_at) — multiple history rows are fine —
-- and no Stewart's 91 row exists pre-migration (verified via /nearby).

update public.prices p
set octane = 91
from public.stations s
where p.station_id = s.id
  and s.brand = 'Stewart''s Shops'
  and p.octane = 93;
