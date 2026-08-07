// Catch-all for every path under /api/*. See api/index.ts for why this
// file exists — Vercel needs a physical file per route shape under /api,
// and src/server.ts already does its own routing internally.
export { default } from '../src/server.js';
