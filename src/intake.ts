import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Intake } from './types.js';

const certStatus = z.union([
  z.enum(['complete', 'in_progress', 'not_started']),
  z.boolean(),
]);

/**
 * Zod schema for the intake JSON. Field names track the Part 1 Federal
 * Readiness Assessment so a web intake form (Phase 2) can post the same shape.
 */
export const IntakeSchema = z.object({
  company: z.string().min(1),
  entityType: z.string().optional(),
  state: z.string().min(1),
  yearFounded: z.number().int().optional(),
  uei: z.string().optional(),
  cage: z.string().optional(),
  employees: z.string().optional(),
  revenueRange: z.string().optional(),

  certifications: z
    .object({
      smallBusiness: z.boolean().default(true),
      sdvosb: z.boolean().default(false),
      vosb: z.boolean().default(false),
      wosb: z.boolean().default(false),
      edwosb: z.boolean().default(false),
      eightA: z.boolean().default(false),
      hubzone: z.boolean().default(false),
    })
    .default({}),

  naicsLanes: z.array(z.string()).min(1, 'At least one NAICS lane is required'),
  strengths: z.string().default(''),
  strengthKeywords: z.array(z.string()).optional(),
  geographicRange: z.string().optional(),
  interestedIn: z.enum(['contracts', 'grants', 'both']).optional(),
  revenueGoal: z.string().optional(),

  readiness: z
    .object({
      samRegistered: z.boolean().default(false),
      ueiCage: z.boolean().default(false),
      repsAndCerts: z.boolean().default(false),
      vetCertVerification: certStatus.default('not_started'),
      capabilityStatement: z.boolean().default(false),
      pastPerformanceFile: z.boolean().default(false),
      financialStatements: z.boolean().default(false),
      grantReadiness: z.boolean().default(false),
    })
    .default({}),
});

export function parseIntake(raw: unknown): Intake {
  const parsed = IntakeSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Intake failed validation:\n${issues}`);
  }
  // Normalize NAICS to bare 6-digit strings where possible.
  parsed.data.naicsLanes = parsed.data.naicsLanes.map((n) => n.trim());
  return parsed.data as Intake;
}

export function loadIntake(path: string): Intake {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read/parse intake JSON at ${path}: ${(err as Error).message}`);
  }
  return parseIntake(raw);
}

/**
 * Derive strength-matching keywords from the free-text strengths plus any
 * explicit keyword list. Lower-cased, de-duplicated, short/stop words dropped.
 */
export function strengthKeywords(intake: Intake): string[] {
  const stop = new Set([
    'and', 'the', 'for', 'with', 'our', 'we', 'are', 'you', 'your', 'from',
    'that', 'this', 'have', 'has', 'services', 'service', 'support', 'business',
    'company', 'able', 'can', 'will', 'all', 'per',
  ]);
  const fromText = (intake.strengths || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !stop.has(w));
  const explicit = (intake.strengthKeywords || []).map((k) => k.toLowerCase().trim());
  return [...new Set([...explicit, ...fromText])];
}
