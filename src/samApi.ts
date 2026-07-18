import type { Opportunity } from './types.js';
import { normalizeSetAside, normalizeType } from './config.js';
import { parseSamDate } from './samParser.js';

export interface SamApiFetchOptions {
  apiKey: string;
  naicsLanes: string[];
  endpoint?: string;
  pageSize?: number;
  maxPages?: number;
  dateFrom?: string;
  dateTo?: string;
}

function pick(raw: unknown, paths: string[]): string {
  if (!raw || typeof raw !== 'object') return '';
  const root = raw as Record<string, unknown>;
  for (const path of paths) {
    const parts = path.split('.');
    let cur: unknown = root;
    for (const part of parts) {
      if (!cur || typeof cur !== 'object') {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[part];
    }
    if (cur === undefined || cur === null) continue;
    const s = String(cur).trim();
    if (s) return s;
  }
  return '';
}

function asBool(raw: unknown): boolean | null {
  if (raw === true || raw === false) return raw;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s === 'true' || s === 'yes' || s === '1') return true;
  if (s === 'false' || s === 'no' || s === '0') return false;
  return null;
}

function itemsFromResponse(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const candidates = [
    obj.opportunitiesData,
    obj.opportunities,
    obj.data,
    obj.results,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    if (c && typeof c === 'object') {
      const values = Object.values(c as Record<string, unknown>);
      for (const v of values) if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function mapOpportunity(raw: unknown): Opportunity | null {
  const noticeId = pick(raw, ['noticeId', 'NoticeId', 'id', 'notice_id']);
  const title = pick(raw, ['title', 'Title', 'solicitationTitle']);
  if (!noticeId && !title) return null;

  const rawType = pick(raw, ['type', 'Type', 'noticeType', 'baseType']);
  const rawSetAsideCode = pick(raw, ['setAsideCode', 'SetASideCode', 'setASideCode']);
  const rawSetAsideLabel = pick(raw, ['setAside', 'SetASide', 'setAsideDescription']);

  const activeRaw = pick(raw, ['active', 'isActive']);
  const inactiveRaw = pick(raw, ['archived', 'isArchived', 'inactive']);
  const active = asBool(activeRaw) ?? !(asBool(inactiveRaw) ?? false);

  return {
    noticeId: noticeId || '(no id)',
    title: title || '(untitled)',
    agency: pick(raw, [
      'department',
      'agency',
      'fullParentPathName',
      'Department/Ind.Agency',
      'organizationHierarchy',
    ]),
    office: pick(raw, ['office', 'officeAddress.city', 'officeAddress.state']),
    naics: pick(raw, ['naicsCode', 'NaicsCode', 'naics']).replace(/[^0-9]/g, ''),
    type: normalizeType(rawType),
    rawType,
    setAside: normalizeSetAside(rawSetAsideCode, rawSetAsideLabel),
    rawSetAside: rawSetAsideLabel || rawSetAsideCode,
    postedDate: parseSamDate(pick(raw, ['postedDate', 'PostedDate', 'publishDate'])),
    responseDeadline: parseSamDate(
      pick(raw, ['responseDeadLine', 'ResponseDeadLine', 'responseDeadline', 'archiveDate']),
    ),
    popState: pick(raw, ['popState', 'placeOfPerformance.stateCode', 'state']),
    link: pick(raw, ['uiLink', 'link', 'resourceLinks.0', 'url']),
    description: pick(raw, ['description', 'Description', 'solicitationDescription']),
    active,
  };
}

async function fetchLanePage(
  endpoint: string,
  apiKey: string,
  lane: string,
  limit: number,
  offset: number,
  dateFrom?: string,
  dateTo?: string,
): Promise<unknown[]> {
  const u = new URL(endpoint);
  u.searchParams.set('api_key', apiKey);
  u.searchParams.set('naicsCode', lane);
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('offset', String(offset));
  if (dateFrom) u.searchParams.set('postedFrom', dateFrom);
  if (dateTo) u.searchParams.set('postedTo', dateTo);

  const res = await fetch(u.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SAM.gov API request failed (${res.status}): ${body.slice(0, 280)}`);
  }
  const json = (await res.json()) as unknown;
  return itemsFromResponse(json);
}

export async function fetchContractsFromSamApi(opts: SamApiFetchOptions): Promise<Opportunity[]> {
  const endpoint = opts.endpoint || 'https://api.sam.gov/prod/opportunities/v2/search';
  const pageSize = Math.max(1, Math.min(1000, opts.pageSize ?? 250));
  const maxPages = Math.max(1, opts.maxPages ?? 8);
  const seen = new Set<string>();
  const all: Opportunity[] = [];

  for (const lane of opts.naicsLanes) {
    for (let page = 0; page < maxPages; page++) {
      const rows = await fetchLanePage(
        endpoint,
        opts.apiKey,
        lane,
        pageSize,
        page * pageSize,
        opts.dateFrom,
        opts.dateTo,
      );
      if (!rows.length) break;

      for (const row of rows) {
        const mapped = mapOpportunity(row);
        if (!mapped) continue;
        if (seen.has(mapped.noticeId)) continue;
        seen.add(mapped.noticeId);
        all.push(mapped);
      }

      if (rows.length < pageSize) break;
    }
  }

  return all;
}
