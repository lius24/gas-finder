# gas-finder — setup & first run

End-to-end instructions to get the Expo client and Supabase backend running locally.

---

## 1. Prerequisites

Install once on your machine:

| Tool | Why | Install |
|---|---|---|
| Node 20+ | Expo / Metro bundler | `brew install node` (or use `nvm`) |
| Supabase CLI | Apply migrations, deploy functions | `brew install supabase/tap/supabase` |
| Expo CLI | Available via `npx`, no global install needed | — |
| Xcode (optional) | iOS dev builds + simulator | App Store |
| Android Studio (optional) | Android dev builds + emulator | https://developer.android.com/studio |
| Expo Go (optional) | Fastest way to smoke-test on a real phone | App Store / Play Store |

You only need Xcode **or** Android Studio **or** Expo Go — pick whichever path you want for the first run (see step 5).

---

## 2. Supabase project

You can either run Supabase locally (faster iteration, no internet needed) or against a hosted project.

### Option A — Hosted (recommended for first run)

1. Create a project at https://supabase.com.
2. From the dashboard, copy the **Project URL** and the **anon public** API key.
3. Link this repo:
   ```bash
   cd /Users/vnerald/gas-finder
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
4. Apply the schema and deploy edge functions:
   ```bash
   supabase db push
   supabase functions deploy nearby station report send-price-alerts
   ```
5. In the dashboard, go to **Authentication → Providers → Email** and confirm:
   - Email provider is enabled (default).
   - "Confirm email" can stay on (the OTP flow works either way), but disabling it makes first-time test sign-ins easier.
   - The default development SMTP is rate-limited to ~4 emails/hour. For production, set up custom SMTP under **Auth → SMTP Settings**.

### Option B — Local

```bash
cd /Users/vnerald/gas-finder
supabase start              # boots Postgres, Auth, Storage, Functions, Studio
supabase db reset           # applies migrations into the local DB
supabase functions serve    # runs nearby/station/report locally
```

`supabase status` prints the local URL and anon key for the next step.

---

## 3. Client `.env`

Copy the template and fill it in:

```bash
cp .env.example .env
```

Edit `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=<project URL or local URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
GOOGLE_MAPS_API_KEY=<optional — see below>
```

`GOOGLE_MAPS_API_KEY` is only needed if you want the **Map** tab to render on Android. iOS falls back to Apple Maps automatically. For a first smoke test, leave it blank.

To wire it for real later: enable "Maps SDK for iOS" and "Maps SDK for Android" in a GCP project, mint an API key (restrict it per-platform), and add it via EAS secrets for production builds.

---

## 4. Seed data

The migration creates empty tables. You'll see "No stations found" until you insert some.

Open Supabase Studio → SQL editor (hosted: dashboard; local: http://localhost:54323) and run something like:

```sql
insert into stations (brand, name, address, latitude, longitude) values
  ('Shell', 'Shell Boylston',   '100 Boylston St, Boston, MA',         42.3520, -71.0640),
  ('BP',    'BP Mass Ave',      '500 Massachusetts Ave, Cambridge, MA', 42.3580, -71.0950),
  ('Mobil', 'Mobil Storrow',    '1 Storrow Dr, Boston, MA',            42.3540, -71.0780);

-- Latest price per (station, octane). Insert one row per octane you want to test.
insert into prices (station_id, octane, price_cents, source_kind)
select id, 87, 349, 'official' from stations;

insert into prices (station_id, octane, price_cents, source_kind)
select id, 93, 419, 'official' from stations;
```

(Adjust coordinates so they land near where you'll be testing — the list filter is driven by your device's GPS and the radius selector.)

---

## 5. Run the client

```bash
npm install
```

Then choose one path.

### Path A — Expo Go (fastest)

```bash
npx expo start
```

Scan the QR code with the Expo Go app on your phone. Caveats:

- The **Map** tab on Android won't render without `GOOGLE_MAPS_API_KEY` wired into a custom dev build. iOS will use Apple Maps fine.
- Everything else (auth, list, detail, favorites, search, upload/camera) works in Expo Go.

### Path B — Native dev build

Generates `ios/` and `android/` folders and runs a full native build.

```bash
npx expo prebuild
npx expo run:ios        # needs Xcode + a simulator/device
# or
npx expo run:android    # needs Android Studio + an emulator/device
```

First build is ~5–10 minutes; subsequent reloads are instant via Metro.

---

## 6. What to verify on first run

1. **Auth** — Settings → Sign in → enter email → OTP arrives → 6-digit code lets you in.
2. **List** — pull-to-refresh, octane chips persist, sort/radius chips persist, "Cheapest" badge on the lowest-price card.
3. **Detail** — tap a card → header renders instantly from the seed; price grid populates after the `station` function returns; tap heart → check Supabase Studio's `favorites` table.
4. **Map** — markers render with price badges; recenter and refresh FABs work.
5. **Upload** — take a photo → check the `reports` storage bucket has the file and the `reports` table has a row.
6. **Address search** — type "Cambridge, MA" or a ZIP and submit → the list re-anchors.
7. **Price alerts** — open a favorited station, set an octane + threshold, then insert a `prices` row at or below it. Manually invoke `send-price-alerts` (see `supabase/README.md`) and confirm a push lands. Schedule the cron once it works.

---

## 7. Common gotchas

| Symptom | Likely cause |
|---|---|
| List spins forever | `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` not set, or edge functions not deployed. |
| `nearby` returns `[]` even with stations seeded | No matching `prices` row for the requested octane, or the station is outside the chosen radius. |
| Detail page header but blank price grid | `station` edge function not deployed. The page falls back to seed data; deploy `station` to see all 4 octanes. |
| OTP email never arrives | Default Supabase SMTP rate limit hit (~4/hour). Use a different email or wait. |
| Android map blank | No `GOOGLE_MAPS_API_KEY` wired into the native build — switch to Expo Go (iOS) or set up the key. |
| `tsc` fails inside `supabase/` | The Deno functions need to be excluded from the client tsconfig. Already set in `tsconfig.json:exclude`; if you've reset the file, re-add `"supabase"` to `exclude`. |

---

## 8. Where things live

```
/Users/vnerald/gas-finder/
├── app/                       Expo Router routes (tabs, station detail, sign-in modal)
├── components/                Shared UI (StationCard, OctaneSelector, RadiusSelector, ...)
├── lib/                       Supabase client, auth context, prefs, favorites, types, geo
├── supabase/                  Backend (this is the "starting point" — schema + edge fns)
│   ├── migrations/            SQL for tables, RLS, RPCs, storage bucket
│   ├── functions/             Deno edge functions (nearby, station, report) + _shared
│   ├── config.toml            Local Supabase CLI config
│   └── README.md              Backend-specific notes (OCR plug-in, RLS smoke tests)
├── doc/                       This folder
│   └── setup.md               You are here
├── .env.example               Template for the env vars listed above
└── package.json
```

---

## 9. Next steps after first run

Once everything boots:

- Decide on **OCR**: stays stubbed (manual review of `reports`) until you wire Google Vision in `supabase/functions/_shared/ocr.ts`. See `supabase/README.md` for the swap-in.
- **Notifications** ship out-of-the-box via the `send-price-alerts` function — set up the cron once you've smoke-tested it (see `supabase/README.md` → "Price alerts"). Push delivery requires a real Expo dev/standalone build with an EAS `projectId`; in Expo Go you can register tokens but Apple/Google won't deliver to them.
- Decide on **ingest**: scrapers / data feeds for the `prices` table are out of scope for this repo.
