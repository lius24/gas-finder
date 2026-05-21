import { assertEquals } from 'jsr:@std/assert@1';

import { parseClaudeResponse } from './ocr.ts';

Deno.test('parses a clean JSON array', () => {
  assertEquals(
    parseClaudeResponse('[{"octane":87,"price_cents":349},{"octane":93,"price_cents":419}]'),
    [
      { octane: 87, price_cents: 349 },
      { octane: 93, price_cents: 419 },
    ],
  );
});

Deno.test('extracts the JSON array even with surrounding prose', () => {
  assertEquals(
    parseClaudeResponse('Here are the prices: [{"octane":89,"price_cents":379}] hope this helps'),
    [{ octane: 89, price_cents: 379 }],
  );
});

Deno.test('drops unknown octanes and drops valid octanes whose price is out of range', () => {
  assertEquals(
    parseClaudeResponse(
      '[{"octane":88,"price_cents":300},{"octane":87,"price_cents":50},{"octane":91,"price_cents":399}]',
    ),
    [{ octane: 91, price_cents: 399 }],
  );
});

Deno.test('accepts boundary octanes 86 and 94', () => {
  assertEquals(
    parseClaudeResponse('[{"octane":86,"price_cents":329},{"octane":94,"price_cents":459}]'),
    [
      { octane: 86, price_cents: 329 },
      { octane: 94, price_cents: 459 },
    ],
  );
});

Deno.test('dedupes repeated octanes, keeping the first', () => {
  assertEquals(
    parseClaudeResponse('[{"octane":87,"price_cents":349},{"octane":87,"price_cents":359}]'),
    [{ octane: 87, price_cents: 349 }],
  );
});

Deno.test('returns [] for malformed or empty input', () => {
  assertEquals(parseClaudeResponse('no json here'), []);
  assertEquals(parseClaudeResponse('[not valid json'), []);
  assertEquals(parseClaudeResponse(''), []);
});
