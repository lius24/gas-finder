import { defineConfig } from 'vitest/config';

// Pure-function test runner for `lib/*.test.ts` only. Intentionally narrow:
// the React Native / Expo Router code paths require their own jest-expo
// harness and are out of scope. Decision math + staleness are *pure*
// modules with no RN imports, so a plain vite/jsdom-free vitest config is
// enough — and keeps the dev-dep footprint to a single package.
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
