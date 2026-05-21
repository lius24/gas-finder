import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCurrentCoords, GeolocationError } from '@core/adapters/geolocation';

type PositionOk = (pos: { coords: { latitude: number; longitude: number } }) => void;
type PositionErr = (err: { code: number; PERMISSION_DENIED: number; message: string }) => void;

function stubGeolocation(
  impl: (ok: PositionOk, err: PositionErr) => void,
): void {
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: impl },
    configurable: true,
  });
}

afterEach(() => {
  vi.useRealTimers();
  // @ts-expect-error — clear the stub between tests
  delete navigator.geolocation;
});

describe('geolocation adapter', () => {
  it('resolves with coordinates on success', async () => {
    stubGeolocation((ok) => ok({ coords: { latitude: 42.7, longitude: -73.6 } }));
    await expect(getCurrentCoords()).resolves.toEqual({
      latitude: 42.7,
      longitude: -73.6,
    });
  });

  it('rejects with reason "denied" when permission is refused', async () => {
    stubGeolocation((_ok, err) =>
      err({ code: 1, PERMISSION_DENIED: 1, message: 'User denied Geolocation' }),
    );
    await expect(getCurrentCoords()).rejects.toMatchObject({
      name: 'GeolocationError',
      reason: 'denied',
    });
  });

  it('rejects with reason "timeout" after 8s of no response', async () => {
    vi.useFakeTimers();
    stubGeolocation(() => {
      /* never calls back — simulates a desktop prompt left open */
    });
    const promise = getCurrentCoords();
    const assertion = expect(promise).rejects.toMatchObject({ reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });

  it('rejects with reason "unavailable" when geolocation is missing', async () => {
    // no stub installed -> navigator.geolocation is undefined
    const err = await getCurrentCoords().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeolocationError);
    expect((err as GeolocationError).reason).toBe('unavailable');
  });
});
