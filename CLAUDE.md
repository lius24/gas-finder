# gas-finder — Claude / gstack project guide

## Project

Web PWA for finding the cheapest higher-octane gas with authoritative
pump-feed prices and net-savings decision math. Native is deferred behind a
usage trigger; this repo is the web app only.

**Product design doc (direction — wedge, validation gate):** `~/.gstack/projects/gas-finder/vnerald-main-design-20260518-080854.md`
**Re-platform design doc (RN-Web → Vite architecture):** `~/.gstack/projects/gas-finder/vnerald-main-design-20260520-072743.md`
**Deferred work:** `TODOS.md`

## Stack

- Frontend: Vite + React 19 + React Router 7, TypeScript (strict). Migrated
  off Expo Router / React Native Web in 2026-05 — see the re-platform doc.
- Backend: Supabase (Postgres + Edge Functions + Auth + Cron via `cron.schedule`).
- Data ingest: Google Places `fuelOptions` (authoritative pump-feed prices, NOT user-reported).
- Icons: `lucide-react`. Fonts: `@fontsource/outfit` (Ferrari) + `@fontsource/archivo` (Airtable).

## Repo layout

- `core/` — RN-free shared logic: types, decision-math, staleness, geo, the
  Supabase client, auth context, the `usePumpsData` hook, theme registry.
  Zero React Native imports. Pure modules are unit-tested here.
- `core/adapters/` — browser-API wrappers that replaced expo-* packages:
  `storage.ts` (guarded localStorage, in-memory fallback), `geolocation.ts`
  (browser geolocation + 8s timeout race), `geocoding.ts` (Nominatim, keyless).
- `src/` — the Vite app: `main.tsx` entry, `App.tsx` router, `routes/`
  (one component per screen), `components/` (FerrariPumps, AirtablePumps,
  NavBar), `styles/` (global.css + themes.css).
- `supabase/` — backend (Edge Functions, migrations). Untouched by the web app.

## Testing

- `npm test` — Vitest: adapter unit tests, the `usePumpsData` hook test,
  decision-math + staleness pure-function suites.
- `npm run test:e2e` — Playwright smoke test (`e2e/`) for the Pumps happy path.
- `npm run typecheck` / `npm run lint` — `tsc --noEmit` and ESLint flat config.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas / brainstorming → invoke `/office-hours`
- Strategy / scope → invoke `/plan-ceo-review`
- Architecture → invoke `/plan-eng-review`
- Design system / plan review → invoke `/design-consultation` or `/plan-design-review`
- Full review pipeline → invoke `/autoplan`
- Bugs / errors → invoke `/investigate`
- QA / testing site behavior → invoke `/qa` or `/qa-only`
- Code review / diff check → invoke `/review`
- Visual polish → invoke `/design-review`
- Ship / deploy / PR → invoke `/ship` or `/land-and-deploy`
- Save progress → invoke `/context-save`
- Resume context → invoke `/context-restore`

## Brand-aware octane mapping

`supabase/functions/_shared/places-fuel.ts` maps Google Places `fuelOptions` types to DB octane values. **Default heuristic:** PREMIUM = 93 east of longitude -100, 91 west. **Brand overrides** live in `BRAND_PREMIUM_OVERRIDE` at the top of that file — when dogfooding surfaces a brand whose actual premium octane differs from the heuristic, add the brand there. Keys MUST match the canonical brand strings in `supabase/functions/ingest-stations/index.ts:KNOWN_BRANDS` (apostrophe-sensitive, case-sensitive).

Known overrides (as of 2026-05-18):
- `Stewart's Shops` → 91 (east-coast premium, NOT 93)

After adding a new override, redeploy via `supabase functions deploy refresh-prices refresh-station-prices`, then trigger a manual refresh to update existing stations.

## Project-specific conventions

- **Routes / tab labels:** route components live in `src/routes/`; the bottom
  user-facing labels are **Pumps** (`/`), **Atlas** (`/atlas`), **Report**
  (`/report`), **Garage** (`/garage`). When the user says "the garage tab,"
  they mean settings.
- **Octane type is 6-valued:** `86 | 87 | 89 | 91 | 93 | 94`. PRIMARY = `[87, 89, 91, 93]`. SECONDARY = `[86, 94]`. The Pumps views expose 87 / 89 / "91+ Any premium". Iterate `ALL_OCTANES` rather than hardcoding.
- **Stale-price handling:** prices >24h are muted with a `stale` chip; prices >7d are hidden (treated as null). Logic in `core/staleness.ts`.
- **Decision math:** pure function `core/decision-math.ts:annotateWithSavings(stations, octane, opts?)`. `usePumpsData` calls it; views never compute the baseline themselves.

## Theme system (Ferrari / Airtable)

Two themes ship on web — picker in the Garage tab under APPEARANCE. (Desert
was dropped from web in the re-platform; it returns with a future native app.)
`ThemeProvider` (`core/theme-provider.tsx`) tracks the active id, persists it
to localStorage, and mirrors it onto `<html data-theme>`.

**Authoring rules:**
- Design tokens are **CSS custom properties** keyed off `[data-theme]` in
  `src/styles/themes.css` (color / type / the 8px spacing ladder `--s1`..`--s8`).
  Components reference `var(--token)` — never hardcode theme colors.
- The Pumps tab is a **theme dispatcher**: Ferrari and Airtable are two
  structurally different real-CSS components (`FerrariPumps`, `AirtablePumps`)
  that share the one `usePumpsData()` hook. The design-truth source for each is
  `public/preview/ferrari.html` / `airtable.html` — port the CSS *mechanism*,
  not a frozen-width snapshot.
- Per-component CSS lives next to the component (`FerrariPumps.css`, etc.),
  imported by it. Prefix classes per component to avoid collisions.

## Backend not touched by the web app

The Supabase backend (Edge Functions, schema, RPCs, cron jobs, CRON_SECRET gating) is deployed and dogfooded on real Troy NY prices. Do not modify the backend unless explicitly asked.

## Deploy

- Web: Vercel auto-deploys on `main` push. Build command `npm run build`
  (`tsc --noEmit && vite build`), output `dist/`, `framework: "vite"` in
  `vercel.json` with an SPA fallback rewrite. `vite-plugin-pwa` generates the
  manifest + service worker (network-first for the station/price API so stale
  prices are never served from cache).
- Static assets: anything under `public/` is copied verbatim to `dist/` —
  `favicon.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, and
  the `preview/` design mockups. iOS Add-to-Home-Screen meta tags are in
  `index.html`.
- Env: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the
  `EXPO_PUBLIC_` prefix is kept so the Vercel project's existing env vars work
  unchanged — Vite's `envPrefix` is widened to accept it).
- Native (deferred): re-evaluate after the validation gate (≥10 non-household WAU × 4 weeks).
