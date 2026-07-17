import type { Report, ScoredOpportunity, Tier } from './types.js';
import { setAsideLabel } from './config.js';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TIER_META: Record<Tier, { label: string; cls: string }> = {
  PURSUE: { label: 'Pursue', cls: 't-pursue' },
  QUALIFY: { label: 'Qualify', cls: 't-qualify' },
  MONITOR: { label: 'Monitor', cls: 't-monitor' },
  INTEL: { label: 'Intel', cls: 't-intel' },
};

function saChip(o: ScoredOpportunity): string {
  const label = setAsideLabel(o.setAside);
  if (o.setAside === 'OPEN') return `<span class="chip">Open</span>`;
  const cls = o.eligible ? 'elig' : 'inelig';
  return `<span class="chip ${cls}">${esc(label)}${o.eligible ? '' : ' ✕'}</span>`;
}

function dueCell(o: ScoredOpportunity): string {
  const d = o.daysToDeadline;
  const date = o.responseDeadline ? esc(o.responseDeadline) : '—';
  let tail = '';
  if (d === null) tail = '';
  else if (d < 0) tail = ` · <span style="color:var(--text-muted)">closed</span>`;
  else if (d <= 7) tail = ` <span class="urgent">◆ ${d}d</span>`;
  else tail = ` · ${d}d`;
  return `${date}${tail}<br><span style="color:var(--text-muted);font-size:11px">${esc(o.action)}</span>`;
}

function pipelineRows(report: Report): string {
  if (report.opportunities.length === 0) {
    return `<div class="empty">No opportunities in your lanes in this export. Widen the SAM.gov search or add a NAICS lane.</div>`;
  }
  return report.opportunities
    .map((o) => {
      const t = TIER_META[o.tier];
      const why = esc(o.reasons.join(' · '));
      const link = o.link
        ? `<a href="${esc(o.link)}" target="_blank" rel="noopener" class="idlink">${esc(o.noticeId)}</a>`
        : esc(o.noticeId);
      return `<div class="row" data-why="${why}" data-title="${esc(o.title)}">
      <div class="score-pill">${o.score}</div>
      <div class="name">${esc(o.title)}<br><span class="meta">${link} · ${esc(o.agency)} · NAICS ${esc(o.naics)}</span></div>
      <div>${saChip(o)}</div>
      <div><span class="chip ${t.cls}">${t.label}</span></div>
      <div class="due">${dueCell(o)}</div>
    </div>`;
    })
    .join('\n');
}

function grantRows(report: Report): string {
  if (report.grants.length === 0) {
    return `<div class="grant"><div class="g-why">No positioned assistance listings for this profile in the export. Add an Assistance Listings CSV, or the client's structural advantages don't yet match funded programs.</div></div>`;
  }
  return report.grants
    .map(
      (g) => `<div class="grant"><div class="g-title">${esc(g.title)}</div>
      <div class="g-why">${esc(g.reasons.join(' · '))}</div>
      <div class="g-id">Assistance Listing ${esc(g.programNumber)}${g.agency ? ' · ' + esc(g.agency) : ''}</div></div>`,
    )
    .join('\n');
}

function moves(report: Report): string {
  const top = report.opportunities.filter((o) => o.tier === 'PURSUE' || o.tier === 'QUALIFY').slice(0, 3);
  if (top.length === 0) {
    return `<div class="grant"><div class="g-why">No Pursue/Qualify actions this cycle — the week's work is readiness: close the open items in the score above so the next sweep converts.</div></div>`;
  }
  return top
    .map(
      (o, i) => `<div class="grant"><div class="g-title">${i + 1}. ${esc(o.action)}: ${esc(o.title)}</div>
      <div class="g-why">Deadline ${esc(o.responseDeadline ?? 'n/a')}${
        o.daysToDeadline !== null ? ` (${o.daysToDeadline} days)` : ''
      } · Fit ${o.score}/100 · ${esc(o.reasons.join(' · '))}</div></div>`,
    )
    .join('\n');
}

function readinessChecklist(report: Report): string {
  const r = report.intake.readiness;
  const vet = r.vetCertVerification;
  const vetDone = vet === true || vet === 'complete';
  const items: [string, boolean][] = [
    ['SAM.gov registration active', r.samRegistered],
    ['UEI & CAGE code', r.ueiCage],
    ['Reps & certs complete', r.repsAndCerts],
    ['VetCert verification', vetDone],
    ['Capability statement', r.capabilityStatement],
    ['Past-performance file (3 refs)', r.pastPerformanceFile],
    ['2-yr financial statements', r.financialStatements],
    ['Grant readiness (narrative + budget assets)', r.grantReadiness],
  ];
  return items
    .map(
      ([label, done]) =>
        `<label><input type="checkbox" class="rc"${done ? ' checked' : ''}> ${esc(label)}</label>`,
    )
    .join('\n');
}

export function renderDashboard(report: Report): string {
  const i = report.intake;
  const s = report.stats;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(i.company)} — GovReady Lab Dashboard</title>
