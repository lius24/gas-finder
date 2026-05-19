# gas-finder — Claude / gstack project guide

## Project

Expo Router + Supabase app for finding the cheapest higher-octane gas with authoritative pump-feed prices and net-savings decision math. Web-first PWA, native deferred behind a usage trigger.

**Design doc (source of truth for current direction):** `~/.gstack/projects/gas-finder/vnerald-main-design-20260518-080854.md`

**Deferred work:** `TODOS.md`

## Stack

- Frontend: Expo Router 6, React Native 0.81, React 19.1, react-native-web 0.21
- Backend: Supabase (Postgres + Edge Functions + Auth + Cron via `cron.schedule`)
- Data ingest: Google Places `fuelOptions` (authoritative pump-feed prices, NOT user-reported)
- Design system: Desert Refueling Station — Fraunces / Newsreader / Major Mono Display / JetBrains Mono ExtraBold on cream + oxblood + amber + ink. Tokens in `lib/theme.ts`. Never default-Vercel-shadcn-ify.

## Testing

- Framework: Vitest (`npm test`)
- v1 scope: `lib/decision-math.test.ts` + `lib/staleness.test.ts` only
- E2E (Playwright) deferred to v1.0.1 — see TODOS.md

## Web-vs-native guard pattern

Every native-only wrapper function gets `if (Platform.OS === 'web') return` as its first line. The function declares its own platform-awareness; call sites stay clean. Pattern established 2026-05-18 via `/plan-eng-review` decision ER2.

Applies to:
- `lib/notifications.ts:registerForPushAlerts` — web returns early (Web Push is v1.1+)
- Future haptics / secure-store / image-picker wrappers — same pattern

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

- **Tab labels:** route filenames in `app/(tabs)/` are technical (`index`, `map`, `upload`, `settings`); user-facing labels are **Pumps**, **Atlas**, **Report**, **Garage**. When the user says "the garage tab," they mean Settings.
- **Octane type is 6-valued:** `86 | 87 | 89 | 91 | 93 | 94`. PRIMARY = `[87, 89, 91, 93]` (always-shown chips). SECONDARY = `[86, 94]` (revealed via toggle). Iterate `ALL_OCTANES` rather than hardcoding `[87, 89, 91, 93]`.
- **Stale-price handling:** prices >24h are muted with `stale` chip; prices >7d are hidden (treated as null). Logic lives in `lib/staleness.ts`. Established 2026-05-18 via `/plan-eng-review` decision ER6.
- **Decision math:** pure function at `lib/decision-math.ts:annotateWithSavings(stations, octane, opts?)`. Parent components call it before passing stations to `StationCard`. Card never computes baseline itself. Established 2026-05-18 via `/plan-eng-review` decision ER4.

## Theme system (Desert / Ferrari / Airtable)

Three ship in v1 — picker lives in the Garage tab under APPEARANCE. Tokens flow through React context (`useTheme()` from `lib/theme-provider.tsx`), persisted in AsyncStorage. Theme definitions in `lib/theme.ts`.

**Authoring rules for any new component:**
- Import `useTheme` (and `type Theme`) from `@/lib/theme-provider` and `@/lib/theme` respectively. Never import `colors`/`fonts`/etc. as top-level constants — those still exist for backward-compat but should not be used in new code.
- Move `StyleSheet.create({...})` into a `makeStyles(theme: Theme)` function. Call it from inside the component via `const styles = useMemo(() => makeStyles(theme), [theme])`.
- Use **semantic slots** for the inverse-contrast surfaces — pump LCD panel, sign-in button, active octane chip, "GET DIRECTIONS" CTA, formula card:
  - `displaySurface` (always dark) — the background
  - `displayInk` (always bright accent) — the foreground
  - `onRust` — text/icons sitting on a `rust` (or `danger`) background
  - `onAmber` — text/icons sitting on an `amber` background
  These prevent "white on white" regressions when Ferrari binds `colors.ink` to white.

## Backend not touched in v1

The Supabase backend (Edge Functions, schema, RPCs, cron jobs, CRON_SECRET gating) is already deployed and dogfooded on real Troy NY prices. **v1 PWA work is frontend-only.** Do not modify the backend unless explicitly asked.

## Deploy

- Web: Vercel auto-deploys on `main` push. The build command is `npm run export:web` (configured in `vercel.json`), which runs `expo export --platform web` then `node scripts/inject-pwa-tags.mjs` to patch the SPA shell with PWA manifest + iOS Add-to-Home-Screen meta tags. The injector exists because `app/+html.tsx` is silently skipped when `expo.web.output` is `"single"` — patching the emitted shell is cheaper than rewiring to `"static"` per-route HTML.
- Static assets: anything under `public/` is copied verbatim to `dist/` by `expo export`. That's where `manifest.json`, `icon-192.png`, `icon-512.png`, and `apple-touch-icon.png` live. PWA icons were generated from `assets/images/icon.png` (1024×1024) via `sips` — re-run `sips -s format png -z N N assets/images/icon.png --out public/icon-N.png` if the source icon changes.
- Native (deferred): EAS Build + TestFlight + Apple Developer. Re-evaluate after validation gate (≥10 non-household WAU × 4 weeks).
