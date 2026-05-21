// Server-side OCR for crowd-reported price photos.
//
// Reads a gas-station price sign with Claude vision and returns the octane
// prices it can see. Best-effort: any failure returns [] and the report row
// stays 'pending' for manual review.

import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

export type Octane = 86 | 87 | 89 | 91 | 93 | 94;
export type ParsedPrice = { octane: Octane; price_cents: number };

const OCTANE_VALUES: readonly Octane[] = [86, 87, 89, 91, 93, 94];
const MIN_PRICE_CENTS = 100;
const MAX_PRICE_CENTS = 1500;
const SUPPORTED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const PROMPT =
  'This image is a photo of a gas station price sign. Return a JSON array of ' +
  'the octane prices you can clearly read. Each element must be ' +
  '{"octane": <number>, "price_cents": <integer>} where octane is one of ' +
  '86, 87, 89, 91, 93, 94 and price_cents is the price in whole cents ' +
  '(for example $3.49 is 349). Only include an octane if its price is ' +
  'clearly visible. Output ONLY the JSON array, nothing else.';

/** Extract and validate octane/price pairs from Claude's text response. */
export function parseClaudeResponse(text: string): ParsedPrice[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const seen = new Set<Octane>();
  const result: ParsedPrice[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const octane = rec.octane;
    const price = rec.price_cents;
    if (typeof octane !== 'number' || typeof price !== 'number') continue;
    if (!OCTANE_VALUES.includes(octane as Octane)) continue;
    if (!Number.isInteger(price) || price < MIN_PRICE_CENTS || price > MAX_PRICE_CENTS) {
      continue;
    }
    if (seen.has(octane as Octane)) continue;
    seen.add(octane as Octane);
    result.push({ octane: octane as Octane, price_cents: price });
  }
  return result;
}

/** Read a price-sign photo with Claude vision. Returns [] on any failure. */
export async function ocrImage(
  imageBytes: Uint8Array,
  mediaType = 'image/jpeg',
): Promise<ParsedPrice[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return [];

  const media = SUPPORTED_MEDIA.includes(mediaType) ? mediaType : 'image/jpeg';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: media,
                  data: encodeBase64(imageBytes),
                },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const text = json?.content?.[0]?.text;
    return typeof text === 'string' ? parseClaudeResponse(text) : [];
  } catch {
    return [];
  }
}
