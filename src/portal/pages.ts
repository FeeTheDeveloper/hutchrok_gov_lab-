// Portal UI — server-rendered pages in the Hutchrok Solutions Group brand
// palette (navy / gold / green from the company logo), styled as a futuristic
// command-console: dark navy field, glass panels, gold circuitry accents,
// green "go" signals.

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Simplified Hutchrok shield mark as inline SVG (navy shield, gold trim + star, green growth arrow). */
const LOGO_SVG = `<svg viewBox="0 0 64 72" width="40" height="45" aria-hidden="true">
  <path d="M32 4 L58 12 V38 C58 54 46 64 32 69 C18 64 6 54 6 38 V12 Z" fill="#13294e" stroke="#c9a227" stroke-width="3"/>
  <path d="M32 0 l3.1 6.3 7 1 -5 4.9 1.2 6.9 -6.3-3.3 -6.3 3.3 1.2-6.9 -5-4.9 7-1 Z" fill="#c9a227" transform="translate(0,3) scale(0.62) translate(19,2)"/>
  <path d="M16 46 L27 34 L34 40 L48 24" fill="none" stroke="#57b26a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M40 23 L49 22 L48 31" fill="none" stroke="#57b26a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const BASE_CSS = `
  :root {
    --navy-deep: #070f22; --navy: #0d1b38; --navy-panel: rgba(19, 41, 78, 0.55);
    --navy-line: #1e3a6d; --gold: #c9a227; --gold-bright: #e8c34d;
    --green: #3a7d44; --green-bright: #57b26a; --ink: #eaf0fa; --ink-dim: #93a5c4;
    --danger: #e05252;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Rajdhani', 'Segoe UI', system-ui, sans-serif;
    background: var(--navy-deep); color: var(--ink); min-height: 100vh;
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -10%, rgba(201,162,39,0.10), transparent),
      radial-gradient(ellipse 60% 40% at 85% 110%, rgba(87,178,106,0.08), transparent),
      linear-gradient(rgba(30,58,109,0.12) 1px, transparent 1px),
      linear-gradient(90deg, rgba(30,58,109,0.12) 1px, transparent 1px);
    background-size: auto, auto, 44px 44px, 44px 44px;
  }
  h1, h2, h3, .display { font-family: 'Orbitron', 'Rajdhani', sans-serif; letter-spacing: 0.08em; }
  a { color: var(--gold-bright); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .panel {
    background: var(--navy-panel); border: 1px solid var(--navy-line); border-radius: 14px;
    backdrop-filter: blur(10px); box-shadow: 0 0 40px rgba(7,15,34,0.6), inset 0 1px 0 rgba(255,255,255,0.04);
    position: relative; overflow: hidden;
  }
  .panel::before {
    content: ''; position: absolute; top: 0; left: 8%; right: 8%; height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold), transparent); opacity: 0.7;
  }
  .btn {
    display: inline-block; font-family: 'Orbitron', sans-serif; font-size: 13px; letter-spacing: 0.12em;
    text-transform: uppercase; color: #0a1633; background: linear-gradient(180deg, var(--gold-bright), var(--gold));
    border: none; border-radius: 8px; padding: 12px 22px; cursor: pointer; font-weight: 700;
    box-shadow: 0 0 18px rgba(201,162,39,0.35); transition: box-shadow .2s, transform .1s;
  }
  .btn:hover { box-shadow: 0 0 28px rgba(232,195,77,0.55); transform: translateY(-1px); }
  .btn.green { background: linear-gradient(180deg, var(--green-bright), var(--green)); color: #06130a;
    box-shadow: 0 0 18px rgba(87,178,106,0.35); }
  .btn.ghost { background: transparent; color: var(--ink-dim); border: 1px solid var(--navy-line); box-shadow: none; }
  input[type=text], input[type=password] {
    width: 100%; background: rgba(7,15,34,0.7); border: 1px solid var(--navy-line); border-radius: 8px;
    color: var(--ink); font-family: inherit; font-size: 16px; padding: 12px 14px; outline: none;
    transition: border-color .2s, box-shadow .2s;
  }
  input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(201,162,39,0.18); }
  label { display: block; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--ink-dim); margin: 16px 0 6px; }
  .error { color: var(--danger); font-size: 14px; margin-top: 12px; border: 1px solid rgba(224,82,82,0.4);
    background: rgba(224,82,82,0.08); border-radius: 8px; padding: 10px 12px; }
  .tag { font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--gold-bright);
    border: 1px solid rgba(201,162,39,0.45); border-radius: 99px; padding: 3px 12px; }
  .muted { color: var(--ink-dim); }
