import { createClient } from '@supabase/supabase-js';

import { storage } from './adapters/storage';

// Env keys keep the EXPO_PUBLIC_ prefix so the Vercel project's existing
// environment variables work unchanged across the cutover — Vite's
// envPrefix (vite.config.ts) is widened to include EXPO_PUBLIC_.
const url = import.meta.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in environment',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    // Web OAuth (Google) returns the session in a URL fragment that
    // supabase-js must parse on the redirect landing — false here would
    // silently drop the session after a successful Google sign-in.
    detectSessionInUrl: true,
  },
});
