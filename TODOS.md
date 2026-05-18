# TODOS

Items deferred during `/plan-eng-review` 2026-05-18. Priorities tagged: **v1.0.1** = immediately after first launch, **v1.1** = next minor release, **v1.1+** = optimization, no firm deadline.

Design doc reference: `~/.gstack/projects/gas-finder/vnerald-main-design-20260518-080854.md`

---

## v1.0.1 — Immediately after first launch

### Playwright E2E test suite

- **What:** Add Playwright to the repo; build E2E specs for the cold-visit-to-Pumps journey, PWA install on iOS Safari + Chrome Android, "Get Directions" external nav handoff, empty states (no premium nearby), Atlas map render with MapLibre, offline behavior with service worker.
- **Why:** v1 ships with only Vitest covering the decision-math + staleness pure functions. Everything UI/flow-level is uncovered. After 5 friends test it, the first reported bug will likely be in one of these uncovered surfaces.
- **Pros:** Catches the regressions that unit tests can't (PWA install flow, map render, navigation). Becomes the safety net for v1.1 changes.
- **Cons:** Playwright setup is non-trivial on a React Native Web stack (browser context vs JSDOM); ~1 week of evenings to get a first useful suite.
- **Depends on / blocked by:** v1 PWA actually shipped and at least one friend's feedback identifying a real bug worth a regression test.

### Service worker for offline shell (Workbox)

- **What:** Add a Workbox-generated service worker that uses `precacheAndRoute` with the build manifest from `dist/`. v1 ships *without* SW per ER9 (hand-rolled SW with hardcoded cache keys becomes stale every deploy; Workbox handles the hash-named chunks automatically). Add when offline shell becomes a real user need.
- **Why:** v1 PWA install works via manifest alone. SW adds: offline shell load, cached last-good API response, background sync. Nice-to-have, not v1-critical.
- **Pros:** App opens offline (shell loads even without network); recent station list cached for "I lost signal" moments.
- **Cons:** Workbox build pipeline (`workbox-build`) adds ~5min to deploy; SW lifecycle bugs are hard to debug; iOS Safari SW behavior differs from Chrome.
- **Depends on / blocked by:** v1 shipped and user feedback specifically asking for offline. Don't pre-emptively build.

### Sunoco Ultra 94 station tracking