`;

function page(title: string, body: string, extraCss = '', extraJs = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} · Hutchrok GovReady Lab</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_CSS}${extraCss}</style>
</head>
<body>
${body}
${extraJs ? `<script>${extraJs}</script>` : ''}
</body>
</html>`;
}

const AUTH_CSS = `
  .auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .auth-card { width: 100%; max-width: 420px; padding: 40px 36px 32px; text-align: center; }
  .auth-card .brand { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 6px; }
  .auth-card h1 { font-size: 20px; font-weight: 700; color: var(--ink); }
  .auth-card h1 .accent { color: var(--gold-bright); }
  .auth-card .sub { font-size: 13px; color: var(--ink-dim); letter-spacing: 0.1em; text-transform: uppercase; margin: 4px 0 22px; }
  .auth-card form { text-align: left; }
  .auth-card .btn { width: 100%; margin-top: 24px; }
  .code-input { font-family: 'Orbitron', monospace !important; font-size: 26px !important; letter-spacing: 0.5em;
    text-align: center; }
  .qr-box { background: #fff; border-radius: 12px; padding: 12px; display: inline-block; margin: 14px 0 6px;
    box-shadow: 0 0 30px rgba(201,162,39,0.25); }
  .secret { font-family: monospace; font-size: 13px; color: var(--green-bright); word-break: break-all;
    background: rgba(7,15,34,0.7); border: 1px dashed var(--navy-line); border-radius: 8px; padding: 10px; margin-top: 8px; }
  .foot { margin-top: 26px; font-size: 11px; color: var(--ink-dim); letter-spacing: 0.06em; }
`;

function authShell(inner: string): string {
  return `<div class="auth-wrap"><div class="panel auth-card">
    <div class="brand">${LOGO_SVG}<h1>HUTCHROK<span class="accent"> // </span>GOVREADY LAB</h1></div>
    <div class="sub">Secure Client Portal</div>
    ${inner}
    <div class="foot">Hutchrok Solutions Group LLC · Veteran-Focused Business Enablement</div>
  </div></div>`;
}

export function loginPage(error?: string): string {
  return page('Sign in', authShell(`
    <form method="POST" action="/login">
      <label for="u">Operator ID</label>
      <input type="text" id="u" name="username" autocomplete="username" required autofocus>
      <label for="p">Passphrase</label>
      <input type="password" id="p" name="password" autocomplete="current-password" required>
      ${error ? `<div class="error">${esc(error)}</div>` : ''}
      <button class="btn" type="submit">Authenticate →</button>
    </form>`), AUTH_CSS);
}

export function setupPage(error?: string): string {
  return page('Initialize portal', authShell(`
    <p class="muted" style="font-size:14px;margin-bottom:4px">First launch — create the administrator account.
    Two-factor authentication will be enrolled next.</p>
    <form method="POST" action="/setup">
      <label for="u">Operator ID</label>
      <input type="text" id="u" name="username" autocomplete="username" required autofocus>
      <label for="p">Passphrase <span style="text-transform:none;letter-spacing:0">(min 10 characters)</span></label>
      <input type="password" id="p" name="password" autocomplete="new-password" minlength="10" required>
      <label for="p2">Confirm passphrase</label>
      <input type="password" id="p2" name="password2" autocomplete="new-password" minlength="10" required>
      ${error ? `<div class="error">${esc(error)}</div>` : ''}
      <button class="btn green" type="submit">Initialize →</button>
    </form>`), AUTH_CSS);
}

