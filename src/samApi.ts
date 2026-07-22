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
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
}

interface RetryOptions {
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function asNumber(raw: unknown, fallback: number): number {
  if (typeof raw !== 'number' || Number.isNaN(raw) || !Number.isFinite(raw)) return fallback;
  return raw;
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
  retry: RetryOptions,
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

  let lastErr: Error | null = null;
  const attempts = retry.maxRetries + 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), retry.requestTimeoutMs);
    try {
      const res = await fetch(u.toString(), { signal: controller.signal });
      if (res.ok) {
        const json = (await res.json()) as unknown;
        return itemsFromResponse(json);
      }

      const body = await res.text();
      const msg = `SAM.gov API request failed (${res.status}): ${body.slice(0, 280)}`;
      if (!isRetryableStatus(res.status) || attempt === attempts - 1) {
        throw new Error(msg);
      }
      lastErr = new Error(msg);
    } catch (err) {
      if (err instanceof Error) {
        if (isAbortError(err)) {
          lastErr = new Error(`SAM.gov API request timed out after ${retry.requestTimeoutMs}ms`);
        } else {
          lastErr = err;
        }
      } else {
        lastErr = new Error(String(err));
      }

      if (attempt === attempts - 1) break;
    } finally {
      clearTimeout(timeout);
    }

    const backoff = retry.retryBaseMs * (2 ** attempt);
    const jitter = Math.floor(Math.random() * Math.max(1, retry.retryBaseMs / 3));
    await sleep(backoff + jitter);
  }

  throw lastErr || new Error('SAM.gov API request failed after retries.');
}

export async function fetchContractsFromSamApi(opts: SamApiFetchOptions): Promise<Opportunity[]> {
  const endpoint = opts.endpoint || 'https://api.sam.gov/prod/opportunities/v2/search';
  const pageSize = Math.max(1, Math.min(1000, asNumber(opts.pageSize, 250)));
  const maxPages = Math.max(1, asNumber(opts.maxPages, 8));
  const retry: RetryOptions = {
    requestTimeoutMs: Math.max(1000, asNumber(opts.requestTimeoutMs, 30000)),
    maxRetries: Math.max(0, asNumber(opts.maxRetries, 2)),
    retryBaseMs: Math.max(100, asNumber(opts.retryBaseMs, 800)),
  };
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
        retry,
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
