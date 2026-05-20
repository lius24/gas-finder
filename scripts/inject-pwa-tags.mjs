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
  <style id="gf-responsive">
    body { overscroll-behavior-y: none; }

    /* Per-theme desktop width. The Desert theme is a phone-first layout —
       on wide screens it gets a centered 540px column with a neutral
       surround, the way it was designed. Ferrari + Airtable are full-bleed
       marketing pages (per public/preview/*.html) and manage their own
       centered max-width internally, so they opt out of the column.

       <html data-theme> is set at runtime by ThemeProvider. Before the
       persisted theme resolves there is no attribute yet; Desert is the
       default, so the bare (:not([data-theme])) state also gets the
       column to avoid a first-paint stretch. */
    @media (min-width: 800px) {
      html[data-theme="desert"],
      html[data-theme="desert"] body,
      html:not([data-theme]),
      html:not([data-theme]) body {
        background: #ECE6D7;
      }
      html[data-theme="desert"] #root,
      html:not([data-theme]) #root {
        max-width: 540px;
        margin: 0 auto;
        background: #F4EFE6;
        box-shadow: 0 0 0 1px rgba(40, 28, 16, 0.06), 0 6px 30px rgba(40, 28, 16, 0.08);
      }
    }
  </style>
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