export function twofaSetupPage(qrDataUrl: string, secret: string, error?: string): string {
  return page('Enroll 2FA', authShell(`
    <p class="muted" style="font-size:14px">Scan with your authenticator app<br>(Google Authenticator, Authy, 1Password…)</p>
    <div class="qr-box"><img src="${qrDataUrl}" width="180" height="180" alt="TOTP QR code"></div>
    <div class="secret">${esc(secret)}</div>
    <form method="POST" action="/2fa/enroll">
      <label for="c">Enter the 6-digit code to confirm</label>
      <input type="text" id="c" name="code" class="code-input" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus>
      ${error ? `<div class="error">${esc(error)}</div>` : ''}
      <button class="btn green" type="submit">Activate 2FA →</button>
    </form>`), AUTH_CSS);
}

export function twofaVerifyPage(error?: string): string {
  return page('Two-factor check', authShell(`
    <p class="muted" style="font-size:14px">Second factor required.<br>Enter the code from your authenticator app.</p>
    <form method="POST" action="/2fa/verify">
      <label for="c">Authentication code</label>
      <input type="text" id="c" name="code" class="code-input" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus>
      ${error ? `<div class="error">${esc(error)}</div>` : ''}
      <button class="btn" type="submit">Verify →</button>
    </form>
    <div style="margin-top:14px"><a href="/logout" class="muted" style="font-size:12px">← back to sign-in</a></div>`), AUTH_CSS);
}

const PORTAL_CSS = `
  .top {
    display: flex; align-items: center; gap: 14px; padding: 16px clamp(16px, 4vw, 40px);
    border-bottom: 1px solid var(--navy-line); background: rgba(7,15,34,0.6); backdrop-filter: blur(8px);
    position: sticky; top: 0; z-index: 5;
  }
  .top h1 { font-size: 16px; font-weight: 700; }
  .top h1 .accent { color: var(--gold-bright); }
  .top .spacer { flex: 1; }
  .top .who { font-size: 13px; color: var(--ink-dim); }
  .top .who b { color: var(--green-bright); }
  main { padding: 26px clamp(16px, 4vw, 40px) 60px; max-width: 1280px; margin: 0 auto; }
  .grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; align-items: start; }
  @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }
  .panel { padding: 22px 24px; }
  .panel h2 { font-size: 13px; color: var(--gold-bright); text-transform: uppercase; margin-bottom: 4px; }
  .panel .desc { font-size: 13px; color: var(--ink-dim); margin-bottom: 16px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 6px; }
  .tile { border: 1px solid var(--navy-line); border-radius: 10px; padding: 12px 14px; background: rgba(7,15,34,0.45); }
  .tile .label { font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-dim); }
  .tile .value { font-family: 'Orbitron', sans-serif; font-size: 26px; color: var(--ink); margin-top: 4px; }
  .tile.gold .value { color: var(--gold-bright); text-shadow: 0 0 14px rgba(232,195,77,0.4); }
  .tile.green .value { color: var(--green-bright); text-shadow: 0 0 14px rgba(87,178,106,0.4); }
  .report-row { display: flex; align-items: center; gap: 12px; padding: 11px 4px; border-bottom: 1px solid rgba(30,58,109,0.5); }
  .report-row:last-child { border-bottom: none; }
  .report-row .dot { width: 8px; height: 8px; border-radius: 99px; background: var(--green-bright);
    box-shadow: 0 0 10px rgba(87,178,106,0.8); }
  .report-row .name { flex: 1; font-size: 15px; font-weight: 600; }
  .report-row .when { font-size: 12px; color: var(--ink-dim); }
  .chat { display: flex; flex-direction: column; height: 560px; }
  .chat-head { display: flex; align-items: center; gap: 10px; }
  .chat-head .pulse { width: 9px; height: 9px; border-radius: 99px; background: var(--green-bright);
    box-shadow: 0 0 12px rgba(87,178,106,0.9); animation: pulse 2s infinite; }
  .chat-head .pulse.off { background: var(--danger); box-shadow: 0 0 12px rgba(224,82,82,0.7); animation: none; }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
  .chat-log { flex: 1; overflow-y: auto; margin: 14px 0; display: flex; flex-direction: column; gap: 10px; padding-right: 6px; }
  .msg { max-width: 88%; border-radius: 12px; padding: 10px 14px; font-size: 14.5px; line-height: 1.55; white-space: pre-wrap; }
  .msg.user { align-self: flex-end; background: rgba(201,162,39,0.14); border: 1px solid rgba(201,162,39,0.4); }
  .msg.assistant { align-self: flex-start; background: rgba(19,41,78,0.8); border: 1px solid var(--navy-line); }
  .msg.err { align-self: stretch; border: 1px solid rgba(224,82,82,0.5); color: var(--danger); background: rgba(224,82,82,0.07); }
  .chat-form { display: flex; gap: 10px; }
  .chat-form textarea { flex: 1; resize: none; height: 58px; background: rgba(7,15,34,0.7);
    border: 1px solid var(--navy-line); border-radius: 10px; color: var(--ink); font-family: inherit;
    font-size: 14.5px; padding: 10px 12px; outline: none; }
  .chat-form textarea:focus { border-color: var(--green-bright); box-shadow: 0 0 0 3px rgba(87,178,106,0.15); }
  .chat-form .btn { align-self: stretch; }
  footer { font-size: 11px; color: var(--ink-dim); max-width: 1280px; margin: 0 auto; padding: 0 clamp(16px,4vw,40px) 40px; line-height: 1.6; }
`;

