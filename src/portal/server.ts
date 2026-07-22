// GovReady Lab Portal — secure web front-end for the Phase 1 engine.
//
//   npm run portal          → http://localhost:4173
//
// Features:
//   · First-launch admin setup, then username/passphrase login
//   · Mandatory TOTP two-factor auth (QR enrollment for authenticator apps)
//   · Branded dashboard listing generated Contract Maps (served behind auth)
//   · Claude lab assistant (Anthropic SDK, streaming) — set ANTHROPIC_API_KEY
//
// Env: PORT (default 4173), GOVREADY_DATA_DIR (default .govready),
//      GOVREADY_OUT_DIR (default out), ANTHROPIC_API_KEY.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import QRCode from 'qrcode';
import { Store } from './store.js';
import { generateSecret, otpauthUrl, verifyTotp } from './totp.js';
import { claudeConfigured, streamChat, type ChatTurn } from './claude.js';
import { loginPage, portalPage, setupPage, twofaSetupPage, twofaVerifyPage, type ReportEntry, type PortalStats } from './pages.js';

const PORT = Number(process.env.PORT ?? 4173);
const DATA_DIR = process.env.GOVREADY_DATA_DIR ?? '.govready';
const OUT_DIR = process.env.GOVREADY_OUT_DIR ?? 'out';

const store = new Store(DATA_DIR);

