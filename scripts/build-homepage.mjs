#!/usr/bin/env node
// Post-`vite build` step. On Cloudflare Pages static files win over _redirects,
// so to serve the standalone marketing page at exactly "/" we:
//   1. rename the built SPA entry  dist/public/index.html -> dist/public/app.html
//   2. install the marketing page  D3FinanceDocuments/index.html -> dist/public/index.html
//   3. point the SPA fallback at /app.html so /portal, /union, /ai, ... still work
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'dist', 'public');
const spa = join(OUT, 'index.html');
const app = join(OUT, 'app.html');
const marketing = join(ROOT, 'D3FinanceDocuments', 'index.html');

if (!existsSync(spa)) throw new Error(`Missing ${spa} — run "vite build" first`);
if (!existsSync(marketing)) throw new Error(`Missing marketing page ${marketing}`);

renameSync(spa, app);                                   // SPA entry -> app.html
writeFileSync(spa, readFileSync(marketing, 'utf8'));    // marketing -> index.html (site root)
writeFileSync(join(OUT, '_redirects'), '/*    /app.html   200\n'); // SPA fallback

console.log('homepage: index.html = marketing page, app.html = SPA, fallback -> /app.html');