export interface PortalStats {
  readinessPct?: number;
  pursue?: number;
  inLane?: number;
  urgent?: number;
  company?: string;
}

export interface ReportEntry {
  name: string;
  mtime: string;
  hasDashboard: boolean;
  /** filename of the dashboard html inside the report directory */
  dashboardFile?: string;
}

export function portalPage(opts: {
  username: string;
  claudeReady: boolean;
  reports: ReportEntry[];
  stats: PortalStats | null;
}): string {
  const { username, claudeReady, reports, stats } = opts;

  const tiles = stats
    ? `<div class="tiles">
        <div class="tile gold"><div class="label">Readiness</div><div class="value">${stats.readinessPct ?? '—'}%</div></div>
        <div class="tile green"><div class="label">Pursue now</div><div class="value">${stats.pursue ?? '—'}</div></div>
        <div class="tile"><div class="label">In lanes</div><div class="value">${stats.inLane ?? '—'}</div></div>
        <div class="tile"><div class="label">Closing ≤7d</div><div class="value">${stats.urgent ?? '—'}</div></div>
      </div>
      <div class="desc" style="margin-top:8px">Latest map: <b style="color:var(--ink)">${esc(stats.company ?? '')}</b></div>`
    : `<div class="desc">No contract maps generated yet. Run <code style="color:var(--green-bright)">npm run demo</code> or
       <code style="color:var(--green-bright)">npm run govready -- generate …</code>, then refresh.</div>`;

  const reportRows = reports.length
    ? reports
        .map(
          (r) => `<div class="report-row"><div class="dot"></div>
            <div class="name">${esc(r.name)}</div>
            <div class="when">${esc(r.mtime)}</div>
            ${r.hasDashboard ? `<a class="btn ghost" style="padding:7px 14px;font-size:11px" href="/reports/${encodeURIComponent(r.name)}/${encodeURIComponent(r.dashboardFile!)}" target="_blank">Open dashboard</a>` : ''}
          </div>`,
        )
        .join('\n')
    : `<div class="desc">Generated maps will appear here.</div>`;

  const body = `
  <header class="top">
    ${LOGO_SVG}
    <h1>HUTCHROK<span class="accent"> // </span>GOVREADY LAB <span class="tag" style="margin-left:8px">Portal</span></h1>
    <div class="spacer"></div>
    <div class="who">operator&nbsp;<b>${esc(username)}</b> · <span style="color:var(--green-bright)">2FA ✓</span></div>
    <a class="btn ghost" style="padding:8px 14px;font-size:11px" href="/logout">Sign out</a>
  </header>
  <main>
    <div class="grid">
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="panel">
          <h2>Mission Status</h2>
          ${tiles}
        </div>
        <div class="panel">
          <h2>Contract Maps</h2>
          <div class="desc">Client deliverables generated by the Phase 1 engine.</div>
          ${reportRows}
        </div>
      </div>
      <div class="panel chat">
        <div class="chat-head">
          <div class="pulse${claudeReady ? '' : ' off'}"></div>
          <h2 style="margin:0">Claude · Lab Assistant</h2>
        </div>
        <div class="desc" style="margin-top:4px">${
          claudeReady
            ? 'Connected. Ask about the latest contract map, set-asides, capability statements, next moves.'
            : 'Not configured — set <code>ANTHROPIC_API_KEY</code> in the environment and restart the portal.'
        }</div>
        <div class="chat-log" id="log"></div>
        <form class="chat-form" id="chatForm">
          <textarea id="chatInput" placeholder="${claudeReady ? 'Ask the lab assistant…' : 'Claude connector offline'}" ${claudeReady ? '' : 'disabled'}></textarea>
          <button class="btn green" type="submit" ${claudeReady ? '' : 'disabled'}>Send</button>
        </form>
      </div>
    </div>
  </main>
  <footer>
    Hutchrok Solutions Group LLC · McKinney, TX · Veteran-owned. All guidance is operational business consulting — not
    legal, tax, or financial advice. Non-veteran clients receive consulting expertise, not veteran-specific benefits or
    set-aside eligibility. No award outcomes are guaranteed. Always verify requirements against the official SAM.gov /
    Grants.gov notice.
  </footer>`;

  const chatJs = `
(function () {
  var log = document.getElementById('log');
  var form = document.getElementById('chatForm');
  var input = document.getElementById('chatInput');
  var history = [];
  var busy = false;

  function bubble(cls, text) {
    var d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  async function ask(text) {
    busy = true;
    bubble('user', text);
    history.push({ role: 'user', content: text });
    var out = bubble('assistant', '…');
    out.textContent = '';
    try {
      var resp = await fetch('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var reader = resp.body.getReader();
      var dec = new TextDecoder();
      var buf = '';
      var answer = '';
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var frames = buf.split('\\n\\n');
        buf = frames.pop();
        for (var i = 0; i < frames.length; i++) {
          var lines = frames[i].split('\\n');
          var ev = '', data = '';
          for (var j = 0; j < lines.length; j++) {
            if (lines[j].indexOf('event: ') === 0) ev = lines[j].slice(7);
            if (lines[j].indexOf('data: ') === 0) data = lines[j].slice(6);
          }
          if (ev === 'delta') {
            answer += JSON.parse(data).text;
            out.textContent = answer;
            log.scrollTop = log.scrollHeight;
          } else if (ev === 'error') {
            bubble('err', JSON.parse(data).message);
          }
        }
      }
      if (answer) history.push({ role: 'assistant', content: answer });
      else out.remove();
    } catch (e) {
      out.remove();
      bubble('err', 'Connection error: ' + e.message);
      history.pop();
    } finally {
      busy = false;
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    ask(text);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });
})();`;

  return page('Portal', body, PORTAL_CSS, chatJs);
}
