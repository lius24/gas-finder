// Guarded localStorage adapter (eng-review decision D4).
//
// Every localStorage call is wrapped in try/catch with an in-memory Map
// fallback. localStorage throws in Safari private browsing and when the
// quota is full — without the guard those throws crash the app on launch
// (the Supabase auth client reads storage synchronously during init).
// With the guard the app degrades to no-persistence instead of white-screen.
//
// The public surface is async (Promise-returning) so it is a drop-in for
// the AsyncStorage API that core/ used under React Native — supabase-js
// accepts an async storage adapter, and core/preferences.ts already awaits.

const memory = new Map<string, string>();

function rawGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function rawSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

function rawRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    memory.delete(key);
  }
}

export const storage = {
  getItem(key: string): Promise<string | null> {
    return Promise.resolve(rawGet(key));
  },
  setItem(key: string, value: string): Promise<void> {
    rawSet(key, value);
    return Promise.resolve();
  },
  removeItem(key: string): Promise<void> {
    rawRemove(key);
    return Promise.resolve();
  },
};
