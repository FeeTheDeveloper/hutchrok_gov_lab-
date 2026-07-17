import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import type { Opportunity, AssistanceListing } from './types.js';
import { normalizeType, normalizeSetAside } from './config.js';

/** Collapse a header to a lookup key: lowercase, alphanumerics only. */
function key(h: string): string {
  return (h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Build a case/spacing-insensitive row accessor with alias fallback. */
function accessor(row: Record<string, string>) {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) map.set(key(k), v);
  return (aliases: string[]): string => {
    for (const a of aliases) {
      const v = map.get(key(a));
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };
}

/**
 * Parse a SAM.gov date. The contract-opportunities export uses forms like
 * "2026-07-29-17:00:00" (ISO-ish with a trailing tz-less time) or plain dates.
 * Returns an ISO date string (yyyy-mm-dd, midnight UTC dropped) or null.
 */
export function parseSamDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // 2026-07-29-17:00:00  or 2026-07-29T17:00:00 or 2026-07-29
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // 07/29/2026
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = us[1].padStart(2, '0');
    const dd = us[2].padStart(2, '0');
    return `${us[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function readCsvRows(path: string): Record<string, string>[] {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, ''); // strip BOM
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];
}

/**
 * Parse a SAM.gov Contract Opportunities CSV export into Opportunity records.
 * Tolerant of column-name variations across SAM's export versions.
 */
export function parseContracts(path: string): Opportunity[] {
  const rows = readCsvRows(path);
  const out: Opportunity[] = [];
  for (const row of rows) {
    const get = accessor(row);
    const title = get(['Title']);
    const noticeId = get(['NoticeId', 'Notice ID', 'NoticeID']);
    if (!title && !noticeId) continue; // skip blank/summary rows

    const rawType = get(['Type', 'BaseType', 'Base Type']);
    const rawSetAsideCode = get(['SetASideCode', 'SetAsideCode', 'Set Aside Code']);
    const rawSetAsideLabel = get(['SetASide', 'SetAside', 'Set Aside']);
    const naics = get(['NaicsCode', 'NAICS Code', 'NAICS']);
    const activeRaw = get(['Active']).toLowerCase();

    out.push({
      noticeId: noticeId || '(no id)',
      title: title || '(untitled)',
      agency: get(['Department/Ind.Agency', 'DepartmentIndAgency', 'Department', 'Agency']),
      office: get(['Office']),
      naics: naics.replace(/[^0-9]/g, ''),
      type: normalizeType(rawType),
      rawType,
      setAside: normalizeSetAside(rawSetAsideCode, rawSetAsideLabel),
      rawSetAside: rawSetAsideLabel || rawSetAsideCode,
      postedDate: parseSamDate(get(['PostedDate', 'Posted Date'])),
      responseDeadline: parseSamDate(
        get(['ResponseDeadLine', 'Response Deadline', 'ResponseDeadline', 'ArchiveDate']),
      ),
      popState: get(['PopState', 'PoP State', 'State']),
      link: get(['Link', 'AdditionalInfoLink', 'UI Link']),
      description: get(['Description', 'Desc']),
      active: activeRaw === '' ? true : activeRaw === 'yes' || activeRaw === 'true',
    });
  }
  return out;
}

/**
 * Parse a SAM.gov Assistance Listings export into AssistanceListing records.
 * Column names differ from the contracts export; kept tolerant.
 */
export function parseAssistance(path: string): AssistanceListing[] {
  const rows = readCsvRows(path);
  const out: AssistanceListing[] = [];
  for (const row of rows) {
    const get = accessor(row);
    const number = get([
      'Program Number', 'ProgramNumber', 'AL Number', 'CFDA', 'Assistance Listing Number',
    ]);
    const title = get(['Program Title', 'Title', 'ProgramTitle', 'Name']);
    if (!number && !title) continue;
    out.push({
      programNumber: number || '(n/a)',
      title: title || '(untitled)',
      agency: get(['Department/Ind.Agency', 'Agency', 'Department', 'Sub-Tier']),
      description: get(['Description', 'Objectives', 'Program Description', 'Desc']),
    });
  }
  return out;
}
