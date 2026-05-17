// send-price-alerts
//
// Cron-triggered worker that scans for favorites whose latest tracked price
// has dropped to or below the user's threshold, then pushes an Expo notification
// to each of that user's registered devices and writes a dedupe row so the
// same (user, station, octane, price) doesn't fire twice.
//
// Trigger this on a schedule (every 5–15 minutes is a sensible default). See
// `supabase/README.md` for the pg_cron snippet.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { jsonResponse, preflight } from '../_shared/cors.ts';

type PendingAlertRow = {
  user_id: string;
  station_id: string;
  station_name: string;
  station_brand: string | null;
  octane: number;
  price_cents: number;
  threshold_cents: number;
  observed_at: string;
};

type DeviceTokenRow = {
  user_id: string;
  expo_push_token: string;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: 'default';
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
};

type ExpoTicketResult = {
  data?: { status: 'ok' | 'error'; id?: string; message?: string; details?: unknown }[];
  errors?: { message: string }[];
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildMessage(row: PendingAlertRow, token: string): ExpoMessage {
  const where = row.station_brand ?? row.station_name;
  return {
    to: token,
    title: `${row.octane} dropped to ${formatPrice(row.price_cents)}`,
    body: `${where} is at or below your ${formatPrice(row.threshold_cents)} alert.`,
    data: {
      type: 'price-alert',
      station_id: row.station_id,
      octane: row.octane,
      price_cents: row.price_cents,
    },
    sound: 'default',
    channelId: 'price-alerts',
    priority: 'high',
  };
}

async function sendBatch(messages: ExpoMessage[]): Promise<ExpoTicketResult> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    return { errors: [{ message: `Expo push HTTP ${res.status}` }] };
  }
  return (await res.json()) as ExpoTicketResult;
}

Deno.serve(async (req) => {
  const cors = preflight(req);
  if (cors) return cors;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: pending, error: pendingErr } = await supabase
    .rpc('pending_price_alerts')
    .returns<PendingAlertRow[]>();

  if (pendingErr) {
    return jsonResponse({ error: pendingErr.message }, { status: 500 });
  }

  const rows = pending ?? [];
  if (rows.length === 0) {
    return jsonResponse({ scanned: 0, sent: 0, deduped: 0 });
  }

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('user_id, expo_push_token')
    .in('user_id', userIds);

  const tokensByUser = new Map<string, string[]>();
  for (const t of (tokens as DeviceTokenRow[] | null) ?? []) {
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push(t.expo_push_token);
    tokensByUser.set(t.user_id, list);
  }

  let sent = 0;
  let deduped = 0;
  const messages: ExpoMessage[] = [];
  const invalidTokens = new Set<string>();

  for (const row of rows) {
    // Win the dedupe race before queuing pushes — if another worker already
    // marked this (user, station, octane, price), skip silently.
    const { data: won, error: dedupeErr } = await supabase.rpc('mark_price_alert_sent', {
      p_user_id: row.user_id,
      p_station_id: row.station_id,
      p_octane: row.octane,
      p_price_cents: row.price_cents,
    });
    if (dedupeErr) continue;
    if (won !== true) {
      deduped += 1;
      continue;
    }

    const userTokens = tokensByUser.get(row.user_id) ?? [];
    if (userTokens.length === 0) continue;
    for (const token of userTokens) {
      messages.push(buildMessage(row, token));
    }
  }

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    const result = await sendBatch(batch);
    const tickets = result.data ?? [];
    tickets.forEach((ticket, j) => {
      if (ticket.status === 'ok') {
        sent += 1;
      } else if (ticket.message?.includes('DeviceNotRegistered')) {
        invalidTokens.add(batch[j].to);
      }
    });
  }

  if (invalidTokens.size > 0) {
    await supabase
      .from('device_tokens')
      .delete()
      .in('expo_push_token', Array.from(invalidTokens));
  }

  return jsonResponse({
    scanned: rows.length,
    sent,
    deduped,
    invalidated: invalidTokens.size,
  });
});