<style>
  :root { color-scheme: light dark; }
  .viz-root {
    color-scheme: light;
    --surface-1: #fcfcfb; --page: #f9f9f7;
    --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #898781;
    --grid: #e1e0d9; --baseline: #c3c2b7; --border: rgba(11,11,11,0.10);
    --seq-1: #86b6ef; --seq-2: #5598e7; --seq-3: #2a78d6; --seq-4: #1c5cab;
    --bar: #2a78d6; --bar-track: #cde2fb;
    --critical: #d03b3b; --good: #0ca30c; --good-text: #006300; --accent: #2a78d6;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --surface-1: #1a1a19; --page: #0d0d0d;
      --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #898781;
      --grid: #2c2c2a; --baseline: #383835; --border: rgba(255,255,255,0.10);
      --seq-1: #6da7ec; --seq-2: #3987e5; --seq-3: #256abf; --seq-4: #184f95;
      --bar: #3987e5; --bar-track: #184f95;
      --critical: #d03b3b; --good: #0ca30c; --good-text: #0ca30c; --accent: #3987e5;
    }
  }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .viz-root { background: var(--page); color: var(--text-primary); min-height: 100vh; padding: 28px clamp(16px,4vw,48px) 48px; }
  .brand { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  .brand h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
  .brand .tag { font-size: 12px; color: var(--text-secondary); border:1px solid var(--border); border-radius:99px; padding:2px 10px; }
  header .sub { color: var(--text-secondary); font-size: 13px; margin-top: 4px; max-width: 900px; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px 16px; margin-top: 16px; }
  .card h2 { font-size: 14px; font-weight: 650; }
  .card .desc { font-size: 12px; color: var(--text-secondary); margin: 3px 0 12px; }
  .stepnum { display:inline-flex; width:20px; height:20px; border-radius:99px; background: var(--accent); color:#fff; font-size:11.5px; font-weight:700; align-items:center; justify-content:center; margin-right:7px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 950px) { .grid2 { grid-template-columns: 1fr; } }
  .checks { display:flex; flex-wrap:wrap; gap: 8px 16px; margin-top: 6px; }
  .checks label { display:flex; align-items:center; gap:6px; margin:0; font-size:12.5px; color: var(--text-primary); cursor:pointer; }
  input[type=checkbox] { width:15px; height:15px; accent-color: var(--accent); }
  .meter-wrap { display:flex; align-items:center; gap: 14px; margin: 8px 0 4px; }
  .meter { flex:1; height: 14px; border-radius: 7px; background: var(--bar-track); overflow: hidden; }
  .meter .fill { height: 100%; background: var(--bar); border-radius: 7px 0 0 7px; transition: width .4s; }
  .meter-val { font-size: 26px; font-weight: 650; min-width: 74px; text-align: right; }
  .tiles { display:grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:8px; }
  .tile { border:1px solid var(--border); border-radius:10px; padding:12px 14px; }
  .tile .label { font-size:11.5px; color: var(--text-secondary); }
  .tile .value { font-size:26px; font-weight:600; margin-top:2px; }
  .tile.hot .value { color: var(--critical); }
  .row { display:grid; grid-template-columns: 54px minmax(180px,1fr) 118px 88px 140px; gap:10px; align-items:center; padding:7px 0; border-bottom:1px solid var(--grid); }
  .row:last-child { border-bottom:none; }
  .row:hover { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .score-pill { font-size:13px; font-weight:700; text-align:center; padding:3px 0; border-radius:7px; background: var(--bar-track); }
  .row .name { font-size:12.5px; }
  .row .name .meta { color: var(--text-muted); font-size:11px; }
  .idlink { color: var(--accent); text-decoration: none; }
  .idlink:hover { text-decoration: underline; }
  .chip { display:inline-block; font-size:10.5px; padding:2px 8px; border-radius:99px; border:1px solid var(--border); color:var(--text-secondary); white-space:nowrap; }
  .chip.elig { border-color: var(--good-text); color: var(--good-text); font-weight:600; }
  .chip.inelig { border-color: var(--critical); color: var(--critical); font-weight:600; }
  .chip.t-pursue { background: var(--seq-4); color:#fff; border:none; }
  .chip.t-qualify { background: var(--seq-2); color:#fff; border:none; }
  .chip.t-monitor { background: var(--seq-1); color:#0b0b0b; border:none; }
  .chip.t-intel { background: transparent; color: var(--text-muted); border:1px solid var(--border); }
  .due { font-size:12px; color: var(--text-secondary); text-align:right; }
  .due .urgent { color: var(--critical); font-weight:650; }
  .empty { font-size: 12.5px; color: var(--text-secondary); padding: 14px 0; }
  .grant { padding: 10px 0; border-bottom: 1px solid var(--grid); }
  .grant:last-child { border-bottom:none; }
  .grant .g-title { font-size: 13px; font-weight: 600; }
  .grant .g-why { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
  .grant .g-id { font-size: 11px; color: var(--text-muted); }
  footer { font-size: 11px; color: var(--text-muted); margin-top: 20px; line-height: 1.55; max-width: 1000px; }
  .tooltip { position:fixed; pointer-events:none; background:var(--surface-1); border:1px solid var(--border); border-radius:8px; padding:8px 11px; font-size:12px; box-shadow:0 4px 16px rgba(0,0,0,.14); z-index:10; max-width:340px; display:none; }
  .legend { display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color:var(--text-secondary); margin-top:10px; }
  .legend span::before { content:''; display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:5px; vertical-align:middle; }
  .lg-pursue::before { background: var(--seq-4); } .lg-qualify::before { background: var(--seq-2); }
  .lg-monitor::before { background: var(--seq-1); } .lg-intel::before { background: var(--baseline); }
</style>
</head>
<body class="viz-root">
<header>
  <div class="brand"><h1>${esc(i.company)}</h1><span class="tag">GovReady Lab · Contract Map</span></div>
  <div class="sub">Your business strengths, mapped to live federal contract &amp; grant opportunities.
  Lanes ${esc(i.naicsLanes.join(', '))} · swept ${esc(report.today)} · generated ${esc(report.generatedAt.slice(0, 10))}.</div>
</header>

<div class="card">
  <h2><span class="stepnum">1</span>Federal Readiness Score</h2>
  <div class="desc">What's done and what's blocking you. Check items off as we complete them together.</div>
  <div class="meter-wrap"><div class="meter"><div class="fill" id="meterFill" style="width:${s.readinessPct}%"></div></div><div class="meter-val" id="meterVal">${s.readinessPct}%</div></div>
  <div class="checks" id="readyChecks" style="margin-top:10px">
    ${readinessChecklist(report)}
  </div>
</div>

<div class="card">
  <h2><span class="stepnum">2</span>Fit-Scored Opportunity Pipeline</h2>
  <div class="desc">Live SAM.gov opportunities in your lanes, scored 0–100 against <em>your</em> profile: opportunity type × set-aside eligibility × deadline runway × strength match. Hover any row for the scoring rationale.</div>
  <div class="tiles">
    <div class="tile"><div class="label">In your lanes</div><div class="value">${s.inLane}</div></div>
    <div class="tile"><div class="label">Pursue now</div><div class="value">${s.pursue}</div></div>
    <div class="tile"><div class="label">Eligible via set-aside</div><div class="value">${s.eligible}</div></div>
    <div class="tile${s.urgent ? ' hot' : ''}"><div class="label">Closing within 7 days</div><div class="value">${s.urgent}</div></div>
  </div>
  <div id="pipe" style="margin-top:14px">
    ${pipelineRows(report)}
  </div>
  <div class="legend">
    <span class="lg-pursue">Pursue — act now</span>
    <span class="lg-qualify">Qualify — decision/readiness first</span>
    <span class="lg-monitor">Monitor — watch the lane</span>
    <span class="lg-intel">Intel — award/closed/ineligible</span>
  </div>
</div>

<div class="grid2">
  <div class="card">
    <h2><span class="stepnum">3</span>Grant Positioning Panel</h2>
    <div class="desc">Assistance programs where your profile is structurally advantaged — we position first, then write.</div>
    <div id="grants">${grantRows(report)}</div>
  </div>
  <div class="card">
    <h2><span class="stepnum">4</span>Your Next Three Moves</h2>
    <div class="desc">What your consultant works with you this week.</div>
    <div id="moves">${moves(report)}</div>
  </div>
</div>

<footer>
  Hutchrok Solutions Group LLC · McKinney, TX · Veteran-owned. All guidance is operational business consulting — not legal, tax, or financial advice. Non-veteran clients receive consulting expertise, not veteran-specific benefits or set-aside eligibility. No award outcomes are guaranteed. Always verify requirements against the official SAM.gov / Grants.gov notice.
</footer>
<div class="tooltip" id="tt"></div>

<script>
(function(){
  var tt = document.getElementById('tt');
  document.querySelectorAll('.row').forEach(function(row){
    row.addEventListener('mousemove', function(e){
      tt.innerHTML = '<b>' + row.dataset.title + '</b><br><span style="color:var(--text-secondary)">' + row.dataset.why + '</span>';
      tt.style.display = 'block';
      var x = e.clientX + 14, y = e.clientY + 14, r = tt.getBoundingClientRect();
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
      if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
      tt.style.left = x + 'px'; tt.style.top = y + 'px';
    });
    row.addEventListener('mouseleave', function(){ tt.style.display = 'none'; });
  });
  function meter(){
    var boxes = [].slice.call(document.querySelectorAll('.rc'));
    var pct = Math.round(100 * boxes.filter(function(b){return b.checked;}).length / boxes.length);
    document.getElementById('meterFill').style.width = pct + '%';
    document.getElementById('meterVal').textContent = pct + '%';
  }
  document.addEventListener('change', function(e){ if (e.target.classList.contains('rc')) meter(); });
})();
</script>
</body>
</html>`;
}
