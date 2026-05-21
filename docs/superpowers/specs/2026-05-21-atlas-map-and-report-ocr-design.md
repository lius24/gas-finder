# Design: Atlas interactive map + Report OCR

Date: 2026-05-21
Status: approved via brainstorming
Repo: lius24/gas-finder · branch `atlas-and-report`

## Problem

Two tab screens are unfinished.

**Atlas** (`/atlas`) is a "coming soon" stub. The interactive map was deferred
because `react-native-maps` had no web port — but the app was re-platformed off
React Native to Vite, so that blocker is gone. MapLibre GL JS is web-native.

**Report** (`/report`) looks finished but is not. `Report.tsx` (camera capture,
upload, edge-function call, result display, errors) and the `report` edge
function are complete. The only stub is `ocrImage()` in
`supabase/functions/_shared/ocr.ts` — it returns `[]`, so no photo is ever
read. The page's promise ("we'll read the four octane numbers and file them")
is currently unfulfilled.

## Scope

Two independent parts in this plan:

- **A. Atlas interactive map** — a real MapLibre map of nearby premium pumps,
  sharing the Pumps data source.
- **B. Report OCR** — implement `ocrImage()` with a real provider so reported
  photos are actually read.

The two parts touch disjoint files and can be built and shipped in either
order.

## A. Atlas interactive map

### Map library + basemap

- **MapLibre GL JS** (`maplibre-gl`) — web-native, open-source vector renderer.
  Used directly (no `react-map-gl` wrapper) to keep the dependency count down;
  the map is initialized in a `useEffect` and lives for the component's
  lifetime.
- **Basemap: Protomaps**, self-hosted as a single `.pmtiles` file. Keyless and
  free — no account, no per-load limits. The `pmtiles` JS library registers a
  `pmtiles://` protocol handler with MapLibre.
- **Map style:** generated from `@protomaps/basemaps`, which emits MapLibre
  style layers for the Protomaps tile schema. Two themes: the package's `dark`
  flavor for Ferrari, `light` for Airtable.

### Hosting the basemap

PMTiles reads byte ranges from the file over HTTP, so the host must support
HTTP range requests. Supabase Storage does.

- All testers are local to Troy NY, so the basemap is a **single small
  extract** — no multi-region handling. A build script
  (`scripts/build-basemap.sh`) runs `pmtiles extract --bbox=…` against a
  Protomaps planet build with one bounding box covering the NY Capital District
  (Troy / Albany / Schenectady). A box that tight stays small even to street
  zoom (well under ~50 MB).
- The file is uploaded to a public Supabase Storage bucket (`basemap`).
- **Known constraint:** Supabase's default per-file upload limit (10 MiB) must
  be raised in the project dashboard to accept the extract; the free tier's
  1 GB total storage is not a concern at this size.
- If coverage later expands beyond the Troy area, either widen the bbox and
  rebuild, or move the file to Cloudflare R2 (free tier, range-capable) — a
  host swap, no code change beyond the tile URL.

### Component architecture

`src/routes/Atlas.tsx` replaces the stub:

- Calls `usePumpsData()` — the **same hook** the Pumps list uses. No new data
  path; the map and the Pumps list render identical stations for the same
  octane, radius, and location.
- Renders a toolbar (octane selector + radius control) reusing the Pumps
  controls, plus the `AddressAutocomplete` location search, so the map is
  navigable on its own.
- Renders `<MapView>` — a child component that owns the MapLibre instance.

`src/components/MapView.tsx`:

- Props: `stations: StationWithPrice[]`, `center: Coords | null`,
  `octane`, `onStationClick(station)`.
- One `useEffect` initializes the map (registers the PMTiles protocol, sets the
  themed style, sets the initial center/zoom). A second effect syncs markers to
  the `stations` prop whenever it changes. A third swaps the style when the
  theme changes.
- Marker DOM elements are plain elements created by the component; React Router
  navigation happens via the `onStationClick` callback passed from `Atlas.tsx`.

### Markers + interaction

- One marker per station. Each `Station` already carries `latitude` /
  `longitude` (`core/types.ts`), so no geocoding is needed.
- A marker shows the price for the selected octane and is styled by net-savings
  (the cheapest / best-savings station highlighted) — `usePumpsData` already
  runs `annotateWithSavings`, so the savings data is on each station.
- Tapping a marker opens a small popup (brand · price · savings). Tapping the
  popup navigates to `/station/:id`, passing the station as router `state.seed`
  — exactly what a Pumps list card does today.
- The map centers on the user's location, or the searched location, from
  `usePumpsData` (`coords` / `searchLabel`).
- Uncovered metro (no stations): show the same honest empty message the Pumps
  list shows, overlaid on the map.

### Theming

