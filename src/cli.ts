#!/usr/bin/env node
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Command } from 'commander';
import { loadIntake } from './intake.js';
import { parseContracts, parseAssistance } from './samParser.js';
import { fetchContractsFromSamApi } from './samApi.js';
import { buildReport } from './fitScore.js';
import { writeWorkbook } from './excel.js';
import { renderDashboard } from './dashboard.js';
import type { AssistanceListing } from './types.js';

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function pad(value: string, width: number): string {
  const s = truncate(value, width);
  if (s.length >= width) return s;
  return `${s}${' '.repeat(width - s.length)}`;
}

function todayIso(override?: string): string {
  if (override) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error(`--today must be YYYY-MM-DD, got "${override}"`);
    return override;
  }
  return new Date().toISOString().slice(0, 10);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';
}

const program = new Command();
program
  .name('govready')
  .description('Hutchrok GovReady Lab — Phase 1 Contract Map generator')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate a client Contract Map (.xlsx) + Lab Dashboard (.html) from an intake + SAM.gov exports')
  .requiredOption('-i, --intake <path>', 'Client intake JSON (Part 1 Federal Readiness Assessment)')
  .option('-c, --contracts <path>', 'SAM.gov Contract Opportunities CSV export')
  .option('--sam-api', 'Fetch SAM.gov opportunities directly via API (local/personal use)')
  .option('--sam-api-key <key>', 'SAM.gov API key (preferred via SAM_GOV_API_KEY env var)')
  .option('--sam-api-endpoint <url>', 'Override opportunities endpoint URL')
  .option('--api-page-size <n>', 'API page size (default: 250)', '250')
  .option('--api-max-pages <n>', 'Max pages per NAICS lane (default: 8)', '8')
  .option('--api-timeout-ms <n>', 'Per-request timeout in ms (default: env SAM_API_TIMEOUT_MS or 30000)')
  .option('--api-retries <n>', 'Retry count for transient API failures (default: env SAM_API_RETRIES or 2)')
  .option('--api-retry-base-ms <n>', 'Base backoff delay in ms (default: env SAM_API_RETRY_BASE_MS or 800)')
  .option('--api-date-from <YYYY-MM-DD>', 'Optional posted-from date filter for API mode')
  .option('--api-date-to <YYYY-MM-DD>', 'Optional posted-to date filter for API mode')
  .option('-a, --assistance <path>', 'SAM.gov Assistance Listings CSV export (for grant positioning)')
  .option('-o, --out <dir>', 'Output directory', 'out')
  .option('-t, --today <YYYY-MM-DD>', 'Reference date for deadline runway (default: today)')
  .option('--json', 'Also write the full scored report as report.json', false)
  .action(async (opts) => {
    const today = todayIso(opts.today);
    const intake = loadIntake(opts.intake);

    const useApi = Boolean(opts.samApi);
    if (!opts.contracts && !useApi) {
      throw new Error('Provide either --contracts <csv> or --sam-api.');
    }
    if (opts.contracts && useApi) {
      throw new Error('Use one contract source at a time: --contracts OR --sam-api.');
    }

    let opportunities;
    let sourceLabel = '';
    if (useApi) {
      const apiKey = (opts.samApiKey as string | undefined) || process.env.SAM_GOV_API_KEY;
      if (!apiKey) {
        throw new Error('SAM API mode requires --sam-api-key or SAM_GOV_API_KEY in your local environment.');
      }
      opportunities = await fetchContractsFromSamApi({
        apiKey,
        naicsLanes: intake.naicsLanes,
        endpoint: opts.samApiEndpoint as string | undefined,
        pageSize: Number(opts.apiPageSize),
        maxPages: Number(opts.apiMaxPages),
        requestTimeoutMs: Number((opts.apiTimeoutMs as string | undefined) || process.env.SAM_API_TIMEOUT_MS),
        maxRetries: Number((opts.apiRetries as string | undefined) || process.env.SAM_API_RETRIES),
        retryBaseMs: Number((opts.apiRetryBaseMs as string | undefined) || process.env.SAM_API_RETRY_BASE_MS),
        dateFrom: opts.apiDateFrom as string | undefined,
        dateTo: opts.apiDateTo as string | undefined,
      });
      sourceLabel = `SAM.gov API (${intake.naicsLanes.join(', ')})`;
    } else {
      opportunities = parseContracts(opts.contracts as string);
      sourceLabel = basename(opts.contracts as string);
    }

    let listings: AssistanceListing[] = [];
    if (opts.assistance) listings = parseAssistance(opts.assistance);

    const report = buildReport(intake, opportunities, listings, today);

    const dir = opts.out as string;
    mkdirSync(dir, { recursive: true });
    const base = slug(intake.company);
    const xlsxPath = join(dir, `${base}-contract-map.xlsx`);
    const htmlPath = join(dir, `${base}-dashboard.html`);
    const indexPath = join(dir, 'index.html');

    await writeWorkbook(report, xlsxPath);
    const dashboardHtml = renderDashboard(report);
    writeFileSync(htmlPath, dashboardHtml, 'utf8');
    writeFileSync(indexPath, dashboardHtml, 'utf8');
    if (opts.json) writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

    const s = report.stats;
    console.log(`\n  GovReady Contract Map — ${intake.company}`);
    console.log(`  ${'-'.repeat(46)}`);
    console.log(`  Swept ${opportunities.length} notices from ${sourceLabel}`);
    console.log(`  ${s.inLane} in your lanes (${intake.naicsLanes.join(', ')})`);
    console.log(`    Pursue  ${s.pursue}   Qualify ${s.qualify}   Monitor ${s.monitor}   Intel ${s.intel}`);
    console.log(`    Eligible via set-aside: ${s.eligible}   Closing <=7 days: ${s.urgent}`);
    console.log(`  Readiness: ${s.readinessPct}%   Grant positions: ${report.grants.length}`);
    console.log(`\n  Deliverables:`);
    console.log(`    Contract Map   ${xlsxPath}`);
    console.log(`    Lab Dashboard  ${htmlPath}`);
    console.log(`    Local Index    ${indexPath}`);
    if (opts.json) console.log(`    Report JSON    ${join(dir, 'report.json')}`);
    console.log('');
  });