- **What:** Identify which specific Sunoco stations actually pump Ultra 94 (vs standard premium 93), and map their `PREMIUM` Google Places entry to octane 94 instead of 93. Likely needs a secondary data source: scrape Sunoco's own station locator, manually curate, or accept user-reported list.
- **Why:** Google Places `fuelOptions` returns one `PREMIUM` entry per station. We can't distinguish Sunoco's standard 93 premium from their Ultra 94 specialty pump via Places alone. As of v1, the 94 tab shows nothing for Sunoco even at stations that actually pump it. Sunoco Ultra 94 drivers are a niche-within-the-niche of premium-octane buyers — losing them entirely is a wedge gap.
- **Pros:** Restores full coverage of the premium-octane wedge; Sunoco Ultra 94 drivers can find their fuel.
- **Cons:** Requires either scraping (brittle, may break), manual curation (doesn't scale), or community-reported (low volume pre-validation). All three are real engineering work — pre-validation it's not clear which Sunocos in the user's actual coverage area carry Ultra 94.
- **Depends on / blocked by:** Validation gate cleared + at least one Sunoco Ultra 94 driver in the user base specifically requesting it. Document the gap in v1 empty-state copy: "94 not covered yet, see Sunoco standard premium on the 93 tab."

### Decide road-distance API integration

- **What:** Evaluate whether to integrate Mapbox Directions API or Google Routing API to replace the v1 haversine × 1.3 distance approximation in the decision-math formula.
- **Why:** Haversine × 1.3 is a rough road-distance correction. If user feedback shows savings calcs are materially wrong (e.g., a station that's 2mi straight-line is actually 4mi by road through a one-way grid), the approximation hurts trust.
- **Pros:** Real road distances → trustworthy savings numbers.
- **Cons:** Routing APIs have per-call costs ($5/1000 calls Mapbox, similar Google); scales linearly with station list size; latency hit on the Pumps tab.
- **Depends on / blocked by:** v1 user feedback specifically calling out wrong savings due to distance estimation. Don't pre-emptively build.

---

## v1.1 — Next minor release (after validation gate clears)

### Auth web-redirect handling

- **What:** Wire up email OTP redirect handling on web: configure Supabase `site_url` and redirect allowlist to include the production domain; handle the `?token=...&type=...` callback in `app/sign-in.tsx` or a new web-only callback route.
- **Why:** v1 ships anonymous-only on web (sign-in deferred). v1.1 reactivates sign-in for favorites + price-drop alerts, which requires web-compatible OTP redirects.
- **Pros:** Unblocks favorites, alerts, zone-edit on web. All paywall features depend on sign-in.
- **Cons:** Different code path than native deep links; iOS Safari has stricter cookie/storage rules that affect session persistence.
- **Depends on / blocked by:** Validation gate cleared (≥10 non-household WAU × 4 weeks).

### ZonePicker MapLibre swap with anonymous localStorage zone storage

- **What:** Replace `react-native-maps` `MapView` + `Marker` + `Circle` with MapLibre GL JS in `components/zone-picker.tsx`. Add localStorage-backed anonymous zone storage that migrates to Supabase `user_price_zones` on first sign-in.
- **Why:** v1 web ships static default zone; v1.1 needs interactive zone editing so users outside the default ingest footprint can pick their own city.
- **Pros:** Web users can set custom zones; refresh-prices cron starts ingesting their cities.
- **Cons:** MapLibre's interactive Circle + drag-to-resize is the hardest map-swap item (different event API than react-native-maps); dual-storage code path is its own bug surface.
- **Depends on / blocked by:** Auth web-redirect handling (above) for the sign-in migration step.

### Web Push (VAPID + service worker push handlers)

- **What:** Implement Web Push for price-drop alerts: generate VAPID keys, add subscription endpoint to backend, register push handler in service worker, wire to existing `send-price-alerts` cron.
- **Why:** Price-drop alerts is one of the paywalled features in P5. Native already works (expo-notifications + APNs/FCM). Web requires a separate stack.
- **Pros:** Unblocks the paywall on alerts; lets web users get push without installing a native app.
- **Cons:** iOS 16.4+ only and only for installed PWAs (still a meaningful coverage gap); VAPID key management; service worker push-handler complexity.
- **Depends on / blocked by:** Validation gate cleared + auth working on web (so users can opt into alerts).

### Garage fuel-economy + tank-size inputs

- **What:** Add user-editable `mpg` and `tank_size_gal` fields to Garage tab. Persist via `lib/preferences.ts`. Pipe through to `lib/decision-math.ts:annotateWithSavings` options.
- **Why:** v1 uses fixed defaults (12gal, 25mpg) and renders savings as a ±25% range. If user feedback indicates the range is too wide to be actionable ("just tell me the number"), let users tighten it by inputting their own car's numbers.
- **Pros:** Tighter savings estimate per user; more actionable.
- **Cons:** Adds UI complexity to Garage; most users won't bother to set it (default still has to be sensible).
- **Depends on / blocked by:** User feedback specifically requesting tighter savings; otherwise the range UX may be fine.

---

## v1.1+ — Optimization, no firm deadline

### Font self-hosting + glyph subsetting + woff2 pipeline

- **What:** Replace `@expo-google-fonts/*` runtime CDN loading with self-hosted, subsetted, woff2-converted fonts served from `/public/fonts/`.
- **Why:** Current setup loads ~300-450KB of fonts from Google CDN. Subsetting to actual character set used (Latin basic + a few extras) + woff2 compression yields ~80-150KB.
- **Pros:** Faster web first paint, no Google CDN dependency, fewer external requests.
- **Cons:** +2 days of font tooling (glyph subsetting via fonttools or similar, build pipeline integration); ongoing maintenance when adding new fonts.
- **Depends on / blocked by:** Web traffic large enough that font bytes matter. Pre-validation it doesn't.

### Bundle performance budget CI check

- **What:** Add a CI workflow that measures the initial JS bundle size for each route and fails the build if any route's initial chunk exceeds a defined budget (e.g., 250KB gzipped for Pumps cold load).
- **Why:** v1 has a one-shot Week 2 manual check for MapLibre lazy-loading. v1.1+ needs ongoing protection against accidental bundle bloat as features ship.
- **Pros:** Catches regressions before they reach users.
- **Cons:** CI complexity; chosen budget number is somewhat arbitrary; can become a friction point for legitimate feature additions.
- **Depends on / blocked by:** Vercel CI integration; consensus on per-route budgets.

---

## Capture rule

Add to this file as `/plan-eng-review`, `/plan-ceo-review`, `/plan-design-review`, or any future planning session surfaces deferred items. Cross-reference the source design doc when adding. Don't let items live only in chat history or notes.
