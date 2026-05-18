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

## Project-specific conventions

- **Tab labels:** route filenames in `app/(tabs)/` are technical (`index`, `map`, `upload`, `settings`); user-facing labels are **Pumps**, **Atlas**, **Report**, **Garage**. When the user says "the garage tab," they mean Settings.
- **Octane type is 6-valued:** `86 | 87 | 89 | 91 | 93 | 94`. PRIMARY = `[87, 89, 91, 93]` (always-shown chips). SECONDARY = `[86, 94]` (revealed via toggle). Iterate `ALL_OCTANES` rather than hardcoding `[87, 89, 91, 93]`.
- **Stale-price handling:** prices >24h are muted with `stale` chip; prices >7d are hidden (treated as null). Logic lives in `lib/staleness.ts`. Established 2026-05-18 via `/plan-eng-review` decision ER6.
- **Decision math:** pure function at `lib/decision-math.ts:annotateWithSavings(stations, octane, opts?)`. Parent components call it before passing stations to `StationCard`. Card never computes baseline itself. Established 2026-05-18 via `/plan-eng-review` decision ER4.

## Backend not touched in v1

The Supabase backend (Edge Functions, schema, RPCs, cron jobs, CRON_SECRET gating) is already deployed and dogfooded on real Troy NY prices. **v1 PWA work is frontend-only.** Do not modify the backend unless explicitly asked.

## Deploy

- Web: Vercel via `expo export --platform web` → `dist/` → Vercel auto-deploy on `main` push
- Native (deferred): EAS Build + TestFlight + Apple Developer. Re-evaluate after validation gate (≥10 non-household WAU × 4 weeks).
