import { afterEach, describe, expect, it, vi } from 'vitest';

import { autocompleteAddress, geocode, reverseGeocode } from '@core/adapters/geocoding';

function mockFetch(response: { ok: boolean; status?: number; json?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.json,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geocoding adapter (Nominatim)', () => {
  it('forward-geocodes a query to coordinates', async () => {
    mockFetch({ ok: true, json: [{ lat: '42.7284', lon: '-73.6918' }] });
    await expect(geocode('Troy, NY')).resolves.toEqual([
      { latitude: 42.7284, longitude: -73.6918 },
    ]);
  });

  it('returns an empty array when no place matches', async () => {
    mockFetch({ ok: true, json: [] });
    await expect(geocode('asdfqwerty nowhere')).resolves.toEqual([]);
  });

  it('throws when the geocoding request fails', async () => {
    mockFetch({ ok: false, status: 503 });
    await expect(geocode('Troy, NY')).rejects.toThrow(/503/);
  });

  it('reverse-geocodes coordinates to a city/region label', async () => {
    mockFetch({
      ok: true,
      json: { address: { city: 'Troy', state: 'New York' } },
    });
    await expect(
      reverseGeocode({ latitude: 42.7, longitude: -73.6 }),
    ).resolves.toEqual({ city: 'Troy', region: 'New York' });
  });

  it('falls back through town/village when city is absent', async () => {
    mockFetch({
      ok: true,
      json: { address: { village: 'Averill Park', state: 'New York' } },
    });
    await expect(
      reverseGeocode({ latitude: 42.6, longitude: -73.5 }),
    ).resolves.toEqual({ city: 'Averill Park', region: 'New York' });
  });

  it('returns null when the reverse result has no address', async () => {
    mockFetch({ ok: true, json: {} });
    await expect(
      reverseGeocode({ latitude: 0, longitude: 0 }),
    ).resolves.toBeNull();
  });
});

describe('autocompleteAddress (Photon)', () => {
  it('parses Photon features into address suggestions', async () => {
    mockFetch({
      ok: true,
      json: {
        features: [
          {
            geometry: { coordinates: [-73.6918, 42.7284] },
            properties: {
              osm_type: 'W',
              osm_id: 123,
              housenumber: '125',
              street: 'Hoosick St',
              city: 'Troy',
              state: 'New York',
            },
          },
        ],
      },
    });
    const out = await autocompleteAddress('125 Hoosick');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      label: '125 Hoosick St, Troy, New York',
      latitude: 42.7284,
      longitude: -73.6918,
    });
    expect(typeof out[0].id).toBe('string');
    expect(out[0].id.length).toBeGreaterThan(0);
  });

  it('returns [] for a query shorter than 3 chars without fetching', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await autocompleteAddress('ab')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns [] when Photon returns no features', async () => {
    mockFetch({ ok: true, json: { features: [] } });
    expect(await autocompleteAddress('nowhere place')).toEqual([]);
  });

  it('throws when the Photon request fails', async () => {
    mockFetch({ ok: false, status: 502 });
    await expect(autocompleteAddress('Troy NY')).rejects.toThrow(/502/);
  });
});
