// Browser geolocation adapter — replaces expo-location's getCurrentPosition.
//
// Carries over the 8s timeout race from the RN hook: desktop browsers can
// leave getCurrentPosition pending forever when the user neither grants nor
// denies the permission prompt. The adapter rejects with a tagged reason so
// callers can show the right message (permission vs timeout vs unavailable).

export type Coords = { latitude: number; longitude: number };

export type GeolocationFailure = 'denied' | 'timeout' | 'unavailable';

export class GeolocationError extends Error {
  reason: GeolocationFailure;
  constructor(reason: GeolocationFailure, message: string) {
    super(message);
    this.name = 'GeolocationError';
    this.reason = reason;
  }
}

const TIMEOUT_MS = 8000;

export function getCurrentCoords(): Promise<Coords> {
  return new Promise<Coords>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocationError('unavailable', 'Geolocation not supported'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new GeolocationError('timeout', 'Location request timed out'));
    }, TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const reason: GeolocationFailure =
          err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
        reject(new GeolocationError(reason, err.message));
      },
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}
