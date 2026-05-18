export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

// Shared header check for `verify_jwt = false` workers. The Functions gateway
// only verifies a project-key bearer is present, so anyone with the public
// publishable/anon key (which ships in the mobile app bundle) could otherwise
// invoke billable workers like refresh-prices or ingest-stations. The CRON_SECRET
// header closes that gap.
//
// Set on the project once:  supabase secrets set CRON_SECRET=<hex>
// Cron jobs and curl smoke-tests send:  x-cron-secret: <hex>
export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected) {
    return jsonResponse(
      { error: 'CRON_SECRET is not configured on the project' },
      { status: 500 },
    );
  }
  const provided = req.headers.get('x-cron-secret');
  if (provided !== expected) {
    return jsonResponse({ error: 'forbidden' }, { status: 401 });
  }
  return null;
}
