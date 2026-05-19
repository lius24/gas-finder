#!/usr/bin/env node
// Post-export injection of PWA <head> tags into dist/index.html.
//
// Why not `app/+html.tsx`: with `expo.web.output: "single"` the Expo CLI
// emits its built-in SPA shell and skips +html.tsx, which is only honored
// for `"static"` (per-route HTML) builds. Rather than switch to static
// mode (which generates HTML per dynamic route and would force a major
// rewire of auth-state + initial-fetch flow), we patch the single shell.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(here, '..', 'dist', 'index.html');

const PWA_HEAD = `
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#8B2E1B" />
  <meta name="application-name" content="Pump" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Pump" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="description" content="Authoritative premium-octane gas prices with net-savings decision math. No ads, no crowdsourcing." />
`;

const VIEWPORT_REPLACEMENT =
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />';

let html;
try {
  html = readFileSync(indexPath, 'utf8');
} catch (e) {
  console.error(`inject-pwa-tags: cannot read ${indexPath} — did expo export run?`);
  console.error(e.message);
  process.exit(1);
}

if (html.includes('rel="manifest"')) {
  console.log('inject-pwa-tags: tags already present, skipping');
  process.exit(0);
}

// 1) Widen the viewport meta so iOS PWA respects safe-areas.
html = html.replace(
  /<meta\s+name="viewport"[^>]*\/>/,
  VIEWPORT_REPLACEMENT,
);

// 2) Insert the PWA head block right before </head>.
html = html.replace('</head>', `${PWA_HEAD}</head>`);

writeFileSync(indexPath, html);
console.log('inject-pwa-tags: injected manifest + meta into dist/index.html');
