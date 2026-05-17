// ingest-stations
//
// Pulls gas stations from Google Places "Nearby Search (New)" API and upserts
// them into the `stations` table by `google_place_id`. Use to bootstrap a
// region's data so the app actually has stations to query.
//
// Auth: service-role only (verify_jwt = false in config.toml). Don't expose
// to clients — Google Places API calls cost money.
//
// Required secret:
//   supabase secrets set GOOGLE_PLACES_API_KEY=...
//
// Invoke (covers a 5km circle around downtown Sedona):
//   curl -X POST <project>/functions/v1/ingest-stations \
//     -H "Authorization: Bearer <service-role-key>" \
//     -H "Content-Type: application/json" \
//     -d '{"latitude":34.8697,"longitude":-111.7610,"radius_m":5000}'
//
// Limits: Google's circle radius is capped at 50km, max 20 results per call.
// To cover a wider region, call this multiple times with overlapping centers.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { jsonResponse, preflight } from '../_shared/cors.ts';

type Body = {
  latitude: number;
  longitude: number;
  radius_m: number;
};

type PlacesNearbyResponse = {
  places?: {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    shortFormattedAddress?: string;
    location?: { latitude: number; longitude: number };
  }[];
  error?: { message?: string };
};

// Common US gas brands. If a station's Google displayName starts with or
// contains one of these (case-insensitive), it becomes the `brand`. Order
// matters — longer / more specific brands first to avoid e.g. "76" matching
// inside "Shell 76".
const KNOWN_BRANDS = [
  'Phillips 66',
  'Circle K',
  'Costco Gas',
  'Buc-ee',
  'QuikTrip',
  'Flying J',
  'Sam\'s Club',
  'Speedway',
  'Maverik',
  'Marathon',
  'Sinclair',
  'Sunoco',
  'Chevron',
  'Conoco',
  'Texaco',
  'Valero',
  'Safeway',
  'Kroger',
  'Sheetz',
  'Citgo',
  'Mobil',
  'Pilot',
  'Loves',
  'Shell',
  'Exxon',
  'Arco',
  'Wawa',
  'BP',
  '76',
];

function normalize(s: string): string {
  // Strip apostrophes/punctuation so "Love's" matches "Loves" etc.
  return s.toLowerCase().replace(/['’.]/g, '');
}

function detectBrand(displayName: string): string | null {
  const norm = normalize(displayName);
  for (const brand of KNOWN_BRANDS) {
    if (norm.includes(normalize(brand))) return brand;
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = preflight(req);
  if (cors) return cors;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { latitude, longitude, radius_m } = body;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    typeof radius_m !== 'number' ||
    radius_m <= 0 ||
    radius_m > 50000
  ) {
    return jsonResponse(
      { error: 'Bad request: need latitude, longitude, radius_m (1-50000)' },
      { status: 400 },
    );
  }

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) {
    return jsonResponse(
      { error: 'GOOGLE_PLACES_API_KEY secret not set on this project' },
      { status: 500 },
    );
  }

  const placesRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location',
    },
    body: JSON.stringify({
      includedTypes: ['gas_station'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: radius_m,
        },
      },
    }),
  });

  if (!placesRes.ok) {
    const text = await placesRes.text();
    return jsonResponse(
      { error: `Places API ${placesRes.status}: ${text}` },
      { status: 502 },
    );
  }

  const placesJson = (await placesRes.json()) as PlacesNearbyResponse;
  const places = placesJson.places ?? [];

  if (places.length === 0) {
    return jsonResponse({ found: 0, upserted: 0 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const rows = places
    .filter((p) => p.id && p.location && p.displayName?.text && p.formattedAddress)
    .map((p) => {
      const name = p.displayName!.text!;
      return {
        google_place_id: p.id,
        name,
        brand: detectBrand(name),
        address: p.formattedAddress!,
        latitude: p.location!.latitude,
        longitude: p.location!.longitude,
      };
    });

  const { data, error } = await supabase
    .from('stations')
    .upsert(rows, { onConflict: 'google_place_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse({
    found: places.length,
    upserted: data?.length ?? 0,
    sample: rows.slice(0, 3).map((r) => ({ name: r.name, brand: r.brand })),
  });
});