// ---------- small http helpers ----------

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSession(res: ServerResponse, token: string): void {
  res.setHeader('Set-Cookie', `gr_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
}

function clearSession(res: ServerResponse): void {
  res.setHeader('Set-Cookie', 'gr_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

async function readBody(req: IncomingMessage, limit = 256 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('payload too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

function html(res: ServerResponse, content: string, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(content);
}

function json(res: ServerResponse, payload: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(payload));
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { Location: to });
  res.end();
}

function clientKey(req: IncomingMessage, username: string): string {
  return `${req.socket.remoteAddress ?? '?'}:${username.toLowerCase()}`;
}

// ---------- report listing for the dashboard ----------

function listReports(): ReportEntry[] {
  if (!existsSync(OUT_DIR)) return [];
  const entries: ReportEntry[] = [];
  for (const name of readdirSync(OUT_DIR)) {
    const dir = join(OUT_DIR, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
      const dash = readdirSync(dir).find((f) => f.endsWith('.html'));
      entries.push({
        name,
        mtime: statSync(dir).mtime.toISOString().slice(0, 16).replace('T', ' '),
        hasDashboard: Boolean(dash),
        dashboardFile: dash,
      });
    } catch {
      /* skip unreadable entries */
    }
  }
  return entries.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

function latestStats(): PortalStats | null {
  let newest: { path: string; mtime: number } | null = null;
  if (!existsSync(OUT_DIR)) return null;
  for (const name of readdirSync(OUT_DIR)) {
    const p = join(OUT_DIR, name, 'report.json');
    if (existsSync(p)) {
      const mtime = statSync(p).mtimeMs;
      if (!newest || mtime > newest.mtime) newest = { path: p, mtime };
    }
  }
  if (!newest) return null;
  try {
    const r = JSON.parse(readFileSync(newest.path, 'utf8'));
    return {
      readinessPct: r.stats?.readinessPct,
      pursue: r.stats?.pursue,
      inLane: r.stats?.inLane,
      urgent: r.stats?.urgent,
      company: r.intake?.company,
    };
  } catch {
    return null;
  }
}

// ---------- router ----------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const session = store.getSession(cookies(req).gr_session);
    const fullAuth = session?.stage === 'full';

    // -- first-launch setup --
    if (!store.hasUsers()) {
      if (path === '/api/auth/happy') {
        return json(res, { error: 'Portal is not initialized. Create the first operator account at /setup.' }, 412);
      }
      if (path === '/setup' && method === 'POST') {
        const f = parseForm(await readBody(req));
        const username = (f.username ?? '').trim();
        if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username))
          return html(res, setupPage('Operator ID must be 3–32 chars: letters, digits, . _ -'), 400);
        if ((f.password ?? '').length < 10) return html(res, setupPage('Passphrase must be at least 10 characters.'), 400);
        if (f.password !== f.password2) return html(res, setupPage('Passphrases do not match.'), 400);
        store.createUser(username, f.password);
        // Straight into 2FA enrollment with a password-stage session.
        const s = store.createSession(username, 'password');
        setSession(res, s.token);
        return redirect(res, '/2fa/enroll');
      }
      return html(res, setupPage());
    }

    // -- auth flow --
    if (path === '/api/auth/happy' && method === 'POST') {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(await readBody(req, 64 * 1024)) as Record<string, unknown>;
      } catch {
        return json(res, { error: 'Body must be valid JSON.' }, 400);
      }

      const username = String(body.username ?? '').trim();
      const password = String(body.password ?? '');
      const code = String(body.code ?? '').trim();

      if (!username || !password || !code) {
        return json(res, { error: 'username, password, and code are required.' }, 400);
      }

      const key = clientKey(req, username);
      if (store.throttled(key)) {
        return json(res, { error: 'Too many attempts. Try again in 15 minutes.' }, 429);
      }

      if (!store.verifyPassword(username, password)) {
        store.recordFailure(key);
        return json(res, { error: 'Invalid credentials.' }, 401);
      }

      const user = store.getUser(username);
      if (!user) {
        store.recordFailure(key);
        return json(res, { error: 'Invalid credentials.' }, 401);
      }

      if (!user.totpEnabled || !user.totpSecret) {
        return json(res, { error: '2FA is not enrolled for this user. Sign in via portal setup first.' }, 412);
      }

      if (!verifyTotp(user.totpSecret, code)) {
        store.recordFailure(key);
        return json(res, { error: 'Invalid code.' }, 401);
      }

      store.clearFailures(key);
      const s = store.createSession(username, 'full');
      setSession(res, s.token);
      return json(res, { ok: true, username, stage: 'full' });
    }

    if (path === '/login') {
      if (method === 'POST') {
        const f = parseForm(await readBody(req));
        const username = (f.username ?? '').trim();
        const key = clientKey(req, username);
        if (store.throttled(key))
          return html(res, loginPage('Too many attempts. Try again in 15 minutes.'), 429);
        if (!store.verifyPassword(username, f.password ?? '')) {
          store.recordFailure(key);
          return html(res, loginPage('Invalid credentials.'), 401);
        }
        store.clearFailures(key);
        const s = store.createSession(username, 'password');
        setSession(res, s.token);
        const user = store.getUser(username);
        return redirect(res, user?.totpEnabled ? '/2fa' : '/2fa/enroll');
      }
      if (fullAuth) return redirect(res, '/');
      return html(res, loginPage());
    }

    if (path === '/logout') {
      store.destroySession(cookies(req).gr_session);
      clearSession(res);
      return redirect(res, '/login');
    }

    // 2FA enrollment (needs at least a password-stage session)
    if (path === '/2fa/enroll') {
      if (!session) return redirect(res, '/login');
      const user = store.getUser(session.username);
      if (!user) return redirect(res, '/login');
      if (method === 'POST') {
        const f = parseForm(await readBody(req));
        if (user.totpSecret && verifyTotp(user.totpSecret, f.code ?? '')) {
          store.enableTotp(user.username);
          const s = store.elevate(session.token);
          if (s) setSession(res, s.token);
          return redirect(res, '/');
        }
        const qr = await QRCode.toDataURL(otpauthUrl(user.totpSecret ?? '', user.username), { margin: 1, width: 360 });
        return html(res, twofaSetupPage(qr, user.totpSecret ?? '', 'Code didn’t match — scan and try again.'), 401);
      }
      if (!user.totpSecret || !user.totpEnabled) {
        if (!user.totpSecret) store.setTotpSecret(user.username, generateSecret());
        const secret = store.getUser(user.username)!.totpSecret!;
        const qr = await QRCode.toDataURL(otpauthUrl(secret, user.username), { margin: 1, width: 360 });
        return html(res, twofaSetupPage(qr, secret));
      }
      return redirect(res, '/2fa');
    }

    // 2FA verification for enrolled users (the form posts to /2fa/verify)
    if (path === '/2fa' || path === '/2fa/verify') {
      if (!session) return redirect(res, '/login');
      const user = store.getUser(session.username);
      if (!user?.totpEnabled) return redirect(res, '/2fa/enroll');
      if (method === 'POST') {
        const key = clientKey(req, session.username);
        if (store.throttled(key)) return html(res, twofaVerifyPage('Too many attempts. Try again in 15 minutes.'), 429);
        const f = parseForm(await readBody(req));
        if (verifyTotp(user.totpSecret!, f.code ?? '')) {
          store.clearFailures(key);
          const s = store.elevate(session.token);
          if (s) setSession(res, s.token);
          return redirect(res, '/');
        }
        store.recordFailure(key);
        return html(res, twofaVerifyPage('Invalid code.'), 401);
      }
      return html(res, twofaVerifyPage());
    }

    // ---- everything below requires a full (password + TOTP) session ----
    if (!fullAuth) return redirect(res, '/login');

    if (path === '/' || path === '/portal') {
      return html(
        res,
        portalPage({
          username: session!.username,
          claudeReady: claudeConfigured(),
          reports: listReports(),
          stats: latestStats(),
        }),
      );
    }

    // Serve generated client dashboards from the out/ directory.
    if (path.startsWith('/reports/')) {
      const rel = decodeURIComponent(path.slice('/reports/'.length));
      const base = resolve(OUT_DIR);
      const target = resolve(base, rel);
      if (!target.startsWith(base + sep) || !existsSync(target) || !statSync(target).isFile()) {
        return html(res, '<h1>Not found</h1>', 404);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      return res.end(readFileSync(target));
    }

    // Claude connector
    if (path === '/api/claude/chat' && method === 'POST') {
      if (!claudeConfigured()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }));
      }
      let turns: ChatTurn[];
      try {
        const parsed = JSON.parse(await readBody(req, 1024 * 1024));
        turns = (parsed.messages ?? []).filter(
          (m: ChatTurn) =>
            (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0,
        );
        if (!turns.length || turns[turns.length - 1].role !== 'user') throw new Error('bad messages');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Body must be { messages: [{role, content}...] } ending with a user turn.' }));
      }
      return streamChat(res, turns.slice(-40), OUT_DIR);
    }

    return html(res, '<h1 style="font-family:sans-serif">404</h1>', 404);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) html(res, '<h1 style="font-family:sans-serif">500 — internal error</h1>', 500);
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\n  Hutchrok GovReady Lab Portal`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  data dir: ${resolve(DATA_DIR)} · reports: ${resolve(OUT_DIR)}`);
  console.log(`  Claude connector: ${claudeConfigured() ? 'configured ✓' : 'set ANTHROPIC_API_KEY to enable'}\n`);
});
