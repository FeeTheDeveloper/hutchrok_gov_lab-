import type { IncomingMessage, ServerResponse } from 'node:http';

export default function index(_req: IncomingMessage, res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    name: 'GovReady Lab API',
    status: 'ready',
    routes: ['GET /api/health', 'POST /api/generate'],
  }));
}
