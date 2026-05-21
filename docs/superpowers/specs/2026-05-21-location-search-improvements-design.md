# Design: Location search improvements

Date: 2026-05-21
Status: approved via brainstorming
Repo: lius24/gas-finder · branch `location-improvements`

## Problem

When a user opens gas-finder away from a seed area, geolocation succeeds but
the `nearby` edge function returns no stations — the backend only has station
data ingested for a few seed metros (Sedona, Phoenix, Flagstaff, Troy NY). The
Pumps view, on an empty result, renders six hardcoded Troy-addressed sample
cards (`SAMPLE_STATIONS`) that look like real results. The effect: the app
appears to "always show Troy" wherever you are. A small "No live stations
nearby" line sits under the fake cards but is easy to miss.

Separately, every location search — the Garage home-location picker and the
Pumps city search — is a plain text field that geocodes only on submit. The
user wants type-ahead autocomplete: type part of an address, pick from
suggestions.

This blocks the friend-distribution validation test: friends outside the seed
metros open the app to fake data and a clunky search.

## Scope

Three parts, all in this implementation plan:

- **A. Honest empty state** — stop rendering fake sample cards.
- **B. Address autocomplete** — one reusable component, used in every
  location search (Garage home-location + Pumps city search).
- **C. Station-data coverage** — a one-shot multi-metro ingest script so the
  test metros have real data.

**Deferred (documented here, not built now):** on-demand auto-ingest; a
lightweight weekly-active-user analytics signal. See "Deferred" below.

## A. Honest empty state

`FerrariPumps.tsx` and `AirtablePumps.tsx` currently fall back to
`SAMPLE_STATIONS` when `sortedStations` is empty, rendering six placeholder
cards indistinguishable from real ones.

Change: delete the `SAMPLE_STATIONS` constants and the sample-card rendering.
When `!loading && !hasData`, render an honest empty state instead:

- A clear headline: "No premium stations near you yet."
- A short line on why: location not covered yet, or GPS off.
- The city search (the autocomplete from part B) front and center as the
  primary action.
- Keep the existing `error` branch (permission denied / location unavailable)
  as-is — that path already shows a real message and a retry.

Each themed view keeps its own styling for the empty state (Ferrari dark,
Airtable light) — it is a small block, no shared component needed. The
`hiddenUnpriced` "+ N stations without premium data" note is unaffected.

## B. Address autocomplete

### Provider: Photon

`https://photon.komoot.io/api?q=<query>&limit=5&lang=en` — a free, keyless,
OpenStreetMap-based geocoder built for autocomplete. Chosen over:

- **Nominatim** (already used for forward/reverse geocode): its usage policy
  forbids per-keystroke / autocomplete querying — would risk an IP block.
- **Google Places Autocomplete**: best quality but needs a paid API key in
  the client bundle (leak risk) and ongoing cost.

Photon is keyless, so it stays consistent with the existing eng-review
decision D3 ("no key to leak"). Returns a GeoJSON `FeatureCollection`; each
feature has `geometry.coordinates [lon, lat]` and `properties`
(`name`, `housenumber`, `street`, `city`, `state`, `postcode`, `countrycode`).

### `core/adapters/geocoding.ts` — add `autocompleteAddress`

```
export type AddressSuggestion = {
  id: string;          // stable key for React lists
  label: string;       // human-readable, e.g. "Hoosick St, Troy, New York"
  latitude: number;
  longitude: number;
};

autocompleteAddress(query: string): Promise<AddressSuggestion[]>
```

- Builds the label from `properties` (street + housenumber if present, else
  name; then city, then state) — skip empty parts, join with commas.
- Returns `[]` for a blank/short query or no matches.
- Throws on network/HTTP failure (caller catches and shows an inline state).
- Sends `Accept-Language: en`, same as the existing Nominatim calls.

The existing `geocode()` / `reverseGeocode()` stay (reverse geocode is still
used for the "you are here" label).

### `src/components/AddressAutocomplete.tsx` — reusable component

A controlled text input with a suggestions dropdown.

- Props: `placeholder`, `onSelect(suggestion: AddressSuggestion)`, optional
  `initialValue`, optional `autoFocus`.
- Debounces input ~250ms; queries `autocompleteAddress` only for queries ≥3
  characters.
- Renders a dropdown of up to 5 results; shows a loading spinner while
  fetching, an "no matches" line on empty, an inline error line on failure.
