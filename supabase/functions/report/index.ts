import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { jsonResponse, preflight } from '../_shared/cors.ts';
import { ocrImage } from '../_shared/ocr.ts';

type Body = {
  photo_path: string;
  latitude: number;
  longitude: number;
  station_id?: string;
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

  const { photo_path, latitude, longitude, station_id } = body;
  if (
    !photo_path ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number'
  ) {
    return jsonResponse({ error: 'Bad request' }, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Resolve user from the caller's JWT (optional).
  let user_id: string | null = null;
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const { data } = await supabase.auth.getUser(token);
    user_id = data.user?.id ?? null;
  }

  // Resolve station: explicit station_id wins; otherwise snap to nearest within 200m.
  let resolved_station_id: string | null = station_id ?? null;
  if (!resolved_station_id) {
    const { data: nearest } = await supabase.rpc('nearest_station', {
      p_lat: latitude,
      p_lon: longitude,
      p_max_meters: 200,
    });
    resolved_station_id = nearest?.[0]?.id ?? null;
  }

  // Pull the uploaded photo and run OCR (stub returns []).
  let parsed_prices: { octane: number; price_cents: number }[] = [];
  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from('reports')
      .download(photo_path);
    if (!dlErr && blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      parsed_prices = await ocrImage(bytes, blob.type || 'image/jpeg');
    }
  } catch (_e) {
    // OCR is best-effort. Leave parsed_prices empty and let manual review handle it.
    parsed_prices = [];
  }

  // Insert the report row.
  const { data: report, error: insertErr } = await supabase
    .from('reports')
    .insert({
      station_id: resolved_station_id,
      user_id,
      photo_path,
      parsed_prices,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr) {
    return jsonResponse({ error: insertErr.message }, { status: 500 });
  }

  // If OCR yielded prices and a station, write them through as 'crowd' source so
  // the data is immediately useful while the report stays pending review.
  if (resolved_station_id && parsed_prices.length > 0) {
    const rows = parsed_prices.map((p) => ({
      station_id: resolved_station_id,
      octane: p.octane,
      price_cents: p.price_cents,
      source_kind: 'crowd' as const,
      created_by: user_id,
    }));
    await supabase.from('prices').insert(rows);
  }

  return jsonResponse({
    report_id: report.id,
    parsed_prices,
  });
});
