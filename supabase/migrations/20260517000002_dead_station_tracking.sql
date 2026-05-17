-- Tracking columns used by refresh-prices to demote stations that never
-- return fuelOptions data from daily to weekly retries.
--
-- places_fuel_seen_at: last time Google returned at least one fuelPrice row.
--                      Once non-null, the station stays on the daily schedule.
-- places_fuel_attempts: incremented each refresh that returned no fuelPrices.
--                      Demotion kicks in at 3+ attempts AND seen_at IS NULL.

alter table public.stations
  add column if not exists places_fuel_seen_at  timestamptz,
  add column if not exists places_fuel_attempts integer not null default 0;