Two map styles (dark for Ferrari, light for Airtable) generated from
`@protomaps/basemaps`. The active theme comes from the existing
`ThemeProvider`; a change re-applies the style on the live map instance.
Marker styling uses the existing CSS custom properties so markers match each
theme. `maplibre-gl/dist/maplibre-gl.css` is imported once.

## B. Report OCR

### `ocrImage()` via Claude vision

`supabase/functions/_shared/ocr.ts` — replace the stub body of `ocrImage()`:

- Base64-encode the image bytes.
- Call the Anthropic Messages API (`POST https://api.anthropic.com/v1/messages`,
  headers `x-api-key`, `anthropic-version: 2023-06-01`) with model
  `claude-haiku-4-5-20251001` (vision-capable, low cost) — one image content
  block plus a text prompt.
- Prompt: "This is a photo of a gas station price sign. Return a JSON array of
  the octane prices you can clearly read, each `{octane, price_cents}` where
  octane is one of 86/87/89/91/93/94 and price_cents is an integer (e.g.
  `$3.49` → `349`). Return only octane values actually shown. Output only the
  JSON array, nothing else." Low temperature.
- Parse the response: extract the JSON array, keep entries whose `octane` is in
  the valid set and whose `price_cents` is in a sane range (100–1500, matching
  the previous parser's bound).
- On any failure (HTTP error, malformed JSON, missing key): return `[]`. The
  `report` function already treats an empty `parsed_prices` as "leave the
  report `pending` for manual review" — best-effort is preserved.

A vision LLM is chosen over generic text OCR because gas price signs are a hard
target — LED/plastic digits, glare, angled shots, and octane labels that are
often words ("PREMIUM") or spatially separated from their price. An LLM that
sees the sign as a sign returns correct octane→price pairs directly, where
text-OCR + regex pairing is fragile and fails on word labels.

The old `parsePricesFromText` text parser and its regex constants are removed —
Claude returns structured data directly, so the text-pairing step is dead code.

### Secret + wiring

- New Supabase function secret `ANTHROPIC_API_KEY` (server-side only, same
  pattern as `GOOGLE_PLACES_API_KEY`).
- No frontend change. `Report.tsx` and the `report` edge function already
  consume `parsed_prices`; once `ocrImage()` returns real data, the `report`
  function's existing "write prices through as `crowd` source" path starts
  populating the `prices` table automatically.
- Redeploy: `supabase functions deploy report` (it imports the shared
  `ocr.ts`).

## Error handling

| Path | Failure | Handling |
|---|---|---|
| `MapView` init | PMTiles fetch / style load fails | map shows a plain error state; the Atlas toolbar + search stay usable |
| Atlas | `usePumpsData` error (location denied) | same error/empty state the Pumps list shows |
| Atlas | no stations (uncovered metro) | honest empty overlay on the map |
| `ocrImage` | Anthropic HTTP error / bad key | returns `[]`; report saved `pending` for manual review |
| `ocrImage` | malformed / non-JSON model output | returns `[]`; report saved `pending` |
| `report` fn | OCR returns prices + station resolved | prices inserted as `crowd` source (existing behavior) |

## Testing

- **Unit (Vitest):** extract a pure marker-descriptor function (stations +
  octane → marker view-models) and test it — color/label selection, cheapest
  highlighting, empty input. MapLibre needs WebGL, so the rendered map itself
  is not unit-tested (jsdom has no WebGL).
- **OCR (Deno test):** extract a pure `parseClaudeResponse(text)` and
  `deno test` it — valid JSON, malformed output, out-of-range prices, unknown
  octane. The Anthropic call itself is covered by manual verification.
- **E2E (Playwright, real browser):** Atlas route loads, the map canvas
  renders, markers appear when station data exists, clicking a marker routes to
  a station detail page.
- **Manual:** after deploy, photograph a real price sign through the Report
  page and confirm the detected prices are correct.
- Existing `decision-math` / `staleness` / hook / autocomplete tests stay
  green.

## Dependencies + setup

- New npm packages: `maplibre-gl`, `pmtiles`, `@protomaps/basemaps`.
- New ops setup (one-time): build the `.pmtiles` extract, raise the Supabase
  Storage per-file limit, create the public `basemap` bucket, upload the file.
- New secret: `ANTHROPIC_API_KEY` on the Supabase project.

## Out of scope / deferred

- **Marker clustering** — at current station density (tens per metro) markers
  don't need clustering. Add it only if a metro gets dense enough to clutter.
- **`report` rate limiting** — `report` is client-callable and now triggers a
  billable Anthropic call per submission. At validation scale (a handful of
  testers) this is immaterial; revisit with an abuse guard if usage grows.
- **Basemap beyond Troy** — the basemap is a single extract for the NY Capital
  District, where all testers are; wider or worldwide coverage is not a goal
  for this plan.
- No change to the `nearby` / `station` edge functions, the Pumps or Garage
  screens, or the decision-math.
