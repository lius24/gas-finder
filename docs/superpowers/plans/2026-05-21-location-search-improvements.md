# Location Search Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plain text location fields with type-ahead address autocomplete everywhere, stop the misleading fake-station empty state, and add a script to ingest real station data for test metros.

**Architecture:** A new keyless geocoding adapter function (Photon) backs one reusable `AddressAutocomplete` React component, wired into the Garage home-location picker and both themed Pumps city searches. The Pumps views drop their hardcoded `SAMPLE_STATIONS` so an empty result reads as honest. A standalone bash script ingests station data per metro via the existing `ingest-stations` edge function.

**Tech Stack:** Vite + React 19 + TypeScript, Vitest + Testing Library, Photon geocoder (`photon.komoot.io`, keyless), bash + curl.

**Spec:** `docs/superpowers/specs/2026-05-21-location-search-improvements-design.md`

**Branch:** `location-improvements` (already created).

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `core/adapters/geocoding.ts` | Modify | Add `autocompleteAddress()` + `AddressSuggestion` type (Photon) |
| `tests/unit/geocoding.test.ts` | Modify | Add `autocompleteAddress` unit tests |
| `src/components/AddressAutocomplete.tsx` | Create | Reusable debounced type-ahead address input |
| `src/components/AddressAutocomplete.css` | Create | Theme-aware styling for the component |
| `tests/unit/address-autocomplete.test.tsx` | Create | Component behavior tests |
| `core/use-pumps-data.ts` | Modify | Add `applyLocationSelection`; drop string-search surface |
| `src/routes/Garage.tsx` | Modify | Use `AddressAutocomplete` in the home-location picker |
| `src/components/FerrariPumps.tsx` | Modify | Use `AddressAutocomplete`; remove samples; honest empty state |
| `src/components/FerrariPumps.css` | Modify | Drop now-unused search/sample styles if any |
| `src/components/AirtablePumps.tsx` | Modify | Use `AddressAutocomplete`; remove samples; honest empty state |
| `src/components/AirtablePumps.css` | Modify | Drop now-unused search/sample styles if any |
| `scripts/ingest-metros.sh` | Create | One-shot multi-metro station ingest |
| `e2e/pumps.spec.ts` | Modify | Smoke-test the autocomplete dropdown |

---

## Task 1: `autocompleteAddress` geocoding adapter

**Files:**
- Modify: `core/adapters/geocoding.ts`
- Test: `tests/unit/geocoding.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the end of `tests/unit/geocoding.test.ts` (inside the file, after the existing `describe` block):

```ts
import { autocompleteAddress } from '@core/adapters/geocoding';

describe('autocompleteAddress (Photon)', () => {
  it('parses Photon features into address suggestions', async () => {
    mockFetch({
      ok: true,
      json: {
        features: [
          {
            geometry: { coordinates: [-73.6918, 42.7284] },
            properties: {
              osm_type: 'W',
              osm_id: 123,
              housenumber: '125',
              street: 'Hoosick St',
              city: 'Troy',
              state: 'New York',
            },
          },
        ],
      },
    });
    const out = await autocompleteAddress('125 Hoosick');
    expect(out).toEqual([
      {
        id: 'W123--73.6918,42.7284'.replace('W123-', 'W123-'),
        label: '125 Hoosick St, Troy, New York',
        latitude: 42.7284,
        longitude: -73.6918,
      },
    ]);
  });

  it('returns [] for a query shorter than 3 chars without fetching', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await autocompleteAddress('ab')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns [] when Photon returns no features', async () => {
    mockFetch({ ok: true, json: { features: [] } });
    expect(await autocompleteAddress('nowhere place')).toEqual([]);
  });

  it('throws when the Photon request fails', async () => {
    mockFetch({ ok: false, status: 502 });
    await expect(autocompleteAddress('Troy NY')).rejects.toThrow(/502/);
  });
});
```

Note: the first test's `id` only needs to be a stable non-empty string; assert on `label`/`latitude`/`longitude` precisely and on `id` being a string. Simplify the first test's `expect` to:

```ts
    const out = await autocompleteAddress('125 Hoosick');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      label: '125 Hoosick St, Troy, New York',
      latitude: 42.7284,
      longitude: -73.6918,
    });
    expect(typeof out[0].id).toBe('string');
    expect(out[0].id.length).toBeGreaterThan(0);
