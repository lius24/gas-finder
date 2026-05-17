import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { jsonResponse, preflight } from '../_shared/cors.ts';

type Body = {
  latitude: number;
  longitude: number;
  octane: 87 | 89 | 91 | 93;
  radius: number;
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

  const { latitude, longitude, octane, radius } = body;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    ![87, 89, 91, 93].includes(octane) ||
    typeof radius !== 'number' ||
    radius <= 0
  ) {
    return jsonResponse({ error: 'Bad request' }, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('nearby_stations_with_price', {
    p_lat: latitude,
    p_lon: longitude,
    p_octane: octane,
    p_radius_m: radius,
  });

  if (error) {
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse(data ?? []);
});
