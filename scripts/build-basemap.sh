#!/usr/bin/env bash
# Builds a Protomaps .pmtiles basemap clipped to the NY Capital District
# (Troy / Albany / Schenectady) — the area all gas-finder testers are in.
#
# Requires the `pmtiles` CLI (go-pmtiles):
#   brew install protomaps/tap/pmtiles
#
# Output: capital-district.pmtiles — upload to the Supabase `basemap` bucket.
set -euo pipefail

# Latest Protomaps planet build. If this URL 404s, pick a recent date from
# https://maps.protomaps.com/builds/
BUILD_DATE=$(date -v-2d +%Y%m%d 2>/dev/null || date -d '2 days ago' +%Y%m%d)
SOURCE="https://build.protomaps.com/${BUILD_DATE}.pmtiles"

# Capital District bounding box: minlon,minlat,maxlon,maxlat
BBOX="-74.30,42.55,-73.55,42.95"
OUT="capital-district.pmtiles"

echo "Extracting $BBOX from $SOURCE ..."
pmtiles extract "$SOURCE" "$OUT" --bbox="$BBOX"
echo "Done: $OUT ($(du -h "$OUT" | cut -f1))"
