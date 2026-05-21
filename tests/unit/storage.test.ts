import { afterEach, describe, expect, it } from 'vitest';

import { storage } from '@core/adapters/storage';

const realLocalStorage = window.localStorage;

afterEach(() => {
  Object.defineProperty(window, 'localStorage', {
    value: realLocalStorage,
    configurable: true,
  });
});

describe('guarded storage adapter', () => {
  it('round-trips through localStorage when it works', async () => {
    await storage.setItem('storage.ok', 'value-1');
    expect(await storage.getItem('storage.ok')).toBe('value-1');
    await storage.removeItem('storage.ok');
    expect(await storage.getItem('storage.ok')).toBeNull();
  });

  it('returns null for an unknown key', async () => {
    expect(await storage.getItem('storage.never-set')).toBeNull();
  });

  it('falls back to in-memory storage when localStorage throws', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('SecurityError: localStorage unavailable');
        },
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {
          throw new Error('SecurityError');
        },
      },
      configurable: true,
    });

    // setItem throws internally -> value lands in the memory Map.
    await storage.setItem('storage.fallback', 'mem-value');
    // getItem throws internally -> served from the memory Map.
    expect(await storage.getItem('storage.fallback')).toBe('mem-value');

    await storage.removeItem('storage.fallback');
    expect(await storage.getItem('storage.fallback')).toBeNull();
  });
});
