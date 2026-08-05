import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const OpportunityStatusSchema = z.enum([
  'discovered', 'qualifying', 'bid-review', 'pursuing', 'capture', 'drafting',
  'internal-review', 'submission-ready', 'submitted', 'awarded', 'lost',
  'archived', 'no-bid',
]);
export type OpportunityStatus = z.infer<typeof OpportunityStatusSchema>;

export const HumanGateSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  approvedBy: z.string().trim().min(1).optional(),
  approvedAt: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
}).strict().superRefine((gate, ctx) => {
  if (gate.status === 'approved' && (!gate.approvedBy || !gate.approvedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Approved gates require approvedBy and approvedAt.' });
  }
});
export type HumanGate = z.infer<typeof HumanGateSchema>;

const pendingGate = { status: 'pending' as const };

export const OpportunityProjectSchema = z.object({
  projectId: z.string().trim().min(2).regex(/^[a-zA-Z0-9._-]+$/),
  businessId: z.string().trim().min(2),
  noticeId: z.string().trim().min(1),
  solicitationNumber: z.string().trim().optional(),
  title: z.string().trim().min(1),
  agency: z.string().trim().min(1),
  subAgency: z.string().trim().optional(),
  contractingOffice: z.string().trim().optional(),
  naics: z.string().trim().optional(),
  psc: z.string().trim().optional(),
  setAside: z.string().trim().default('OPEN'),
  opportunityType: z.string().trim().min(1),
  postedDate: z.string().date().optional(),
  questionsDeadline: z.string().datetime().or(z.string().date()).optional(),
  responseDeadline: z.string().datetime().or(z.string().date()).optional(),
  anticipatedAwardDate: z.string().date().optional(),
  placeOfPerformance: z.string().trim().optional(),
  contractType: z.string().trim().optional(),
  periodOfPerformance: z.string().trim().optional(),
  estimatedValue: z.object({ min: z.number().nonnegative().optional(), max: z.number().nonnegative().optional(), currency: z.string().default('USD') }).strict().optional(),
  sourceUrl: z.string().url(),
  currentAmendmentNumber: z.string().trim().optional(),
  status: OpportunityStatusSchema.default('discovered'),
  fitScore: z.number().min(0).max(100),
  eligibilityStatus: z.enum(['eligible', 'ineligible', 'needs-verification']),
  bidDecision: z.enum(['pending', 'bid', 'no-bid']).default('pending'),
  decisionRationale: z.string().trim().optional(),
  probabilityOfWin: z.number().min(0).max(100).optional(),
  assignedOwner: z.string().trim().min(1),
  assignedContributors: z.array(z.string().trim().min(1)).default([]),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  approvals: z.object({
    bidNoBid: HumanGateSchema.default(pendingGate),
    finalPricing: HumanGateSchema.default(pendingGate),
    representationsAndCertifications: HumanGateSchema.default(pendingGate),
    proposalRelease: HumanGateSchema.default(pendingGate),
    submissionAuthorization: HumanGateSchema.default(pendingGate),
  }).strict().default({
    bidNoBid: pendingGate,
    finalPricing: pendingGate,
    representationsAndCertifications: pendingGate,
    proposalRelease: pendingGate,
    submissionAuthorization: pendingGate,
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((project, ctx) => {
  const active = ['pursuing', 'capture', 'drafting', 'internal-review', 'submission-ready', 'submitted'];
  if (active.includes(project.status) && project.approvals.bidNoBid.status !== 'approved') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['approvals', 'bidNoBid'], message: 'Human Bid / No-Bid approval is required before pursuing.' });
  }
  if (project.status === 'submitted' && project.approvals.submissionAuthorization.status !== 'approved') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['approvals', 'submissionAuthorization'], message: 'Human submission authorization is required before submitted status.' });
  }
});
export type OpportunityProject = z.infer<typeof OpportunityProjectSchema>;

export const SolicitationAnalysisSchema = z.object({
  projectId: z.string().trim().min(2),
  analyzedAt: z.string().datetime(),
  analyzedBy: z.string().trim().min(1),
  sourceArtifacts: z.array(z.string()).default([]),
  scopeSummary: z.string().default(''),
  statementOfWorkSummary: z.string().default(''),
  performanceRequirements: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  submissionInstructions: z.array(z.string()).default([]),
  evaluationFactors: z.array(z.object({ name: z.string(), weight: z.string().optional(), details: z.string() }).strict()).default([]),
  mandatoryRequirements: z.array(z.string()).default([]),
  pageLimits: z.array(z.object({ section: z.string(), limit: z.number().int().positive() }).strict()).default([]),
  formattingRules: z.array(z.string()).default([]),
  requiredForms: z.array(z.string()).default([]),
  requiredCertifications: z.array(z.string()).default([]),
  farClauses: z.array(z.string()).default([]),
  dfarsClauses: z.array(z.string()).default([]),
  agencySpecificClauses: z.array(z.string()).default([]),
  questionsDeadline: z.string().datetime().or(z.string().date()).optional(),
  responseDeadline: z.string().datetime().or(z.string().date()).optional(),
  amendmentRequirements: z.array(z.string()).default([]),
  pricingInstructions: z.array(z.string()).default([]),
  pastPerformanceRequirements: z.array(z.string()).default([]),
  staffingRequirements: z.array(z.string()).default([]),
  securityRequirements: z.array(z.string()).default([]),
  insuranceRequirements: z.array(z.string()).default([]),
  bondingRequirements: z.array(z.string()).default([]),
  subcontractingRequirements: z.array(z.string()).default([]),
  siteVisitRequirements: z.array(z.string()).default([]),
  oralPresentationRequirements: z.array(z.string()).default([]),
  identifiedRisks: z.array(z.string()).default([]),
  clarificationQuestions: z.array(z.string()).default([]),
}).strict();
export type SolicitationAnalysis = z.infer<typeof SolicitationAnalysisSchema>;

export function parseOpportunityProject(raw: unknown): OpportunityProject { return OpportunityProjectSchema.parse(raw); }
export function parseSolicitationAnalysis(raw: unknown): SolicitationAnalysis { return SolicitationAnalysisSchema.parse(raw); }
export function loadOpportunityProject(path: string): OpportunityProject { return parseOpportunityProject(JSON.parse(readFileSync(path, 'utf8'))); }
export function loadSolicitationAnalysis(path: string): SolicitationAnalysis { return parseSolicitationAnalysis(JSON.parse(readFileSync(path, 'utf8'))); }
