// Claude connector — the in-app assistant, powered by the official Anthropic SDK.
// Streams responses over SSE so long answers render as they generate.
//
// Configuration: set ANTHROPIC_API_KEY in the environment (or run `ant auth login`;
// the SDK resolves credentials automatically when the constructor gets no key).

import type { ServerResponse } from 'node:http';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-8';

let client: Anthropic | null = null;

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Find the most recently generated report.json under outDir (written by
 * `govready generate --json`) so the assistant can answer questions about the
 * client's actual pipeline instead of speaking generically.
 */
export function latestReportContext(outDir: string): string {
  try {
    if (!existsSync(outDir)) return '';
    let newest: { path: string; mtime: number } | null = null;
    for (const entry of readdirSync(outDir)) {
      const p = join(outDir, entry, 'report.json');
      if (existsSync(p)) {
        const mtime = statSync(p).mtimeMs;
        if (!newest || mtime > newest.mtime) newest = { path: p, mtime };
      }
    }
    if (!newest) return '';
    const raw = JSON.parse(readFileSync(newest.path, 'utf8'));
    // Trim to what the assistant needs: intake profile, stats, top opportunities.
    const slim = {
      company: raw.intake?.company,
      naicsLanes: raw.intake?.naicsLanes,
      certifications: raw.intake?.certifications,
      today: raw.today,
      stats: raw.stats,
      topOpportunities: (raw.opportunities ?? []).slice(0, 25).map((o: Record<string, unknown>) => ({
        title: o.title,
        agency: o.agency,
        naics: o.naics,
        score: o.score,
        tier: o.tier,
        eligible: o.eligible,
        action: o.action,
        responseDeadline: o.responseDeadline,
        reasons: o.reasons,
      })),
      grants: raw.grants,
    };
    return `\n\nThe most recent Contract Map report (from ${newest.path}) is:\n${JSON.stringify(slim)}`;
  } catch {
    return '';
  }
}

function systemPrompt(outDir: string): string {
  return (
    `You are the GovReady Lab assistant, embedded in the Hutchrok Solutions Group client portal. ` +
    `Hutchrok Solutions Group LLC (McKinney, TX, veteran-owned) runs the GovReady Lab service line: it takes a ` +
    `client intake plus SAM.gov CSV exports and produces a fit-scored Contract Map (opportunities scored 0-100 on ` +
    `opportunity type, set-aside eligibility, deadline runway, and strength match, then tiered Pursue / Qualify / ` +
    `Monitor / Intel) and a grant positioning panel.\n\n` +
    `Help the consultant interpret contract maps, draft capability statements and outreach, explain SAM.gov ` +
    `concepts (set-asides, NAICS, sources sought, presolicitation), and plan next moves for clients.\n\n` +
    `Compliance guardrails you must respect: this is operational business consulting — not legal, tax, or financial ` +
    `advice; never guarantee award outcomes; always tell users to verify requirements against the official SAM.gov ` +
    `or Grants.gov notice; non-veteran clients receive consulting expertise, never veteran-specific benefits or ` +
    `set-aside eligibility.` +
    latestReportContext(outDir)
  );
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Stream a chat completion to the response as Server-Sent Events. */
export async function streamChat(res: ServerResponse, turns: ChatTurn[], outDir: string): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const stream = getClient().messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: systemPrompt(outDir),
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    });

    stream.on('text', (delta) => send('delta', { text: delta }));

    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      send('error', { message: 'The assistant declined this request.' });
    }
    send('done', { stop_reason: final.stop_reason });
  } catch (err) {
    const message = err instanceof Anthropic.APIError ? `Claude API error ${err.status}: ${err.message}` : String(err);
    send('error', { message });
  } finally {
    res.end();
  }
}