```

Use that simplified form — delete the `.replace(...)` version above.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/geocoding.test.ts`
Expected: FAIL — `autocompleteAddress` is not exported.

- [ ] **Step 3: Implement `autocompleteAddress`**

Append to `core/adapters/geocoding.ts`:

```ts
// Address autocomplete via Photon (photon.komoot.io) — a free, keyless,
// OpenStreetMap-based geocoder built for type-ahead. Keyless keeps it
// consistent with the no-API-key decision for the other geocoding here.
export type AddressSuggestion = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
  };
};

export async function autocompleteAddress(query: string): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=5&lang=en`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) {
    throw new Error(`Address search failed (${res.status})`);
  }

  const data = (await res.json()) as { features?: PhotonFeature[] };
  const out: AddressSuggestion[] = [];
  for (const f of data.features ?? []) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length !== 2) continue;
    const [lon, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const p = f.properties ?? {};
    const street =
      p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street;
    const label = [street ?? p.name, p.city, p.state].filter(Boolean).join(', ');
    if (!label) continue;

    out.push({
      id: `${p.osm_type ?? ''}${p.osm_id ?? ''}-${lon},${lat}`,
      label,
      latitude: lat,
      longitude: lon,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/geocoding.test.ts`
Expected: PASS — all `autocompleteAddress` tests plus the existing geocoding tests.

- [ ] **Step 5: Commit**

```bash
git add core/adapters/geocoding.ts tests/unit/geocoding.test.ts
git commit -m "Add Photon address-autocomplete geocoding adapter"
```

---

## Task 2: `AddressAutocomplete` component

**Files:**
- Create: `src/components/AddressAutocomplete.tsx`
- Create: `src/components/AddressAutocomplete.css`
- Test: `tests/unit/address-autocomplete.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/address-autocomplete.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddressAutocomplete } from '@/components/AddressAutocomplete';

const { autocompleteMock } = vi.hoisted(() => ({ autocompleteMock: vi.fn() }));

vi.mock('@core/adapters/geocoding', () => ({
  autocompleteAddress: autocompleteMock,
}));

afterEach(() => {
  autocompleteMock.mockReset();
});

describe('AddressAutocomplete', () => {
  it('queries after typing and shows a results dropdown', async () => {
    autocompleteMock.mockResolvedValue([
      { id: 'a', label: 'Troy, New York', latitude: 42.7, longitude: -73.6 },
    ]);
    render(<AddressAutocomplete placeholder="Search" onSelect={() => {}} />);

    await userEvent.type(screen.getByPlaceholderText('Search'), 'Troy');
    await waitFor(() => expect(autocompleteMock).toHaveBeenCalledWith('Troy'));
    expect(await screen.findByText('Troy, New York')).toBeInTheDocument();
  });

  it('calls onSelect with the chosen suggestion', async () => {
    const suggestion = { id: 'a', label: 'Troy, New York', latitude: 42.7, longitude: -73.6 };
    autocompleteMock.mockResolvedValue([suggestion]);
    const onSelect = vi.fn();
    render(<AddressAutocomplete placeholder="Search" onSelect={onSelect} />);

    await userEvent.type(screen.getByPlaceholderText('Search'), 'Troy');
    await userEvent.click(await screen.findByText('Troy, New York'));
    expect(onSelect).toHaveBeenCalledWith(suggestion);
  });

  it('does not query for inputs shorter than 3 characters', async () => {
    render(<AddressAutocomplete placeholder="Search" onSelect={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('Search'), 'ab');
    await new Promise((r) => setTimeout(r, 400));
    expect(autocompleteMock).not.toHaveBeenCalled();
  });
});
```

This needs `@testing-library/user-event` — install it in Step 2.

- [ ] **Step 2: Install the test dependency, then run the test to verify it fails**

Run: `npm install -D @testing-library/user-event`
Then: `npx vitest run tests/unit/address-autocomplete.test.tsx`
Expected: FAIL — `AddressAutocomplete` module does not exist.

- [ ] **Step 3: Create the component**

Create `src/components/AddressAutocomplete.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react';

import { autocompleteAddress, type AddressSuggestion } from '@core/adapters/geocoding';

import './AddressAutocomplete.css';

type Props = {
  placeholder?: string;
  initialValue?: string;
  autoFocus?: boolean;
  onSelect: (suggestion: AddressSuggestion) => void;
};

export function AddressAutocomplete({ placeholder, initialValue, autoFocus, onSelect }: Props) {
  const [value, setValue] = useState(initialValue ?? '');
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  // Monotonic id so a slow earlier response can't overwrite a newer query.
  const queryId = useRef(0);
  const listId = useId();

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    const id = ++queryId.current;
    setLoading(true);
    setFailed(false);
    const timer = setTimeout(() => {
      autocompleteAddress(q)
        .then((r) => {
          if (id !== queryId.current) return;
          setResults(r);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          if (id !== queryId.current) return;
          setResults([]);
          setFailed(true);
          setOpen(true);
        })
        .finally(() => {
          if (id === queryId.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  const choose = (s: AddressSuggestion) => {
    queryId.current++; // invalidate any in-flight query
    setValue(s.label);
    setResults([]);
    setOpen(false);
    setActive(-1);
    onSelect(s);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="addr-ac">
      <input
        className="addr-ac-input"
        type="text"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        // Delay close so a click on a result still registers.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {loading ? <span className="addr-ac-spinner" aria-label="Searching" /> : null}
      {open ? (
        <ul className="addr-ac-list" id={listId} role="listbox">
          {failed ? (
            <li className="addr-ac-msg">Couldn&apos;t search right now — try again.</li>
          ) : results.length === 0 ? (
            <li className="addr-ac-msg">No matches.</li>
          ) : (
            results.map((s, i) => (
              <li key={s.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={
                    i === active ? 'addr-ac-item addr-ac-item--active' : 'addr-ac-item'
                  }
                  // Prevent the input's blur from firing before the click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(s)}
                >
                  {s.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create the stylesheet**

Create `src/components/AddressAutocomplete.css`:

```css
.addr-ac {
  position: relative;
  width: 100%;
}

.addr-ac-input {
  width: 100%;
  background: transparent;
  border: 1px solid var(--paper-edge);
  border-radius: var(--radius-md);
  padding: 11px 14px;
  font-size: 14px;
  color: var(--ink);
  outline: none;
}

.addr-ac-input::placeholder {
  color: var(--ink-faint);
}

.addr-ac-input:focus {
  border-color: var(--rust);
}

.addr-ac-spinner {
  position: absolute;
  right: 12px;
  top: 12px;
  width: 16px;
  height: 16px;
  border: 2px solid var(--paper-edge);
  border-top-color: var(--rust);
  border-radius: 50%;
  animation: addr-ac-spin 700ms linear infinite;
}

@keyframes addr-ac-spin {
  to {
    transform: rotate(360deg);
  }
}

.addr-ac-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 60;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--paper);
  border: 1px solid var(--paper-edge);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  max-height: 280px;
  overflow-y: auto;
}

.addr-ac-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--ink);
  background: transparent;
  border-radius: var(--radius-sm);
}

.addr-ac-item:hover,
.addr-ac-item--active {
  background: var(--paper-edge);
}

.addr-ac-msg {
  padding: 10px 12px;
  font-size: 13px;
  font-style: italic;
  color: var(--ink-faint);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/address-autocomplete.test.tsx`
Expected: PASS — all three tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add src/components/AddressAutocomplete.tsx src/components/AddressAutocomplete.css tests/unit/address-autocomplete.test.tsx package.json package-lock.json
git commit -m "Add reusable AddressAutocomplete component"
```

---

## Task 3: `usePumpsData` — add `applyLocationSelection`, drop string search

**Files:**
- Modify: `core/use-pumps-data.ts`

The current hook has a typed-string search path: state `searchInput` / `searching`, callback `submitSearch` (which calls `geocode`). With autocomplete the chosen suggestion already carries lat/lon, so this path is replaced by `applyLocationSelection`.

- [ ] **Step 1: Replace the `geocode` import**

In `core/use-pumps-data.ts`, the import line near the top currently is:

```ts
import { geocode, reverseGeocode, type GeoAddress } from './adapters/geocoding';
```

Change it to (drop `geocode`, no longer used):

```ts
import { reverseGeocode, type GeoAddress } from './adapters/geocoding';
```

- [ ] **Step 2: Remove the string-search state**

Delete these two state declarations from the hook body:

```ts
  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
```

Keep `searchLabel` / `setSearchLabel` — still used to label the viewed location.

- [ ] **Step 3: Replace `submitSearch` with `applyLocationSelection`**

Delete the entire `submitSearch` callback:

```ts
  const submitSearch = useCallback(async () => {
    const q = searchInput.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const results = await geocode(q);
      if (results.length === 0) {
        setError(`Couldn't find "${q}" — try a city or ZIP.`);
        return;
      }
      const r = results[0];
      const next: RecentLocation = { label: q, latitude: r.latitude, longitude: r.longitude };
      setUsingCurrentLocation(false);
      setCoords({ latitude: r.latitude, longitude: r.longitude });
      setSearchLabel(q);
      setLoading(true);
      await pushRecentSearch(next);
      setRecents(await getRecentSearches());
    } catch {
      setError("Couldn't search right now — check your connection and retry.");
    } finally {
      setSearching(false);
    }
  }, [searchInput]);
```

Replace it with:

```ts
  const applyLocationSelection = useCallback(
    async (loc: { label: string; latitude: number; longitude: number }) => {
      setError(null);
      setUsingCurrentLocation(false);
      setSearchLabel(loc.label);
      setCoords({ latitude: loc.latitude, longitude: loc.longitude });
      setLoading(true);
      await pushRecentSearch(loc);
      setRecents(await getRecentSearches());
    },
    [],
  );
```

- [ ] **Step 4: Update the returned object**

In the `return { ... }` block, the `// location` group currently includes `searchInput`, `setSearchInput`, `searching`, `submitSearch`. Remove those four keys and add `applyLocationSelection`. The location group should read:

```ts
    // location
    coords,
    usingCurrentLocation,
    currentLocationLabel,
    searchLabel,
    recents,
    applyCurrentLocation,
    applyRecent,
    applyLocationSelection,
```

- [ ] **Step 5: Run the existing hook test + typecheck**

Run: `npx vitest run tests/unit/use-pumps-data.test.ts`
Expected: PASS (the hook test exercises the octane merge, not search — still green).

Run: `npx tsc --noEmit`
Expected: FAIL — `FerrariPumps.tsx` / `AirtablePumps.tsx` still reference the removed `searchInput` / `submitSearch`. That is expected; Tasks 5 and 6 fix the views. Do not try to fix them here.

- [ ] **Step 6: Commit**

```bash
git add core/use-pumps-data.ts
git commit -m "Replace typed-string search with applyLocationSelection in usePumpsData"
```

---

## Task 4: Wire `AddressAutocomplete` into the Garage home-location picker

**Files:**
- Modify: `src/routes/Garage.tsx`

The Garage home-location section currently uses a text input that calls `geocode()` on a "Save home" button. Replace the input with `AddressAutocomplete`; selecting a suggestion sets the home location directly.

- [ ] **Step 1: Add the import**

At the top of `src/routes/Garage.tsx`, with the other `src/components` / local imports, add:

```ts
import { AddressAutocomplete } from '../components/AddressAutocomplete';
```

- [ ] **Step 2: Replace the home-location picker body**

Find the `HomeLocationPicker` sub-component (or the home-location JSX block). Its editing UI currently is a text `<input>` + a "Save home" button that runs `geocode()`. Replace the text input + Save button with:

```tsx
<AddressAutocomplete
  placeholder="City, ZIP, or full address"
  initialValue={home?.label ?? ''}
  onSelect={(s) => {
    void setHomeLocation({ label: s.label, latitude: s.latitude, longitude: s.longitude });
    setHome({ label: s.label, latitude: s.latitude, longitude: s.longitude });
  }}
/>
```

Notes for the implementer:
- `setHomeLocation` is the async persister from `@core/preferences`; `setHome` is the local React state setter for the displayed home value (match the existing state variable names in the file — they may differ; use whatever the file already uses to hold and persist the home location).
- Delete the now-unused `geocode` import and any `geocode()` call, the local "query" text state, and the Save/Cancel handlers tied to the old input. Keep a "Clear" affordance that calls `setHomeLocation(null)` if the file had one.
- If removing handlers leaves variables unused, delete them — `tsc` (noUnusedLocals) will flag any miss.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `Garage.tsx` (errors may still remain in the Pumps views — fixed in Tasks 5-6).

- [ ] **Step 4: Build**

Run: `npx vite build`
Expected: build fails only if the Pumps views are still broken; `Garage.tsx` itself compiles. If `vite build` blocks on the Pumps views, skip the build check here and rely on `tsc` scoped output — proceed to Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Garage.tsx
git commit -m "Use AddressAutocomplete in the Garage home-location picker"
```

---

## Task 5: FerrariPumps — autocomplete search, remove samples, honest empty state

**Files:**
- Modify: `src/components/FerrariPumps.tsx`
- Modify: `src/components/FerrariPumps.css`

- [ ] **Step 1: Remove the sample stations**

In `src/components/FerrariPumps.tsx`, delete the `SampleStation` type and the entire `SAMPLE_STATIONS` array constant.

- [ ] **Step 2: Build cards only from real data**

The `cards` computation currently is `const cards: CardData[] = hasData ? sortedStations.map(...) : SAMPLE_STATIONS.map(...)`. Change it so cards come only from real stations:

```tsx
const cards: CardData[] = sortedStations.map((item, index) => {
  // ...unchanged mapping body that builds CardData from `item` / `index`...
});
```

Keep the existing mapping body exactly; just remove the `hasData ? ... : SAMPLE_STATIONS.map(...)` ternary so it is a plain `sortedStations.map(...)`.

- [ ] **Step 3: Swap the hook destructuring**

Where the component destructures `data` (the `PumpsData`), remove `searchInput`, `setSearchInput`, `searching`, `submitSearch`; add `applyLocationSelection`. Keep `searchLabel`, `applyCurrentLocation`, etc.

- [ ] **Step 4: Replace the search form with AddressAutocomplete**

Add the import at the top:

```tsx
import { AddressAutocomplete } from './AddressAutocomplete';
```

Replace the entire `<form className="fp-search">…</form>` block with:

```tsx
<div className="fp-search">
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
</div>
```

- [ ] **Step 5: Honest empty state**

The station grid currently renders `cards` whenever `!loading`. With samples gone, an empty `cards` array renders nothing and the existing `fp-empty` message shows. Strengthen that message block so it reads as a real empty state. Replace the existing `{!loading && !error && !hasData ? <p className="fp-empty">…</p> : null}` block with:

```tsx
{!loading && !error && !hasData ? (
  <div className="fp-empty">
    <p className="fp-empty-title">No premium stations near you yet</p>
    <p className="fp-empty-body">
      {stations.length === 0
        ? `We don't have pump data for this spot yet. Search a city or ZIP above, or widen the radius.`
        : `Stations are here, but no live prices for ${
            octane === 'premium' ? 'any premium octane' : `${octane} octane`
          } yet.`}
    </p>
  </div>
) : null}
```

- [ ] **Step 6: Update the CSS**

In `src/components/FerrariPumps.css`:

(a) Replace the existing `.fp-search` rule. The old rule gave the wrapper its
own border/background/padding for the icon+input layout — keeping it would
double up with `AddressAutocomplete`'s own bordered input. Reduce `.fp-search`
to a plain spacing wrapper:

```css
.fp-search {
  margin-bottom: var(--s4);
}
```

(b) Delete the `.fp-search-icon` and `.fp-search-input` rules — the search
form that used them is gone. **Keep `.fp-spinner`** — the loading indicator
(`.fp-spinner--block`) still uses it.

(c) Replace the existing `.fp-empty` rule with:

```css
.fp-empty {
  text-align: center;
  margin-top: var(--s5);
}

.fp-empty-title {
  margin: 0 0 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 22px;
  font-weight: 500;
  color: #fff;
}

.fp-empty-body {
  margin: 0 auto;
  max-width: 420px;
  font-size: 14px;
  color: var(--body);
}
```

- [ ] **Step 7: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors in `FerrariPumps.tsx`.

Run: `npx vite build`
Expected: fails only if `AirtablePumps.tsx` is still broken (Task 6). `FerrariPumps.tsx` compiles.

- [ ] **Step 8: Commit**

```bash
git add src/components/FerrariPumps.tsx src/components/FerrariPumps.css
git commit -m "FerrariPumps: autocomplete search, honest empty state, drop samples"
```

---

## Task 6: AirtablePumps — autocomplete search, remove samples, honest empty state

**Files:**
- Modify: `src/components/AirtablePumps.tsx`
- Modify: `src/components/AirtablePumps.css`

- [ ] **Step 1: Remove the sample stations**

In `src/components/AirtablePumps.tsx`, delete the `SampleStation` type and the `SAMPLE_STATIONS` array constant.

- [ ] **Step 2: Build cards only from real data**

Change the `cards` computation from the `hasData ? sortedStations.map(...) : SAMPLE_STATIONS.map(...)` ternary to a plain `sortedStations.map(...)`, keeping the existing mapping body unchanged.

- [ ] **Step 3: Swap the hook destructuring**

Remove `searchInput`, `setSearchInput`, `searching`, `submitSearch` from the `data` destructuring; add `applyLocationSelection`.

- [ ] **Step 4: Replace the search form with AddressAutocomplete**

Add the import:

```tsx
import { AddressAutocomplete } from './AddressAutocomplete';
```

Replace the entire `<form className="ap-search">…</form>` block with:

```tsx
<div className="ap-search">
  <AddressAutocomplete
    placeholder="Search a city, zip, or address"
    onSelect={(s) =>
      applyLocationSelection({
        label: s.label,
        latitude: s.latitude,
        longitude: s.longitude,
      })
    }
  />
</div>
```

- [ ] **Step 5: Honest empty state**

The Airtable view renders sample cards inside an empty-state block (`showEmpty`). Remove the sample-card rendering. Where the empty state is rendered, replace the sample-card list + the `ap-empty-kicker` / `ap-empty-text` block with:

```tsx
{!loading && showEmpty ? (
  <div className="ap-empty">
    <p className="ap-empty-title">No premium stations near you yet</p>
    <p className="ap-empty-body">
      {stations.length === 0
        ? `We don't have pump data for this spot yet. Search a city or ZIP above, or widen the radius.`
        : `Stations are here, but no live prices for ${
            octane === 'premium' ? 'any premium octane' : `${octane} octane`
          } yet.`}
    </p>
  </div>
) : null}
```

Keep the real-data grid (`!loading && hasData` → render `cards`). Ensure the `cards.map(...)` grid only renders when `hasData` is true.

- [ ] **Step 6: Update the CSS**

In `src/components/AirtablePumps.css`:

(a) Reduce `.ap-search` to a plain spacing wrapper — the old rule's
border/background/padding would double up with `AddressAutocomplete`'s own
bordered input:

```css
.ap-search {
  margin-bottom: var(--s3);
}
```

(b) Delete the `.ap-search-icon` and `.ap-search-input` rules. **Keep
`.ap-spinner`** — the loading indicator still uses it.

(c) Remove the `.ap-empty-kicker` and `.ap-empty-text` rules and add:

```css
.ap-empty {
  text-align: center;
  margin: var(--s5) 0;
}

.ap-empty-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 600;
  color: var(--ink);
}

.ap-empty-body {
  margin: 0 auto;
  max-width: 420px;
  font-size: 14px;
  color: var(--body);
}
```

- [ ] **Step 7: Typecheck, build, full test run**

Run: `npx tsc --noEmit` — expected: clean.
Run: `npx vite build` — expected: succeeds.
Run: `npx vitest run` — expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/AirtablePumps.tsx src/components/AirtablePumps.css
git commit -m "AirtablePumps: autocomplete search, honest empty state, drop samples"
```

---

## Task 7: Multi-metro ingest script

**Files:**
- Create: `scripts/ingest-metros.sh`

- [ ] **Step 1: Create the script**

Create `scripts/ingest-metros.sh`:

```bash
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
```

- [ ] **Step 2: Make it executable and sanity-check syntax**

Run: `chmod +x scripts/ingest-metros.sh && bash -n scripts/ingest-metros.sh`
Expected: no output (syntax OK). Do not run it for real here — that needs live secrets and the builder's metro list.

- [ ] **Step 3: Commit**

```bash
git add scripts/ingest-metros.sh
git commit -m "Add multi-metro station ingest script"
```

---

## Task 8: Extend the Playwright smoke test

**Files:**
- Modify: `e2e/pumps.spec.ts`

- [ ] **Step 1: Add the autocomplete smoke test**

Append to `e2e/pumps.spec.ts`:

```ts
test('city search shows an autocomplete dropdown', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox');
  await search.fill('Troy');
  // Photon is a live external call; allow a generous window, assert the
  // listbox appears (results or a message — either proves the component wired).
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run the E2E suite**

Run: `npx playwright test`
Expected: PASS — the existing smoke tests plus the new autocomplete test. If Photon is unreachable in the test environment, the `listbox` still renders with a "Couldn't search" / "No matches" message, so the assertion holds.

- [ ] **Step 3: Commit**

```bash
git add e2e/pumps.spec.ts
git commit -m "E2E: smoke-test the city-search autocomplete"
```

---

## Final Verification

- [ ] Run `npx tsc --noEmit` — clean.
- [ ] Run `npx eslint .` — clean.
- [ ] Run `npx vitest run` — all unit + hook + component tests pass.
- [ ] Run `npx vite build` — succeeds.
- [ ] Run `npx vite preview` and in a browser: confirm the Garage home-location picker and both Pumps city searches show a type-ahead dropdown; confirm an out-of-coverage location shows the honest empty state, not fake station cards.
- [ ] Open a PR for `location-improvements` (this is a feature-sized change — PR + Vercel preview verification, per the project's ship cadence).

## Notes for the implementer

- `AddressSuggestion` is defined in Task 1 (`core/adapters/geocoding.ts`) and consumed by Tasks 2-6. Do not redefine it.
- `applyLocationSelection` is added to `usePumpsData` in Task 3 and consumed by Tasks 5-6.
- Tasks 3, 5, 6 are interdependent (the hook change breaks the views until they are updated) — do them in order; `tsc` is only expected fully clean after Task 6.
- Do not touch the `nearby` / `station` / backend edge functions.
- On-demand auto-ingest and WAU analytics are explicitly deferred — see the spec's "Deferred" section. Do not build them in this plan.
