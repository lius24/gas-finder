-- Add 'google' source kind for the automated Places-fuelOptions ingest path.
-- 'crowd' remains user OCR; 'scrape'/'official' kept for future / manual seeding.

alter table public.prices
  drop constraint if exists prices_source_kind_check;

alter table public.prices
  add constraint prices_source_kind_check
  check (source_kind in ('scrape','crowd','official','google'));
