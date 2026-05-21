# Atlas Map + Report OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Atlas interactive map and wire real OCR into the Report flow, finishing the two unfinished tab screens.

**Architecture:** Atlas renders a MapLibre GL map with a self-hosted Protomaps basemap, driven by the existing `usePumpsData()` hook so the map and the Pumps list never diverge. Report's stubbed `ocrImage()` is replaced with a Claude vision call that returns structured octane→price pairs.

**Tech Stack:** Vite + React 19 + React Router 7, TypeScript; MapLibre GL JS + PMTiles + @protomaps/basemaps; Supabase edge functions (Deno); Anthropic Messages API.

Spec: `docs/superpowers/specs/2026-05-21-atlas-map-and-report-ocr-design.md`

The two phases are independent and touch disjoint files. Phase 1 (Report) is small and can ship on its own; Phase 2 (Atlas) is larger. Either order works.

---

## File map

**Phase 1 — Report OCR**
- Modify: `supabase/functions/_shared/ocr.ts` — replace the text-regex parser with Claude vision
- Create: `supabase/functions/_shared/ocr.test.ts` — Deno tests for the response parser
- Modify: `supabase/functions/report/index.ts` — pass the photo's media type to `ocrImage`

**Phase 2 — Atlas map**
- Create: `core/atlas-markers.ts` — pure stations→marker-descriptors function
- Create: `tests/unit/atlas-markers.test.ts` — Vitest tests for it
- Create: `src/components/MapView.tsx` + `src/components/MapView.css` — the MapLibre map
- Modify: `src/routes/Atlas.tsx` — replace the stub with the real screen
- Create: `scripts/build-basemap.sh` — builds the clipped `.pmtiles` extract
- Modify: `e2e/pumps.spec.ts` — add an Atlas smoke test
- Modify: `.env` / Vercel env — add `EXPO_PUBLIC_BASEMAP_URL`

---

# Phase 1 — Report OCR

### Task 1: Claude-response parser

**Files:**
- Modify: `supabase/functions/_shared/ocr.ts`
- Test: `supabase/functions/_shared/ocr.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/ocr.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert@1';

import { parseClaudeResponse } from './ocr.ts';

Deno.test('parses a clean JSON array', () => {
  assertEquals(
    parseClaudeResponse('[{"octane":87,"price_cents":349},{"octane":93,"price_cents":419}]'),
    [
      { octane: 87, price_cents: 349 },
      { octane: 93, price_cents: 419 },
    ],
  );
});

Deno.test('extracts the JSON array even with surrounding prose', () => {
  assertEquals(
    parseClaudeResponse('Here are the prices: [{"octane":89,"price_cents":379}] hope this helps'),
    [{ octane: 89, price_cents: 379 }],
  );
});

Deno.test('drops unknown octanes and out-of-range prices', () => {
  assertEquals(
    parseClaudeResponse(
      '[{"octane":88,"price_cents":300},{"octane":87,"price_cents":50},{"octane":91,"price_cents":399}]',
    ),
    [{ octane: 91, price_cents: 399 }],
  );
});

Deno.test('dedupes repeated octanes, keeping the first', () => {
  assertEquals(
    parseClaudeResponse('[{"octane":87,"price_cents":349},{"octane":87,"price_cents":359}]'),
    [{ octane: 87, price_cents: 349 }],
  );
});

Deno.test('returns [] for malformed or empty input', () => {
  assertEquals(parseClaudeResponse('no json here'), []);
  assertEquals(parseClaudeResponse('[not valid json'), []);
  assertEquals(parseClaudeResponse(''), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/_shared/ocr.test.ts`
Expected: FAIL — `parseClaudeResponse` is not exported yet.

- [ ] **Step 3: Replace `ocr.ts` with the new implementation**

Overwrite `supabase/functions/_shared/ocr.ts` entirely:

