// Vercel Function entry point. Vercel only discovers functions inside /api,
// so this (and the [...path] catch-all beside it) forward to the real
// handler in src/server.ts, which owns all routing based on req.url.
export { default } from '../src/server.js';
