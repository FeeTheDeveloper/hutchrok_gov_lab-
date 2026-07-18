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

    await writeWorkbook(report, xlsxPath);
    writeFileSync(htmlPath, renderDashboard(report), 'utf8');
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
    if (opts.json) console.log(`    Report JSON    ${join(dir, 'report.json')}`);
    console.log('');
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
});