```ts
// Server-side OCR for crowd-reported price photos.
//
// Reads a gas-station price sign with Claude vision and returns the octane
// prices it can see. Best-effort: any failure returns [] and the report row
// stays 'pending' for manual review.

import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

export type Octane = 86 | 87 | 89 | 91 | 93 | 94;
export type ParsedPrice = { octane: Octane; price_cents: number };

const OCTANE_VALUES: readonly Octane[] = [86, 87, 89, 91, 93, 94];
const MIN_PRICE_CENTS = 100;
const MAX_PRICE_CENTS = 1500;
const SUPPORTED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const PROMPT =
  'This image is a photo of a gas station price sign. Return a JSON array of ' +
  'the octane prices you can clearly read. Each element must be ' +
  '{"octane": <number>, "price_cents": <integer>} where octane is one of ' +
  '86, 87, 89, 91, 93, 94 and price_cents is the price in whole cents ' +
  '(for example $3.49 is 349). Only include an octane if its price is ' +
  'clearly visible. Output ONLY the JSON array, nothing else.';

/** Extract and validate octane/price pairs from Claude's text response. */
export function parseClaudeResponse(text: string): ParsedPrice[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const seen = new Set<Octane>();
  const result: ParsedPrice[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const octane = rec.octane;
    const price = rec.price_cents;
    if (typeof octane !== 'number' || typeof price !== 'number') continue;
    if (!OCTANE_VALUES.includes(octane as Octane)) continue;
    if (!Number.isInteger(price) || price < MIN_PRICE_CENTS || price > MAX_PRICE_CENTS) {
      continue;
    }
    if (seen.has(octane as Octane)) continue;
    seen.add(octane as Octane);
    result.push({ octane: octane as Octane, price_cents: price });
  }
  return result;
}

/** Read a price-sign photo with Claude vision. Returns [] on any failure. */
export async function ocrImage(
  imageBytes: Uint8Array,
  mediaType = 'image/jpeg',
): Promise<ParsedPrice[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return [];

  const media = SUPPORTED_MEDIA.includes(mediaType) ? mediaType : 'image/jpeg';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: media,
                  data: encodeBase64(imageBytes),
                },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const text = json?.content?.[0]?.text;
    return typeof text === 'string' ? parseClaudeResponse(text) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test supabase/functions/_shared/ocr.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Type-check the function**

Run: `deno check supabase/functions/_shared/ocr.ts supabase/functions/report/index.ts`
Expected: no errors. (The `report` import of `ocrImage` still type-checks — the signature is call-compatible.)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/ocr.ts supabase/functions/_shared/ocr.test.ts
git commit -m "Read price-sign photos with Claude vision instead of a stub"
```

---

### Task 2: Pass the photo's media type from the report function

**Files:**
- Modify: `supabase/functions/report/index.ts`

- [ ] **Step 1: Pass `blob.type` to `ocrImage`**

In `supabase/functions/report/index.ts`, find:

```ts
      const bytes = new Uint8Array(await blob.arrayBuffer());
      parsed_prices = await ocrImage(bytes);
```

Replace with:

```ts
      const bytes = new Uint8Array(await blob.arrayBuffer());
      parsed_prices = await ocrImage(bytes, blob.type || 'image/jpeg');
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/report/index.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/report/index.ts
git commit -m "Pass the uploaded photo's media type to OCR"
```

---

### Task 3: Deploy and verify Report OCR

**Files:** none (deploy + manual verification)

- [ ] **Step 1: Set the Anthropic key as a function secret**

Run (the user supplies the key — an Anthropic API key from console.anthropic.com):

```bash
supabase secrets set ANTHROPIC_API_KEY=<key>
```

- [ ] **Step 2: Deploy the report function**

Run: `supabase functions deploy report`
Expected: `Deployed Functions on project nknseetoxcsjytnnjtsh: report`

- [ ] **Step 3: Manual verification**

Open the live Report tab, photograph a real gas-station price sign, submit. Confirm the "DETECTED PRICES" block lists the octane prices from the sign. Confirm a bad/blank photo shows "couldn't read any prices" rather than an error.

