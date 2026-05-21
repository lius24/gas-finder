import { afterEach, describe, expect, it, vi } from 'vitest';

import { autocompleteAddress, geocode, reverseGeocode } from '@core/adapters/geocoding';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@core/supabase', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

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
  invokeMock.mockReset();
});

describe('geocode (places-search edge function)', () => {
  it('forward-geocodes a query to coordinates', async () => {
    invokeMock.mockResolvedValue({
      data: [{ id: 'p1', label: 'Troy, NY, USA', latitude: 42.7284, longitude: -73.6918 }],
      error: null,
    });
    await expect(geocode('Troy, NY')).resolves.toEqual([
      { latitude: 42.7284, longitude: -73.6918 },
    ]);
    expect(invokeMock).toHaveBeenCalledWith('places-search', {
      body: { query: 'Troy, NY' },
    });
  });

  it('resolves a full street address that keyless OSM could not find', async () => {
    invokeMock.mockResolvedValue({
      data: [
        {
          id: 'p2',
          label: '4 Riverstone Dr, Troy, NY 12182, USA',
          latitude: 42.7841,
          longitude: -73.6615,
        },
      ],
      error: null,
    });
    await expect(geocode('4 Riverstone Drive, Troy, NY, 12182')).resolves.toEqual([
      { latitude: 42.7841, longitude: -73.6615 },
    ]);
  });

  it('returns an empty array when no place matches', async () => {
    invokeMock.mockResolvedValue({ data: [], error: null });
    await expect(geocode('asdfqwerty nowhere')).resolves.toEqual([]);
  });

  it('does not call the edge function for queries shorter than 3 chars', async () => {
    await expect(geocode('ab')).resolves.toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('throws when the edge function returns an error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Places API 502' } });
    await expect(geocode('Troy, NY')).rejects.toThrow(/502/);
  });
});

describe('autocompleteAddress (places-search edge function)', () => {
  it('returns the edge function results as suggestions', async () => {
    const suggestion = {
      id: 'p1',
      label: '125 Hoosick St, Troy, NY 12180, USA',
      latitude: 42.7361,
      longitude: -73.6711,
    };
    invokeMock.mockResolvedValue({ data: [suggestion], error: null });
    await expect(autocompleteAddress('125 Hoosick')).resolves.toEqual([suggestion]);
  });

  it('returns [] for a query shorter than 3 chars without calling the edge function', async () => {
    expect(await autocompleteAddress('ab')).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('returns [] when the edge function finds nothing', async () => {
    invokeMock.mockResolvedValue({ data: [], error: null });
    expect(await autocompleteAddress('nowhere place')).toEqual([]);
  });

  it('throws when the edge function request fails', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Places API 502' } });
    await expect(autocompleteAddress('Troy NY')).rejects.toThrow(/502/);
  });
});

describe('reverseGeocode (Nominatim)', () => {
  it('reverse-geocodes coordinates to a city/region label', async () => {
    mockFetch({ ok: true, json: { address: { city: 'Troy', state: 'New York' } } });
    await expect(reverseGeocode({ latitude: 42.7, longitude: -73.6 })).resolves.toEqual({
      city: 'Troy',
      region: 'New York',
    });
  });

  it('falls back through town/village when city is absent', async () => {
    mockFetch({ ok: true, json: { address: { village: 'Averill Park', state: 'New York' } } });
    await expect(reverseGeocode({ latitude: 42.6, longitude: -73.5 })).resolves.toEqual({
      city: 'Averill Park',
      region: 'New York',
    });
  });

  it('returns null when the reverse result has no address', async () => {
    mockFetch({ ok: true, json: {} });
    await expect(reverseGeocode({ latitude: 0, longitude: 0 })).resolves.toBeNull();
  });

  it('throws when the reverse request fails', async () => {
    mockFetch({ ok: false, status: 503 });
    await expect(reverseGeocode({ latitude: 42.7, longitude: -73.6 })).rejects.toThrow(/503/);
  });
});