- Selection by click or keyboard (Arrow Up/Down to move, Enter to choose,
  Escape to close). On select: fill the input with the label, close the
  dropdown, call `onSelect`.
- Own stylesheet `AddressAutocomplete.css`, theme-aware via the existing CSS
  custom properties (works under both Ferrari and Airtable).
- Cancels / ignores stale in-flight requests so an older response can't
  overwrite a newer one (track the latest query).

### Wiring — every location search

1. **Garage home-location picker** (`src/routes/Garage.tsx`): replace the
   current text input + `geocode()`-on-submit with `AddressAutocomplete`.
   On select → `setHomeLocation({ label, latitude, longitude })`.
2. **Pumps city search** — both `FerrariPumps.tsx` and `AirtablePumps.tsx`:
   replace the current search input with `AddressAutocomplete`. On select →
   apply the location to the hook (see below).

### `core/use-pumps-data.ts` adjustment

The current search path (`searchInput`, `setSearchInput`, `submitSearch`,
`searching`) geocodes a typed string on submit. With autocomplete the chosen
suggestion already carries lat/lon, so no second geocode is needed.

Add `applyLocationSelection(loc: { label: string; latitude: number;
longitude: number })`: sets `coords`, sets `searchLabel`, marks
`usingCurrentLocation = false`, sets `loading = true`, and pushes the location
into recent searches (`pushRecentSearch`). Remove `searchInput` /
`setSearchInput` / `submitSearch` / `searching` from the hook's surface (the
views no longer need them). `applyRecent` already does the same shape of work
and stays.

## C. Station-data coverage

The reason "see stations near my real location" fails is data, not code:
`nearby` has nothing to return outside the seed metros.

### Now: one-shot multi-metro ingest script

`scripts/ingest-metros.sh` — modeled on the existing
`scripts/backfill-missing-premium.sh`. Takes a list of metros (lat/lon pairs,
or place names it forward-geocodes), and for each calls the `ingest-stations`
edge function (which pulls from Google Places and upserts `stations`).
Requires `CRON_SECRET`. Idempotent — re-running upserts on `google_place_id`.

Before distribution, run it once for the metros where the builder + the five
friends live. The builder supplies the metro list at run time.

### Deferred: on-demand auto-ingest

The scalable version — when `nearby` returns empty, the backend enqueues an
`ingest-stations` job for that area and the next user there gets data. This is
a real backend feature with Google Places cost and first-load latency
tradeoffs. It is the right v1.1 move *if* the validation test shows demand —
not before. Not built in this plan.

## Error handling

| Path | Failure | Handling |
|---|---|---|
| `autocompleteAddress` | network / HTTP error | throws; `AddressAutocomplete` catches → inline "couldn't search right now" line, input still usable |
| `autocompleteAddress` | no matches | returns `[]` → dropdown shows "no matches" |
| `AddressAutocomplete` | stale response arrives after a newer query | dropped — only the latest query's results render |
| Pumps view | `nearby` empty | honest empty state (part A), not fake cards |
| `ingest-metros.sh` | a metro fails to ingest | logs and continues to the next; non-zero exit if any failed |

## Testing

- **Unit (Vitest):** `autocompleteAddress` — results parse, label assembly,
  empty query, no matches, HTTP failure. Mock `fetch` (same pattern as the
  existing geocoding tests).
- **Component (Vitest + Testing Library):** `AddressAutocomplete` — debounced
  query fires, dropdown renders results, click selects and calls `onSelect`,
  short query does not query.
- **E2E (Playwright):** extend the Pumps smoke test — type in the search,
  assert a suggestion dropdown appears. (Photon is a live external call; if
  flaky in CI, stub the network or keep this assertion lenient.)
- Existing `decision-math` / `staleness` / hook tests stay green.

## Deferred / separate

- **On-demand auto-ingest** — see part C.
- **WAU analytics** — the validation gate is defined as "10 weekly active
  users × 4 weeks," but the app has no analytics, so that number cannot be
  measured today. A lightweight privacy-respecting analytics signal (page
  views / unique-visitor count) should be its own small task before the
  friend test produces a verdict. Out of scope for this plan; flagged so it
  is not forgotten.

## Out of scope

- No change to the `nearby` / `station` / `report` edge functions.
- No new map (Atlas stays a stub).
- No redesign of the Pumps or Garage layouts beyond swapping the search
  inputs and the empty state.