- [ ] **Step 4: Commit (no-op marker)**

No code changes in this task. Phase 1 is complete once verification passes.

---

# Phase 2 — Atlas map

### Task 4: Install map dependencies and add the basemap env var

**Files:**
- Modify: `package.json` (via npm)
- Modify: `.env`

- [ ] **Step 1: Install the packages**

Run: `npm install maplibre-gl pmtiles @protomaps/basemaps`
Expected: three packages added to `dependencies` (`maplibre-gl` v5, `pmtiles` v4, `@protomaps/basemaps` v5). Note: the older `protomaps-themes-base` package is deprecated — use `@protomaps/basemaps`.

- [ ] **Step 2: Add the basemap URL env var**

Append to `.env`:

```
EXPO_PUBLIC_BASEMAP_URL=https://nknseetoxcsjytnnjtsh.supabase.co/storage/v1/object/public/basemap/capital-district.pmtiles
```

(The file is uploaded in Task 5. The same var must be added to the Vercel project's environment variables before the production deploy.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add MapLibre, PMTiles, and Protomaps theme dependencies"
```

(`.env` is gitignored — not committed.)

---

### Task 5: Build and host the Protomaps basemap

**Files:**
- Create: `scripts/build-basemap.sh`

- [ ] **Step 1: Write the build script**

Create `scripts/build-basemap.sh`:

```bash
#!/usr/bin/env bash
# Builds a Protomaps .pmtiles basemap clipped to the NY Capital District
# (Troy / Albany / Schenectady) — the area all gas-finder testers are in.
#
# Requires the `pmtiles` CLI (go-pmtiles): https://github.com/protomaps/go-pmtiles
#   brew install protomaps/tap/pmtiles
#
# Output: capital-district.pmtiles — upload to the Supabase `basemap` bucket.
set -euo pipefail

# Latest Protomaps planet build. Check https://maps.protomaps.com/builds/
# for a valid recent date if this URL 404s.
BUILD_DATE=$(date -v-2d +%Y%m%d 2>/dev/null || date -d '2 days ago' +%Y%m%d)
SOURCE="https://build.protomaps.com/${BUILD_DATE}.pmtiles"

# Capital District bounding box: minlon,minlat,maxlon,maxlat
BBOX="-74.30,42.55,-73.55,42.95"
OUT="capital-district.pmtiles"

echo "Extracting $BBOX from $SOURCE ..."
pmtiles extract "$SOURCE" "$OUT" --bbox="$BBOX"
echo "Done: $OUT ($(du -h "$OUT" | cut -f1))"
```

Make it executable: `chmod +x scripts/build-basemap.sh`

- [ ] **Step 2: Run the build**

Run: `./scripts/build-basemap.sh`
Expected: `capital-district.pmtiles` produced (a few MB to tens of MB). If the dated build URL 404s, pick a recent date from https://maps.protomaps.com/builds/.

- [ ] **Step 3: Raise the Supabase storage file limit and create the bucket**

In the Supabase dashboard (project `nknseetoxcsjytnnjtsh`):
1. Storage → Settings → raise the global file size limit to 100 MB.
2. Storage → New bucket → name `basemap`, **public**.

- [ ] **Step 4: Upload the basemap**

Upload `capital-district.pmtiles` to the `basemap` bucket (dashboard UI, or `supabase storage cp ./capital-district.pmtiles ss:///basemap/capital-district.pmtiles`).

Verify the public URL serves a range request:

```bash
curl -s -I -H "Range: bytes=0-99" \
  "https://nknseetoxcsjytnnjtsh.supabase.co/storage/v1/object/public/basemap/capital-district.pmtiles"
```

Expected: `HTTP/2 206` (partial content).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-basemap.sh
git commit -m "Add basemap build script for the Atlas map"
```

---

### Task 6: Station-marker descriptor function

**Files:**
- Create: `core/atlas-markers.ts`
- Test: `tests/unit/atlas-markers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/atlas-markers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { stationMarkers } from '@core/atlas-markers';
import type { AnnotatedStation } from '@core/decision-math';

function station(overrides: Partial<AnnotatedStation>): AnnotatedStation {
  return {
    id: 's1',
    brand: 'Sunoco',
    name: 'Sunoco',
    address: '1 Main St',
    latitude: 42.73,
    longitude: -73.69,
    google_place_id: null,
    octane: 93,
    price_cents: 399,
    source_kind: 'google',
    observed_at: '2026-05-21T00:00:00Z',
    distance_meters: 800,
    isBaseline: false,
    savings: null,
    ...overrides,
  };
}

describe('stationMarkers', () => {
  it('builds a priced marker with a dollar label', () => {
    const out = stationMarkers([station({ id: 'a', price_cents: 399 })], null);
    expect(out).toEqual([
      {
        id: 'a',
        latitude: 42.73,
        longitude: -73.69,
        label: '$3.99',
        variant: 'priced',
      },
    ]);
  });

  it('marks the cheapest station as the best variant', () => {
    const out = stationMarkers([station({ id: 'a' }), station({ id: 'b' })], 'b');
    expect(out.find((m) => m.id === 'b')?.variant).toBe('best');
    expect(out.find((m) => m.id === 'a')?.variant).toBe('priced');
  });

  it('marks a station with no price as unpriced with a dot label', () => {
    const out = stationMarkers([station({ id: 'a', price_cents: null })], null);
    expect(out[0]).toMatchObject({ variant: 'unpriced', label: '·' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/atlas-markers.test.ts`
Expected: FAIL — `@core/atlas-markers` does not exist.

- [ ] **Step 3: Write the implementation**

Create `core/atlas-markers.ts`:

```ts
import type { AnnotatedStation } from './decision-math';

export type MarkerVariant = 'best' | 'priced' | 'unpriced';

export type StationMarker = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  variant: MarkerVariant;
};

/**
 * Map annotated stations to map-marker descriptors. `cheapestId` is the id of
 * the cheapest priced station (from usePumpsData); that marker gets the
 * 'best' variant. Stations with no price render as a small 'unpriced' dot.
 */
export function stationMarkers(
  stations: AnnotatedStation[],
  cheapestId: string | null,
): StationMarker[] {
  return stations.map((s) => {
    if (s.price_cents === null) {
      return {
        id: s.id,
        latitude: s.latitude,
        longitude: s.longitude,
        label: '·',
        variant: 'unpriced' as const,
      };
    }
    return {
      id: s.id,
      latitude: s.latitude,
      longitude: s.longitude,
      label: `$${(s.price_cents / 100).toFixed(2)}`,
      variant: s.id === cheapestId ? ('best' as const) : ('priced' as const),
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/atlas-markers.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add core/atlas-markers.ts tests/unit/atlas-markers.test.ts
git commit -m "Add station-to-marker descriptor function for the Atlas map"
```

---

### Task 7: MapView component

**Files:**
- Create: `src/components/MapView.tsx`
- Create: `src/components/MapView.css`

- [ ] **Step 1: Write `MapView.css`**

Create `src/components/MapView.css`:

```css
.atlas-map {
  width: 100%;
  height: 100%;
  min-height: 320px;
}

/* Marker buttons — created imperatively by MapView, styled here. */
.atlas-marker {
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--paper-edge);
  background: var(--paper);
  color: var(--ink);
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.atlas-marker--best {
  background: var(--rust);
  border-color: var(--rust-dark);
  color: #ffffff;
}

.atlas-marker--unpriced {
  font-size: 14px;
  padding: 2px 6px;
  color: var(--ink-faint);
}
```

- [ ] **Step 2: Write `MapView.tsx`**

Create `src/components/MapView.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, DARK, LIGHT } from '@protomaps/basemaps';

import { stationMarkers } from '@core/atlas-markers';
import type { AnnotatedStation } from '@core/decision-math';
import type { Coords } from '@core/adapters/geolocation';

import 'maplibre-gl/dist/maplibre-gl.css';
import './MapView.css';

const BASEMAP_URL = import.meta.env.EXPO_PUBLIC_BASEMAP_URL as string;

// Register the pmtiles:// protocol once for the whole app.
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

// @protomaps/basemaps v5: layers(source, flavorObject, { lang }).
function buildStyle(theme: 'dark' | 'light'): maplibregl.StyleSpecification {
  const flavor = theme === 'dark' ? DARK : LIGHT;
  return {
    version: 8,
    glyphs:
      'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${BASEMAP_URL}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers('protomaps', flavor, { lang: 'en' }),
  };
}

type Props = {
  stations: AnnotatedStation[];
  cheapestId: string | null;
  center: Coords | null;
  theme: 'dark' | 'light';
  onStationClick: (id: string) => void;
};

export function MapView({ stations, cheapestId, center, theme, onStationClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Keep the latest click handler without re-running the marker effect.
  const onClickRef = useRef(onStationClick);
  onClickRef.current = onStationClick;

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(theme),
      center: center ? [center.longitude, center.latitude] : [-73.69, 42.73],
      zoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Center/theme are applied by the effects below; init runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter when the location changes.
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.flyTo({ center: [center.longitude, center.latitude], zoom: 12 });
    }
  }, [center]);

  // Swap the basemap style when the theme changes.
  useEffect(() => {
    mapRef.current?.setStyle(buildStyle(theme));
  }, [theme]);

  // Sync markers to the station list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = stationMarkers(stations, cheapestId).map((d) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `atlas-marker atlas-marker--${d.variant}`;
      el.textContent = d.label;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClickRef.current(d.id);
      });
      return new maplibregl.Marker({ element: el })
        .setLngLat([d.longitude, d.latitude])
        .addTo(map);
    });
  }, [stations, cheapestId]);

  return <div ref={containerRef} className="atlas-map" />;
}
```

Note for the implementer: `maplibre-gl` v5 constructor/option types occasionally differ from older docs. After creating the file, run the type-check in Step 3 — if `StyleSpecification` / `NavigationControl` / `Map` options mismatch, or if `addProtocol`'s callback shape differs, adjust to the installed `maplibre-gl@5` and `pmtiles@4` types (do not change behavior). The `@protomaps/basemaps` import and the `layers(source, flavor, {lang})` call above are correct for v5.7.x.

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/MapView.tsx src/components/MapView.css
git commit -m "Add MapView — MapLibre map with station markers"
```

---

### Task 8: Atlas screen

**Files:**
- Modify: `src/routes/Atlas.tsx` (full rewrite)

- [ ] **Step 1: Rewrite `Atlas.tsx`**

Overwrite `src/routes/Atlas.tsx` entirely:

```tsx
import { useNavigate } from 'react-router-dom';

import { usePumpsData } from '@core/use-pumps-data';
import { useThemeId } from '@core/theme-provider';
import type { OctaneSelection } from '@core/types';

import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { MapView } from '../components/MapView';

import './Atlas.css';

const OCTANE_TABS: { key: OctaneSelection; label: string }[] = [
  { key: 87, label: '87' },
  { key: 89, label: '89' },
  { key: 'premium', label: '91+' },
];

export function Atlas() {
  const navigate = useNavigate();
  const themeId = useThemeId();
  const {
    sortedStations,
    cheapestId,
    coords,
    loading,
    octane,
    setOctane,
    applyLocationSelection,
  } = usePumpsData();

  const hasData = sortedStations.length > 0;

  return (
    <div className="atlas-page">
      <div className="atlas-toolbar">
        <AddressAutocomplete
          placeholder="search city, zip, or address"
          onSelect={(s) =>
            applyLocationSelection({
              label: s.label,
              latitude: s.latitude,
              longitude: s.longitude,
            })
          }
        />
        <div className="atlas-octane-bar" role="tablist" aria-label="Octane">
          {OCTANE_TABS.map((t) => (
            <button
              key={String(t.key)}
              type="button"
              role="tab"
              aria-selected={octane === t.key}
              className={
                octane === t.key ? 'atlas-octane atlas-octane--on' : 'atlas-octane'
              }
              onClick={() => setOctane(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="atlas-map-wrap">
        <MapView
          stations={sortedStations}
          cheapestId={cheapestId}
          center={coords}
          theme={themeId === 'ferrari' ? 'dark' : 'light'}
          onStationClick={(id) => {
            const seed = sortedStations.find((s) => s.id === id);
            navigate(`/station/${id}`, seed ? { state: { seed } } : undefined);
          }}
        />
        {!loading && !hasData ? (
          <div className="atlas-empty" role="status">
            <p className="atlas-empty-title">No premium stations near you yet</p>
            <p className="atlas-empty-body">
              Search a city above, or check the Pumps tab.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

Note for the implementer: verify `usePumpsData`'s returned field names against `core/use-pumps-data.ts` — this plan uses `sortedStations`, `cheapestId`, `coords`, `loading`, `octane`, `setOctane`, `applyLocationSelection`. If a name differs, match the hook.

- [ ] **Step 2: Create `Atlas.css`**

Create `src/routes/Atlas.css`:

```css
.atlas-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.atlas-toolbar {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--paper-edge);
}

