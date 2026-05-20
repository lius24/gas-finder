/// <reference types="vitest/config" />
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'gas-finder — premium fuel finder',
        short_name: 'Pump',
        description:
          'Authoritative premium-octane gas prices with net-savings decision math. No ads, no crowdsourcing.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#181818',
        theme_color: '#181818',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        categories: ['travel', 'navigation', 'utilities'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Station + price API: never serve stale prices from cache —
            // network-first with an 8s ceiling, cache only as offline fallback.
            urlPattern: ({ url }) => url.pathname.includes('/functions/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gas-finder-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // EXPO_PUBLIC_ kept alongside VITE_ so the Vercel project's existing env
  // vars (EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY) work unchanged after cutover.
  envPrefix: ['VITE_', 'EXPO_PUBLIC_'],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@core': path.resolve(import.meta.dirname, 'core'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['core/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
  },
});
