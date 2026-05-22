#!/usr/bin/env bash
# Ingest gas stations for a list of metros via the ingest-stations edge
# function, so `nearby` has real data where users actually open the app.
#
# Usage:
#   1. Edit the METROS list below (one "label|lat|lon|radius_m" per line;
#      radius_m max 50000).
#   2. Run with the env vars set:
#        EXPO_PUBLIC_SUPABASE_URL=... \
#        EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
#        CRON_SECRET=... \
#        ./scripts/ingest-metros.sh
#
# Idempotent — ingest-stations upserts on google_place_id.
set -euo pipefail

: "${EXPO_PUBLIC_SUPABASE_URL:?set EXPO_PUBLIC_SUPABASE_URL}"
: "${EXPO_PUBLIC_SUPABASE_ANON_KEY:?set EXPO_PUBLIC_SUPABASE_ANON_KEY}"
: "${CRON_SECRET:?set CRON_SECRET}"

# label|latitude|longitude|radius_m
# Capital District grid — ingest-stations' Google searchNearby caps at 20
# results per call, so one wide pull only ever returns ~20 stations. This
# tiles the greater Albany metro in ~8km cells so every town is covered.
METROS=(
  "Troy NY|42.7284|-73.6918|8000"
  "Albany NY|42.6526|-73.7562|8000"
  "Schenectady NY|42.8142|-73.9396|8000"
  "East Greenbush NY|42.6298|-73.7034|8000"
  "Cohoes NY|42.7742|-73.7001|8000"
  "Latham Colonie NY|42.7489|-73.7595|8000"
  "Niskayuna NY|42.7795|-73.8990|8000"
  "Guilderland NY|42.6970|-73.8990|8000"
  "Delmar Bethlehem NY|42.6220|-73.8340|8000"
  "Clifton Park NY|42.8628|-73.7990|8000"
  "Saratoga Springs NY|43.0831|-73.7846|8000"
)

FN_URL="${EXPO_PUBLIC_SUPABASE_URL%/}/functions/v1/ingest-stations"
OUT=/tmp/ingest-metros-out.json
failures=0

for row in "${METROS[@]}"; do
  IFS='|' read -r label lat lon radius <<<"$row"
  echo "Ingesting: $label ($lat, $lon) radius=${radius}m"
  status=$(curl -s -o "$OUT" -w '%{http_code}' -X POST "$FN_URL" \
    -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
    -H "x-cron-secret: $CRON_SECRET" \
    -H 'Content-Type: application/json' \
    -d "{\"latitude\":$lat,\"longitude\":$lon,\"radius_m\":$radius}")
  if [ "$status" = "200" ]; then
    echo "  ok: $(cat "$OUT")"
  else
    echo "  FAILED (HTTP $status): $(cat "$OUT")"
    failures=$((failures + 1))
  fi
done

if [ "$failures" -gt 0 ]; then
  echo "$failures metro(s) failed."
  exit 1
fi
echo "All metros ingested."
