import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { renderDashboard } from './dashboard.js';
import { buildWorkbookBuffer } from './excel.js';
import { buildReport } from './fitScore.js';
import { parseIntake } from './intake.js';
import { fetchContractsFromSamApi } from './samApi.js';
import { parseAssistanceCsv, parseContractsCsv } from './samParser.js';

const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 5 * 1024 * 1024;

const GenerateRequestSchema = z.object({
  intake: z.unknown(),
  contractsCsv: z.string().min(1).optional(),
  assistanceCsv: z.string().optional(),
  samApi: z.object({
    apiKey: z.string().min(1).optional(),
    endpoint: z.string().url().optional(),
    pageSize: z.number().int().positive().optional(),
    maxPages: z.number().int().positive().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeWorkbook: z.boolean().optional(),
}).superRefine((value, ctx) => {
  const hasContractsCsv = typeof value.contractsCsv === 'string' && value.contractsCsv.trim() !== '';
  const hasSamApi = value.samApi !== undefined;
  if (hasContractsCsv === hasSamApi) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one contract source: contractsCsv or samApi.',
      path: ['contractsCsv'],
    });
  }
});

type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  setCorsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
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
    if (total > MAX_BODY_BYTES) throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes.`);
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function buildApiResponse(request: GenerateRequest) {
  const intake = parseIntake(request.intake);
  const opportunities = request.contractsCsv
    ? parseContractsCsv(request.contractsCsv)
    : await (async () => {
      const apiKey = request.samApi?.apiKey || process.env.SAM_GOV_API_KEY;
      if (!apiKey) {
        throw new Error('samApi requests require samApi.apiKey or SAM_GOV_API_KEY in the server environment.');
      }
      return fetchContractsFromSamApi({
        apiKey,
        endpoint: request.samApi?.endpoint,
        pageSize: request.samApi?.pageSize,
        maxPages: request.samApi?.maxPages,
        dateFrom: request.samApi?.dateFrom,
        dateTo: request.samApi?.dateTo,
        naicsLanes: intake.naicsLanes,
      });
    })();

  const listings = request.assistanceCsv ? parseAssistanceCsv(request.assistanceCsv) : [];
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
    throw new Error(`Request body must be valid JSON: ${(err as Error).message}`);
  }

  const request = GenerateRequestSchema.parse(rawJson);
  const response = await buildApiResponse(request);
  sendJson(res, 200, response);
}

const server = createServer(async (req, res) => {
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

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      await handleGenerate(req, res);
      return;
    }

    sendJson(res, 404, {
      error: 'Not found.',
      routes: ['GET /health', 'POST /api/generate'],
    });
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`GovReady API listening on http://localhost:${PORT}`);
});
