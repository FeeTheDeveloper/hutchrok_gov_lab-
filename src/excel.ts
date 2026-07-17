import ExcelJS from 'exceljs';
import type { Report, ScoredOpportunity, Tier } from './types.js';
import { setAsideLabel } from './config.js';

const TIER_LABEL: Record<Tier, string> = {
  PURSUE: 'Pursue',
  QUALIFY: 'Qualify',
  MONITOR: 'Monitor',
  INTEL: 'Intel',
};

// Brand-ish fills (ARGB). Blue sequential from the dashboard palette.
const FILL = {
  header: 'FF1C5CAB',
  pursue: 'FF184F95',
  qualify: 'FF3987E5',
  monitor: 'FFCDE2FB',
  intel: 'FFF1F0EC',
  urgent: 'FFF6D5D5',
};

function tierFill(t: Tier): string {
  return { PURSUE: FILL.pursue, QUALIFY: FILL.qualify, MONITOR: FILL.monitor, INTEL: FILL.intel }[t];
}
function tierFontColor(t: Tier): string {
  return t === 'PURSUE' || t === 'QUALIFY' ? 'FFFFFFFF' : 'FF0B0B0B';
}

export async function writeWorkbook(report: Report, outPath: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hutchrok GovReady Lab';
  wb.created = new Date();

  buildPipelineSheet(wb, report);
  buildReadinessSheet(wb, report);
  buildGrantsSheet(wb, report);
  buildLegendSheet(wb, report);

  await wb.xlsx.writeFile(outPath);
}

function buildPipelineSheet(wb: ExcelJS.Workbook, report: Report) {
  const ws = wb.addWorksheet('Contract Map', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  ws.mergeCells('A1:L1');
  ws.getCell('A1').value = `${report.intake.company} — GovReady Contract Map`;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1C5CAB' } };
  ws.mergeCells('A2:L2');
  ws.getCell('A2').value =
    `Fit-scored SAM.gov pipeline · Generated ${report.generatedAt.slice(0, 10)} · Runway as of ${report.today} · ` +
    `Lanes ${report.intake.naicsLanes.join(', ')}`;
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF52514E' } };
  ws.getRow(3).height = 4;

  const headers = [
    'Fit', 'Tier', 'Eligible', 'Action', 'Title', 'Agency', 'NAICS',
    'Set-Aside', 'Type', 'Deadline', 'Days Left', 'Notice ID', 'Why (score reasoning)', 'Link',
  ];
  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL.header } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  });
  headerRow.height = 22;

  const widths = [6, 10, 9, 20, 46, 26, 9, 12, 20, 12, 10, 22, 52, 24];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  report.opportunities.forEach((o: ScoredOpportunity) => {
    const urgent = o.daysToDeadline !== null && o.daysToDeadline >= 0 && o.daysToDeadline <= 7;
    const row = ws.addRow([
      o.score,
      TIER_LABEL[o.tier],
      o.eligible ? 'Yes' : 'No',
      o.action,
      o.title,
      o.agency,
      o.naics,
      setAsideLabel(o.setAside),
      o.rawType || o.type,
      o.responseDeadline ?? '',
      o.daysToDeadline ?? '',
      o.noticeId,
      o.reasons.join(' · '),
      o.link,
    ]);
    row.alignment = { vertical: 'top', wrapText: true };

    const fit = row.getCell(1);
    fit.font = { bold: true, size: 12 };
    fit.alignment = { vertical: 'middle', horizontal: 'center' };

    const tierCell = row.getCell(2);
    tierCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tierFill(o.tier) } };
    tierCell.font = { bold: true, color: { argb: tierFontColor(o.tier) } };
    tierCell.alignment = { vertical: 'middle', horizontal: 'center' };

    if (!o.eligible) row.getCell(3).font = { color: { argb: 'FFD03B3B' }, bold: true };
    if (urgent) {
      row.getCell(11).font = { color: { argb: 'FFD03B3B' }, bold: true };
      row.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL.urgent } };
    }
    if (o.link) {
      row.getCell(14).value = { text: 'Open on SAM.gov', hyperlink: o.link };
      row.getCell(14).font = { color: { argb: 'FF2A78D6' }, underline: true };
    }
  });

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
}

