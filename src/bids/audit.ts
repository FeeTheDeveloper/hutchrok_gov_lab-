import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const AuditEventSchema = z.object({
  eventId: z.string().uuid(), timestamp: z.string().datetime(), actor: z.string().min(1),
  businessId: z.string().min(1), opportunityId: z.string().optional(), action: z.string().min(1),
  summary: z.string().min(1), affectedArtifact: z.string().optional(), previousState: z.unknown().optional(), newState: z.unknown().optional(),
}).strict();
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export function createAuditEvent(input: Omit<AuditEvent, 'eventId' | 'timestamp'>, now = new Date().toISOString()): AuditEvent {
  return AuditEventSchema.parse({ eventId: randomUUID(), timestamp: now, ...input });
}

export function appendAuditEvent(dataDir: string, event: AuditEvent): string {
  const dir = join(dataDir, 'audit'); mkdirSync(dir, { recursive: true });
  const path = join(dir, `${event.timestamp.slice(0, 10)}.jsonl`);
  appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8');
  return path;
}

export function readAuditEvents(path: string): AuditEvent[] {
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => AuditEventSchema.parse(JSON.parse(line)));
}
