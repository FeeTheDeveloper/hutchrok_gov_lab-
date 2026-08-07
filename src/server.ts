import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { renderDashboard } from './dashboard.js';
import { buildWorkbookBuffer } from './excel.js';
import { buildReport } from './fitScore.js';
import { parseIntake } from './intake.js';
import { fetchContractsFromSamApi } from './samApi.js';
import { parseAssistanceCsv, parseContractsCsv } from './samParser.js';
import { BusinessProfileSchema } from './business/index.js';
import {
  BidOperationsService,
  GovReadyStore,
  OpportunityProjectSchema,
  SolicitationAnalysisSchema,
  SupabaseArtifactBackend,
  SupabaseAuditSink,
  SupabaseGovReadyStore,
  createServiceRoleClient,
  supabaseConfigured,
} from './bids/index.js';

const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const ALLOWED_ORIGIN = process.env.GOVREADY_ALLOWED_ORIGIN || '*';
const HOST = process.env.GOVREADY_API_HOST || '127.0.0.1';

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly expose = true,
  ) {
    super(message);
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const GenerateRequestSchema = z.object({
  intake: z.unknown(),
  contractsCsv: z.string().min(1).optional(),
  assistanceCsv: z.string().optional(),
  samApi: z.object({
    apiKey: z.string().optional().transform((value) => value?.trim() || undefined),
    endpoint: z.string().url().optional(),
    pageSize: z.number().int().positive().optional(),
    maxPages: z.number().int().positive().optional(),
    dateFrom: z.string().refine(isIsoDate, 'dateFrom must be a real YYYY-MM-DD date.').optional(),
    dateTo: z.string().refine(isIsoDate, 'dateTo must be a real YYYY-MM-DD date.').optional(),
  }).optional(),
  today: z.string().refine(isIsoDate, 'today must be a real YYYY-MM-DD date.').optional(),
  includeWorkbook: z.boolean().optional(),
}).superRefine((value, ctx) => {
  const hasContractsCsv = typeof value.contractsCsv === 'string' && value.contractsCsv.trim() !== '';
  const hasSamApi = value.samApi !== undefined;
  if ((!hasContractsCsv && !hasSamApi) || (hasContractsCsv && hasSamApi)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one contract source: contractsCsv or samApi.',
      path: ['contractsCsv'],
    });
  }
  if (value.samApi?.dateFrom && value.samApi?.dateTo && value.samApi.dateFrom > value.samApi.dateTo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'samApi.dateFrom must be on or before samApi.dateTo.',
      path: ['samApi', 'dateFrom'],
    });
  }
});

type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  setCorsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object.');
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new HttpError(400, `Request body must be valid JSON: ${(err as Error).message}`);
  }
}

function actor(req: IncomingMessage, body?: Record<string, unknown>): string {
  const value = body?.actor ?? req.headers['x-govready-actor'];
  return typeof value === 'string' && value.trim() ? value.trim() : 'local-api-operator';
}

function bidService(): BidOperationsService {
  if (supabaseConfigured()) {
    const client = createServiceRoleClient();
    return new BidOperationsService(new SupabaseGovReadyStore(client), new SupabaseAuditSink(client), new SupabaseArtifactBackend(client));
  }
  return new BidOperationsService(new GovReadyStore());
}

