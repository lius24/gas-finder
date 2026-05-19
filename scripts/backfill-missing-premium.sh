#!/usr/bin/env bash
# One-shot admin backfill: refreshes Places fuelOptions for every station
# in the ingest set that has no premium row yet — mostly the Sedona /
# Phoenix / Flagstaff seed area, which sits outside the zone-driven daily
# cron's selection so it never gets touched after the initial ingest.
#
# Re-derives the missing-station list at runtime so this script stays
# correct as data drifts. Idempotent — re-running after a successful
# refresh produces zero API calls (since previously-missing rows now
# exist and `places_fuel_seen_at` is set).
#
# Requires CRON_SECRET on the env; it never lands in a file.
#
# Usage:
#   CRON_SECRET=<hex> ./scripts/backfill-missing-premium.sh
#
# Cost: ~$17/1000 at current pricing for Place Details (fuelOptions only,
# Field Mask = id+fuelOptions). A few cents typical, $0.85 worst case for
# the full ~50-station seed.

set -euo pipefail

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "error: CRON_SECRET not set. Run:  CRON_SECRET=<hex> $0" >&2
  exit 1
fi

REF="nknseetoxcsjytnnjtsh"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rbnNlZXRveGNzanl0bm5qdHNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NjI1NDcsImV4cCI6MjA5MzMzODU0N30.BygPSP6JFfV26y6l6JXC8lDylkxedcO1iqufPsPkdxE"
BASE="https://$REF.supabase.co"

echo "› finding stations missing any premium (91/93/94) row …"

# Two REST queries — anon-readable per the RLS policies.
ALL_STATIONS=$(curl -sS "$BASE/rest/v1/stations?select=id&limit=5000" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
PREMIUM_PRICES=$(curl -sS "$BASE/rest/v1/prices?select=station_id&octane=in.(91,93,94)&limit=50000" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON")

BODY=$(python3 - <<EOF
import json, sys
all_stations = json.loads("""$ALL_STATIONS""")
prices = json.loads("""$PREMIUM_PRICES""")
have = {p["station_id"] for p in prices}
missing = [s["id"] for s in all_stations if s["id"] not in have]
print(json.dumps({"station_ids": missing}))
EOF
)

COUNT=$(echo "$BODY" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['station_ids']))")
echo "› $COUNT stations missing premium — calling refresh-prices …"

if [[ "$COUNT" -eq 0 ]]; then
  echo "  nothing to refresh"
  exit 0
fi

curl -sS -X POST "$BASE/functions/v1/refresh-prices" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON" \
  -H "x-cron-secret: $CRON_SECRET" \
  --data "$BODY" | python3 -m json.tool
