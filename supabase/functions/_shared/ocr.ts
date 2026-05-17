// Server-side OCR for crowd-reported price photos.
//
// V1 ships as a stub that returns no parsed prices, leaving reports in
// 'pending' for manual review. To enable automated parsing, plug in a real
// OCR provider in `ocrImage` below (Google Cloud Vision, AWS Textract,
// Azure Computer Vision, etc.) — the parser already accepts the raw text
// and converts octane/price pairs.

export type Octane = 86 | 87 | 89 | 91 | 93 | 94;
export type ParsedPrice = { octane: Octane; price_cents: number };

const OCTANE_VALUES: Octane[] = [86, 87, 89, 91, 93, 94];
const PRICE_REGEX = /(\d{1,2})\s*[.\s]\s*(\d{2,3})\b/g;

export function parsePricesFromText(rawText: string): ParsedPrice[] {
  const lines = rawText.split(/\r?\n/);
  const candidates: { octane: Octane; price_cents: number }[] = [];

  for (const line of lines) {
    const octanesOnLine: Octane[] = [];
    for (const o of OCTANE_VALUES) {
      const re = new RegExp(`\\b${o}\\b`);
      if (re.test(line)) octanesOnLine.push(o);
    }

    const matches = [...line.matchAll(PRICE_REGEX)];
    const prices: number[] = matches
      .map((m) => {
        const dollars = parseInt(m[1], 10);
        const fractional = m[2];
        const cents =
          fractional.length === 3
            ? Math.round(parseInt(fractional, 10) / 10)
            : parseInt(fractional, 10);
        return dollars * 100 + cents;
      })
      .filter((p) => p >= 100 && p <= 1500);

    if (octanesOnLine.length === prices.length && octanesOnLine.length > 0) {
      octanesOnLine.forEach((octane, i) => {
        candidates.push({ octane, price_cents: prices[i] });
      });
      continue;
    }
    if (octanesOnLine.length === 1 && prices.length === 1) {
      candidates.push({ octane: octanesOnLine[0], price_cents: prices[0] });
    }
  }

  const seen = new Set<Octane>();
  const result: ParsedPrice[] = [];
  for (const c of candidates) {
    if (!seen.has(c.octane)) {
      seen.add(c.octane);
      result.push(c);
    }
  }
  return result;
}

// Default stub: returns empty until a provider is wired up. Reports land
// in 'pending' for human review.
//
// To enable Google Cloud Vision: set GOOGLE_VISION_API_KEY in function
// secrets, then replace this body with a fetch to
// https://vision.googleapis.com/v1/images:annotate using TEXT_DETECTION,
// and pipe the response into parsePricesFromText.
export async function ocrImage(_imageBytes: Uint8Array): Promise<ParsedPrice[]> {
  return [];
}