.atlas-octane-bar {
  display: flex;
  gap: 8px;
}

.atlas-octane {
  flex: 1;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--paper-edge);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
}

.atlas-octane--on {
  background: var(--rust);
  border-color: var(--rust-dark);
  color: #ffffff;
}

.atlas-map-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
}

.atlas-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px;
  text-align: center;
  background: color-mix(in srgb, var(--paper) 88%, transparent);
}

.atlas-empty-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}

.atlas-empty-body {
  font-size: 13px;
  color: var(--ink-faint);
}
```

- [ ] **Step 3: Type-check and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 4: Manual check**

Run `npm run dev`, open `/atlas`. Confirm the map renders, station markers appear with prices, the cheapest is highlighted, the octane tabs re-fetch, and clicking a marker opens the station detail page. Check both themes (Garage → Appearance).

- [ ] **Step 5: Commit**

```bash
git add src/routes/Atlas.tsx src/routes/Atlas.css
git commit -m "Build the Atlas interactive map screen"
```

---

### Task 9: Atlas E2E test and final verification

**Files:**
- Modify: `e2e/pumps.spec.ts`

- [ ] **Step 1: Add an Atlas smoke test**

Append to `e2e/pumps.spec.ts`:

```ts
test('atlas tab renders the map', async ({ page }) => {
  await page.goto('/atlas');
  // MapLibre renders into a canvas inside the map container.
  await expect(page.locator('.atlas-map canvas')).toBeVisible({ timeout: 10000 });
  await expect(page.getByPlaceholder('search city, zip, or address')).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E suite**

Run: `npm run test:e2e`
Expected: all tests pass, including `atlas tab renders the map`.

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: all tests pass (existing suites + `atlas-markers`).

- [ ] **Step 4: Commit**

```bash
git add e2e/pumps.spec.ts
git commit -m "Add Atlas map E2E smoke test"
```

- [ ] **Step 5: Pre-ship checklist**

Before merging: add `EXPO_PUBLIC_BASEMAP_URL` to the Vercel project's environment variables (same value as `.env`), or the production map will have no basemap.

---

## Notes

- **Phase order:** Phase 1 (Report) is independent and small — it can ship first as its own PR. Phase 2 (Atlas) is larger. Either order is fine.
- **Out of scope** (per spec): marker clustering, `report` rate limiting, basemap coverage beyond the Capital District.