function buildReadinessSheet(wb: ExcelJS.Workbook, report: Report) {
  const ws = wb.addWorksheet('Readiness');
  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 16;

  ws.mergeCells('A1:B1');
  ws.getCell('A1').value = `Federal Readiness — ${report.stats.readinessPct}% complete`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1C5CAB' } };

  const r = report.intake.readiness;
  const vet = r.vetCertVerification;
  const vetLabel = vet === true ? 'Yes' : vet === false ? 'No' : String(vet);
  const rows: [string, string][] = [
    ['SAM.gov registration active', r.samRegistered ? 'Done' : 'Open'],
    ['UEI & CAGE code', r.ueiCage ? 'Done' : 'Open'],
    ['Reps & certs complete', r.repsAndCerts ? 'Done' : 'Open'],
    ['VetCert verification', vetLabel],
    ['Capability statement', r.capabilityStatement ? 'Done' : 'Open'],
    ['Past-performance file (3 refs)', r.pastPerformanceFile ? 'Done' : 'Open'],
    ['2-yr financial statements', r.financialStatements ? 'Done' : 'Open'],
    ['Grant readiness (narrative + budget)', r.grantReadiness ? 'Done' : 'Open'],
  ];
  ws.addRow([]);
  ws.addRow(['Item', 'Status']).font = { bold: true };
  for (const [label, status] of rows) {
    const row = ws.addRow([label, status]);
    const done = status === 'Done' || status === 'complete' || status === 'Yes';
    row.getCell(2).font = { color: { argb: done ? 'FF006300' : 'FFD03B3B' }, bold: true };
  }
}

function buildGrantsSheet(wb: ExcelJS.Workbook, report: Report) {
  const ws = wb.addWorksheet('Grant Positioning');
  const headers = ['Listing #', 'Program', 'Agency', 'Why you are positioned', 'Vet-advantaged'];
  const widths = [12, 46, 26, 50, 14];
  ws.addRow(headers).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL.header } };
  });
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  if (report.grants.length === 0) {
    ws.addRow(['—', 'No positioned assistance listings for this profile.', '', '', '']);
  }
  for (const g of report.grants) {
    const row = ws.addRow([g.programNumber, g.title, g.agency, g.reasons.join(' · '), g.veteranAdvantaged ? 'Yes' : '']);
    row.alignment = { vertical: 'top', wrapText: true };
  }
}

function buildLegendSheet(wb: ExcelJS.Workbook, report: Report) {
  const ws = wb.addWorksheet('How to read this');
  ws.getColumn(1).width = 100;
  const lines = [
    ['How to read your Contract Map', 16, 'FF1C5CAB', true],
    ['', 10, 'FF52514E', false],
    ['Fit Score (0–100): opportunity type + set-aside eligibility + deadline runway + strength match.', 11, 'FF0B0B0B', false],
    ['Tiers:', 12, 'FF0B0B0B', true],
    ['  • Pursue — act now. High fit, you are eligible, and it is actionable.', 11, 'FF0B0B0B', false],
    ['  • Qualify — a fit, but needs a decision or a piece of readiness first.', 11, 'FF0B0B0B', false],
    ['  • Monitor — watch this lane; not yet worth the effort.', 11, 'FF0B0B0B', false],
    ['  • Intel — award notices, closed notices, or set-asides you cannot win. Study who wins.', 11, 'FF0B0B0B', false],
    ['', 10, 'FF52514E', false],
    ['Eligible = No means the set-aside excludes you. We say this plainly — benefit integrity.', 11, 'FF0B0B0B', false],
    ['Days Left in red = 7 days or fewer. Same-day action.', 11, 'FF0B0B0B', false],
    ['', 10, 'FF52514E', false],
    [
      'Hutchrok Solutions Group LLC · McKinney, TX · Veteran-owned. All guidance is operational business ' +
        'consulting — not legal, tax, or financial advice. Non-veteran clients receive consulting expertise, ' +
        'not veteran-specific benefits or set-aside eligibility. No award outcomes are guaranteed. Always verify ' +
        'each requirement against the official SAM.gov / Grants.gov notice before acting.',
      9, 'FF898781', false,
    ],
  ] as [string, number, string, boolean][];
  for (const [text, size, color, bold] of lines) {
    const row = ws.addRow([text]);
    row.getCell(1).font = { size, color: { argb: color }, bold };
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    if (size === 9) row.height = 60;
  }
  void report;
}
