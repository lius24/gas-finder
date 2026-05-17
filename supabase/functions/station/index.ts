import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { jsonResponse, preflight } from '../_shared/cors.ts';

type Body = { id: string };

Deno.serve(async (req) => {
  const cors = preflight(req);
  if (cors) return cors;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = body.id;
  if (!id || typeof id !== 'string') {
    return jsonResponse({ error: 'Missing id' }, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const [stationRes, pricesRes] = await Promise.all([
    supabase
      .from('stations')
      .select('id, brand, name, address, latitude, longitude, google_place_id')
      .eq('id', id)
      .maybeSingle(),
    supabase.rpc('latest_prices_for_station', { p_station_id: id }),
  ]);

  if (stationRes.error) {
    return jsonResponse({ error: stationRes.error.message }, { status: 500 });
  }
  if (!stationRes.data) {
    return jsonResponse({ error: 'Station not found' }, { status: 404 });
  }

  return jsonResponse({
    station: stationRes.data,
    prices: pricesRes.data ?? [],
  });
});