function todayIso(override?: string): string {
  if (override) return override;
  return new Date().toISOString().slice(0, 10);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) throw new HttpError(413, 'Request body exceeds the maximum allowed size.');
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function buildApiResponse(request: GenerateRequest) {
  let intake;
  try {
    intake = parseIntake(request.intake);
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }

  const opportunities = request.contractsCsv
    ? (() => {
      try {
        return parseContractsCsv(request.contractsCsv);
      } catch (err) {
        throw new HttpError(400, `Could not parse contractsCsv: ${(err as Error).message}`);
      }
    })()
    : await (async () => {
      const apiKey = request.samApi?.apiKey ?? process.env.SAM_GOV_API_KEY;
      if (!apiKey) {
        throw new HttpError(400, 'samApi requests require samApi.apiKey or SAM_GOV_API_KEY in the server environment.');
      }
      try {
        return await fetchContractsFromSamApi({
          apiKey,
          endpoint: request.samApi?.endpoint,
          pageSize: request.samApi?.pageSize,
          maxPages: request.samApi?.maxPages,
          dateFrom: request.samApi?.dateFrom,
          dateTo: request.samApi?.dateTo,
          naicsLanes: intake.naicsLanes,
        });
      } catch (err) {
        throw new HttpError(502, `SAM.gov API request failed: ${(err as Error).message}`);
      }
    })();

  const listings = request.assistanceCsv
    ? (() => {
      try {
        return parseAssistanceCsv(request.assistanceCsv);
      } catch (err) {
        throw new HttpError(400, `Could not parse assistanceCsv: ${(err as Error).message}`);
      }
    })()
    : [];
  const report = buildReport(intake, opportunities, listings, todayIso(request.today));
  const response: Record<string, unknown> = {
    report,
    dashboardHtml: renderDashboard(report),
  };

  if (request.includeWorkbook) {
    response.workbookBase64 = (await buildWorkbookBuffer(report)).toString('base64');
  }

  return response;
}

async function handleGenerate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawBody = await readBody(req);
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawBody);
  } catch (err) {
    throw new HttpError(400, `Request body must be valid JSON: ${(err as Error).message}`);
  }

  const request = GenerateRequestSchema.safeParse(rawJson);
  if (!request.success) {
    throw new HttpError(400, request.error.issues.map((issue) => issue.message).join(' '));
  }
  const response = await buildApiResponse(request.data);
  sendJson(res, 200, response);
}

