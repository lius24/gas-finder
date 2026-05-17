import type { Octane } from './types';

type ParsedPrice = { octane: Octane; price_cents: number };

const OCTANE_VALUES: Octane[] = [86, 87, 89, 91, 93, 94];

const PRICE_REGEX = /(\d{1,2})\s*[.\s]\s*(\d{2,3})\b/g;

export function parsePricesFromText(rawText: string): ParsedPrice[] {
  const lines = rawText.split(/\r?\n/);
  const candidates: { octane: Octane; price_cents: number; line: number }[] = [];

  lines.forEach((line, lineIdx) => {
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
        candidates.push({ octane, price_cents: prices[i], line: lineIdx });
      });
      return;
    }

    if (octanesOnLine.length === 1 && prices.length === 1) {
      candidates.push({ octane: octanesOnLine[0], price_cents: prices[0], line: lineIdx });
    }
  });

  const seen = new Set<Octane>();
  const result: ParsedPrice[] = [];
  for (const c of candidates) {
    if (!seen.has(c.octane)) {
      seen.add(c.octane);
      result.push({ octane: c.octane, price_cents: c.price_cents });
    }
  }
  return result;
}
