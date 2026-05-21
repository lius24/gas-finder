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
METROS=(
  "Troy NY|42.7284|-73.6918|25000"
  # "Your metro|LAT|LON|25000"
  # "Friend metro|LAT|LON|25000"
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