program
  .command('search')
  .description('Search SAM.gov opportunities by one or more NAICS codes and print a terminal list')
  .requiredOption('--naics <codes...>', 'One or more NAICS codes (for example: --naics 621999 541611)')
  .option('--sam-api-key <key>', 'SAM.gov API key (preferred via SAM_GOV_API_KEY env var)')
  .option('--sam-api-endpoint <url>', 'Override opportunities endpoint URL')
  .option('--api-page-size <n>', 'API page size (default: 100)', '100')
  .option('--api-max-pages <n>', 'Max pages per NAICS lane (default: 2)', '2')
  .option('--api-timeout-ms <n>', 'Per-request timeout in ms (default: env SAM_API_TIMEOUT_MS or 30000)')
  .option('--api-retries <n>', 'Retry count for transient API failures (default: env SAM_API_RETRIES or 2)')
  .option('--api-retry-base-ms <n>', 'Base backoff delay in ms (default: env SAM_API_RETRY_BASE_MS or 800)')
  .option('--api-date-from <YYYY-MM-DD>', 'Posted-from date filter (default: 90 days ago)')
  .option('--api-date-to <YYYY-MM-DD>', 'Posted-to date filter (default: today)')
  .option('--limit <n>', 'Max rows to print (default: 50)', '50')
  .action(async (opts) => {
    const apiKey = (opts.samApiKey as string | undefined) || process.env.SAM_GOV_API_KEY;
    if (!apiKey) {
      throw new Error('Search requires --sam-api-key or SAM_GOV_API_KEY in your local environment.');
    }

    const naicsLanes = (opts.naics as string[])
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => v.replace(/[^0-9]/g, ''));
    if (!naicsLanes.length) {
      throw new Error('Provide at least one NAICS code via --naics.');
    }

    const to = (opts.apiDateTo as string | undefined) || todayIso();
    if (!isIsoDate(to)) throw new Error(`--api-date-to must be YYYY-MM-DD, got "${to}"`);

    const from = (opts.apiDateFrom as string | undefined)
      || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!isIsoDate(from)) throw new Error(`--api-date-from must be YYYY-MM-DD, got "${from}"`);

    const opportunities = await fetchContractsFromSamApi({
      apiKey,
      naicsLanes,
      endpoint: opts.samApiEndpoint as string | undefined,
      pageSize: Number(opts.apiPageSize),
      maxPages: Number(opts.apiMaxPages),
      requestTimeoutMs: Number((opts.apiTimeoutMs as string | undefined) || process.env.SAM_API_TIMEOUT_MS),
      maxRetries: Number((opts.apiRetries as string | undefined) || process.env.SAM_API_RETRIES),
      retryBaseMs: Number((opts.apiRetryBaseMs as string | undefined) || process.env.SAM_API_RETRY_BASE_MS),
      dateFrom: from,
      dateTo: to,
    });

    const sorted = [...opportunities].sort((a, b) => {
      const ad = a.postedDate || '';
      const bd = b.postedDate || '';
      if (ad === bd) return a.noticeId.localeCompare(b.noticeId);
      return bd.localeCompare(ad);
    });

    const rowLimit = Math.max(1, Number(opts.limit) || 50);
    const rows = sorted.slice(0, rowLimit);

    console.log(`\n  SAM.gov NAICS search`);
    console.log(`  ${'-'.repeat(48)}`);
    console.log(`  NAICS: ${naicsLanes.join(', ')}`);
    console.log(`  Date range: ${from} to ${to}`);
    console.log(`  Total found: ${sorted.length}`);

    if (!rows.length) {
      console.log('\n  No opportunities returned for the selected filters.\n');
      return;
    }

    const header = [
      pad('#', 3),
      pad('Notice ID', 18),
      pad('Posted', 10),
      pad('Type', 15),
      pad('Set-Aside', 14),
      pad('NAICS', 8),
      pad('Title', 52),
    ].join('  ');

    console.log('');
    console.log(`  ${header}`);
    console.log(`  ${'-'.repeat(header.length)}`);

    rows.forEach((o, idx) => {
      const line = [
        pad(String(idx + 1), 3),
        pad(o.noticeId || '(no id)', 18),
        pad(o.postedDate || '-', 10),
        pad(o.rawType || o.type, 15),
        pad(o.rawSetAside || o.setAside, 14),
        pad(o.naics || '-', 8),
        pad(o.title || '(untitled)', 52),
      ].join('  ');
      console.log(`  ${line}`);
    });

    console.log('');
    console.log('  Tip: Use --limit to print more rows.');
    console.log('');
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
});
