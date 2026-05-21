// places-search — server-side proxy for Google Places `searchText`.
//
// The client used to forward-geocode and autocomplete against keyless OSM
// providers (Nominatim / Photon). Those lack residential street coverage, so
// a real address like "4 Riverstone Drive, Troy, NY" returned nothing. This
// function runs the query through Google Places `searchText` instead — the
// API key (GOOGLE_PLACES_API_KEY, already used by ingest-stations) stays
// server-side and never reaches the browser bundle.
//
// `searchText` handles both partial type-ahead queries and full addresses,
// so it backs both geocode() and autocompleteAddress() in the client.
//
// verify_jwt = true — callable by any client with the project anon key, the
// same gate as nearby/station. It is billable, so the query is length-capped
// and result count is small.

import { jsonResponse, preflight } from '../_shared/cors.ts';

type Body = { query?: unknown };

type SearchTextResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  }>;
};

Deno.serve(async (req) => {
  const cors = preflight(req);
  if (cors) return cors;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < 3 || query.length > 200) {
    return jsonResponse(
      { error: 'query must be a string of 3-200 characters' },
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

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 5,
      regionCode: 'US',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return jsonResponse(
      { error: `Places API ${res.status}: ${text}` },
      { status: 502 },
    );
  }

  const json = (await res.json()) as SearchTextResponse;
  const results = (json.places ?? [])
    .map((p) => ({
      id: p.id ?? '',
      label: p.formattedAddress ?? p.displayName?.text ?? '',
      latitude: p.location?.latitude,
      longitude: p.location?.longitude,
    }))
    .filter(
      (r): r is { id: string; label: string; latitude: number; longitude: number } =>
        r.label !== '' &&
        typeof r.latitude === 'number' &&
        typeof r.longitude === 'number',
    );

  return jsonResponse(results);
});