export async function requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (!req.url || !req.method) {
      sendJson(res, 400, { error: 'Malformed request.' });
      return;
    }

    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api') {
      sendJson(res, 200, { name: 'GovReady Lab API', status: 'ready', routes: ['GET /api/health', 'POST /api/generate'] });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      await handleGenerate(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/businesses') {
      sendJson(res, 200, { businesses: await bidService().store.listBusinesses() }); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/businesses') {
      const body = await readJson(req);
      const parsed = BusinessProfileSchema.safeParse(body.profile ?? body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' '));
      const saved = await bidService().saveBusiness(parsed.data, actor(req, body));
      sendJson(res, 201, { business: saved.profile }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/bids') {
      sendJson(res, 200, { bids: await bidService().store.listOpportunities() }); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/bids') {
      const body = await readJson(req);
      const parsed = OpportunityProjectSchema.safeParse(body.opportunity ?? body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' '));
      try { const saved = await bidService().saveOpportunity(parsed.data, actor(req, body)); sendJson(res, 201, { bid: saved.project }); }
      catch (err) { throw new HttpError(400, (err as Error).message); }
      return;
    }

    const bidMatch = url.pathname.match(/^\/api\/bids\/([^/]+)(?:\/(assess|prepare|compliance|artifacts|approve|status|readiness-review))?$/);
    if (bidMatch) {
      const projectId = decodeURIComponent(bidMatch[1]);
      const action = bidMatch[2];
      const service = bidService();
      let project;
      try { project = await service.store.getOpportunity(projectId); }
      catch { throw new HttpError(404, `Bid project ${projectId} was not found.`); }
      if (req.method === 'GET' && !action) { sendJson(res, 200, { bid: project }); return; }
      if (req.method === 'POST' && action === 'assess') {
        const body = await readJson(req);
        const parsed = SolicitationAnalysisSchema.safeParse(body.analysis);
        if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' '));
        const business = await service.store.getBusiness(project.businessId);
        const assessed = await service.assess(business, project, parsed.data, actor(req, body), { ratings: body.ratings as never });
        sendJson(res, 200, { assessment: assessed.result }); return;
      }
      if (req.method === 'POST' && action === 'prepare') {
        const body = await readJson(req);
        const parsed = SolicitationAnalysisSchema.safeParse(body.analysis);
        if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' '));
        const business = await service.store.getBusiness(project.businessId);
        const outputRoot = service.artifacts ? resolve(tmpdir(), 'govready-proposals') : resolve(process.env.GOVREADY_OUT_DIR || 'out');
        const prepared = await service.prepare({ business, opportunity: project, analysis: parsed.data, actor: actor(req, body), outputRoot, ratings: body.ratings as never });
        sendJson(res, 201, { workspaceDir: prepared.workspaceDir, manifest: prepared.manifest, files: prepared.files }); return;
      }
      if (req.method === 'POST' && action === 'approve') {
        const body = await readJson(req); const gate = String(body.gate ?? '');
        const allowed = ['bidNoBid', 'finalPricing', 'representationsAndCertifications', 'proposalRelease', 'submissionAuthorization'] as const;
        if (!allowed.includes(gate as typeof allowed[number])) throw new HttpError(400, `gate must be one of: ${allowed.join(', ')}`);
        const updated = await service.approveGate(projectId, gate as keyof typeof project.approvals, actor(req, body), typeof body.notes === 'string' ? body.notes : undefined);
        sendJson(res, 200, { bid: updated, submitted: false }); return;
      }
      if (req.method === 'POST' && action === 'status') {
        const body = await readJson(req);
        try { sendJson(res, 200, { bid: await service.changeStatus(projectId, String(body.status) as typeof project.status, actor(req, body)) }); }
        catch (err) { throw new HttpError(400, (err as Error).message); }
        return;
      }
      if (req.method === 'POST' && action === 'readiness-review') {
        const body = await readJson(req);
        if (typeof body.passed !== 'boolean' || !Array.isArray(body.findings) || !body.findings.every((item) => typeof item === 'string')) throw new HttpError(400, 'passed must be boolean and findings must be a string array.');
        const path = await service.recordSubmissionReadinessReview(projectId, actor(req, body), body.passed, body.findings as string[]);
        sendJson(res, 201, { artifact: path, submitted: false }); return;
      }
      if (req.method === 'GET' && action === 'artifacts') { sendJson(res, 200, await service.listArtifacts(projectId)); return; }
      if (req.method === 'GET' && action === 'compliance') {
        if (service.artifacts) {
          const content = await service.artifacts.readFileContent(projectId, 'compliance-matrix.json');
          if (!content) throw new HttpError(404, 'Compliance matrix has not been generated.');
          sendJson(res, 200, JSON.parse(content)); return;
        }
        const index = await service.listArtifacts(projectId) as { workspaceDir?: string };
        const path = index.workspaceDir ? resolve(index.workspaceDir, 'compliance-matrix.json') : '';
        if (!path || !existsSync(path)) throw new HttpError(404, 'Compliance matrix has not been generated.');
        sendJson(res, 200, JSON.parse(readFileSync(path, 'utf8'))); return;
      }
    }

    sendJson(res, 404, {
      error: 'Not found.',
      routes: ['GET /health', 'GET /api/health', 'POST /api/generate', 'GET|POST /api/businesses', 'GET|POST /api/bids', 'GET /api/bids/:id', 'POST /api/bids/:id/assess', 'POST /api/bids/:id/prepare', 'POST /api/bids/:id/approve', 'POST /api/bids/:id/status', 'POST /api/bids/:id/readiness-review', 'GET /api/bids/:id/compliance', 'GET /api/bids/:id/artifacts'],
    });
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.expose ? err.message : 'Request failed.' });
      return;
    }
    console.error(err);
    sendJson(res, 500, { error: 'Internal server error.' });
  }
}

export const server = createServer(requestHandler);

// Vercel's zero-config Node.js detection deploys this file directly as the
// project's single root Function when it finds a custom http.Server entry
// point here, bypassing the api/ directory entirely — it requires a default
// export shaped like a request handler.
export default requestHandler;

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  server.listen(PORT, HOST, () => {
    console.log(`GovReady API listening on http://${HOST}:${PORT}`);
  });
}
