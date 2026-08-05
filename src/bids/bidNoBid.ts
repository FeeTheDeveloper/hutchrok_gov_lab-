import { z } from 'zod';
import type { BusinessProfile } from '../business/schema.js';
import { hasVerifiedCertification } from '../business/schema.js';
import { daysBetween } from '../fitScore.js';
import { normalizeSetAside } from '../config.js';
import type { OpportunityProject, SolicitationAnalysis } from './schema.js';

export const BidAssessmentRatingsSchema = z.object({
  capabilityMatch: z.number().min(0).max(5).default(2.5),
  pastPerformanceMatch: z.number().min(0).max(5).default(2.5),
  geographicFit: z.number().min(0).max(5).default(2.5),
  staffingCapacity: z.number().min(0).max(5).default(2.5),
  equipmentCapacity: z.number().min(0).max(5).default(2.5),
  solicitationComplexity: z.number().min(0).max(5).default(2.5),
  competitionRisk: z.number().min(0).max(5).default(2.5),
  incumbentAdvantage: z.number().min(0).max(5).default(2.5),
  pricingConfidence: z.number().min(0).max(5).default(2.5),
  teamingAvailability: z.number().min(0).max(5).default(2.5),
  strategicAgencyAlignment: z.number().min(0).max(5).default(2.5),
  expectedContractValue: z.number().min(0).max(5).default(2.5),
  performanceRisk: z.number().min(0).max(5).default(2.5),
}).strict();
export type BidAssessmentRatings = z.infer<typeof BidAssessmentRatingsSchema>;

export const BidNoBidResultSchema = z.object({
  projectId: z.string(),
  assessedAt: z.string().datetime(),
  recommendedDecision: z.enum(['bid', 'conditional-bid', 'no-bid']),
  weightedScore: z.number().min(0).max(100),
  factorScores: z.record(z.object({ score: z.number(), weight: z.number(), weighted: z.number(), rationale: z.string() }).strict()),
  strengths: z.array(z.string()), weaknesses: z.array(z.string()), risks: z.array(z.string()),
  informationGaps: z.array(z.string()), requiredMitigationActions: z.array(z.string()),
  humanApproval: z.object({ status: z.enum(['pending', 'approved', 'rejected']), approvedBy: z.string().optional(), approvedAt: z.string().datetime().optional(), notes: z.string().optional() }).strict(),
  disclaimer: z.string(),
}).strict();
export type BidNoBidResult = z.infer<typeof BidNoBidResultSchema>;

const weights: Record<string, number> = {
  setAsideEligibility: 14, naicsAlignment: 7, pscAlignment: 3, capabilityMatch: 11,
  pastPerformanceMatch: 9, geographicFit: 4, staffingCapacity: 6, equipmentCapacity: 3,
  insuranceAndBonding: 5, deadlineRunway: 8, solicitationComplexity: 4, competitionRisk: 4,
  incumbentAdvantage: 3, pricingConfidence: 5, teamingAvailability: 3,
  strategicAgencyAlignment: 4, expectedContractValue: 2, performanceRisk: 5,
};

function verifiedSetAsideEligible(profile: BusinessProfile, raw: string): boolean | null {
  switch (normalizeSetAside(raw, raw)) {
    case 'OPEN': return true;
    case 'SB': return hasVerifiedCertification(profile, 'smallBusiness');
    case 'SDVOSB': return hasVerifiedCertification(profile, 'sdvosb');
    case 'VOSB': return hasVerifiedCertification(profile, 'vosb') || hasVerifiedCertification(profile, 'sdvosb');
    case 'WOSB': return hasVerifiedCertification(profile, 'wosb') || hasVerifiedCertification(profile, 'edwosb');
    case 'EDWOSB': return hasVerifiedCertification(profile, 'edwosb');
    case 'HUBZONE': return hasVerifiedCertification(profile, 'hubzone');
    case 'EIGHT_A': return hasVerifiedCertification(profile, 'eightA');
    default: return null;
  }
}

function alignment(value: string | undefined, accepted: string[]): number {
  if (!value) return 2.5;
  return accepted.some((candidate) => candidate === value || candidate.startsWith(value) || value.startsWith(candidate)) ? 5 : 0;
}

function deadlineRating(deadline: string | undefined, today: string): number {
  const days = daysBetween(today, deadline?.slice(0, 10) ?? null);
  if (days === null) return 2;
  if (days < 0) return 0;
  if (days <= 3) return 1;
  if (days <= 7) return 2;
  if (days <= 14) return 3;
  if (days <= 45) return 5;
  return 4;
}

export interface AssessBidOptions {
  ratings?: Partial<BidAssessmentRatings>;
  today?: string;
  actor?: string;
}

export function assessBid(
  business: BusinessProfile,
  opportunity: OpportunityProject,
  analysis: SolicitationAnalysis,
  options: AssessBidOptions = {},
): BidNoBidResult {
  if (business.businessId !== opportunity.businessId) throw new Error('Opportunity is linked to a different business profile.');
  if (analysis.projectId !== opportunity.projectId) throw new Error('Solicitation analysis is linked to a different opportunity project.');

  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const ratings = BidAssessmentRatingsSchema.parse(options.ratings ?? {});
  const eligibility = verifiedSetAsideEligible(business, opportunity.setAside);
  const insuranceBonding = analysis.bondingRequirements.length
    ? (business.readiness.insurance && business.readiness.bonding ? 5 : 0)
    : business.readiness.insurance ? 5 : 2.5;
  const values: Record<string, { score: number; rationale: string }> = {
    setAsideEligibility: { score: eligibility === true ? 5 : eligibility === false ? 0 : 2, rationale: eligibility === true ? 'Verified certification supports eligibility.' : eligibility === false ? 'Required set-aside is not verified for this business.' : 'Eligibility requires human verification.' },
    naicsAlignment: { score: alignment(opportunity.naics, [business.serviceAlignment.primaryNaics, ...business.serviceAlignment.secondaryNaics]), rationale: 'Compared with primary and secondary NAICS.' },
    pscAlignment: { score: alignment(opportunity.psc, business.serviceAlignment.pscCodes), rationale: 'Compared with approved PSC alignment.' },
    capabilityMatch: { score: ratings.capabilityMatch, rationale: 'Analyst-rated capability fit.' },
    pastPerformanceMatch: { score: ratings.pastPerformanceMatch, rationale: 'Analyst-rated verified past-performance relevance.' },
    geographicFit: { score: ratings.geographicFit, rationale: 'Analyst-rated place-of-performance fit.' },
    staffingCapacity: { score: ratings.staffingCapacity, rationale: 'Analyst-rated staffing capacity.' },
    equipmentCapacity: { score: ratings.equipmentCapacity, rationale: 'Analyst-rated equipment capacity.' },
    insuranceAndBonding: { score: insuranceBonding, rationale: 'Compared requirements with readiness flags.' },
    deadlineRunway: { score: deadlineRating(analysis.responseDeadline ?? opportunity.responseDeadline, today), rationale: 'Calculated from the response deadline.' },
    solicitationComplexity: { score: 5 - ratings.solicitationComplexity, rationale: 'Lower complexity produces a stronger score.' },
    competitionRisk: { score: 5 - ratings.competitionRisk, rationale: 'Lower competition risk produces a stronger score.' },
    incumbentAdvantage: { score: 5 - ratings.incumbentAdvantage, rationale: 'Lower incumbent advantage produces a stronger score.' },
    pricingConfidence: { score: ratings.pricingConfidence, rationale: 'Analyst-rated pricing confidence.' },
    teamingAvailability: { score: ratings.teamingAvailability, rationale: 'Analyst-rated teaming availability.' },
    strategicAgencyAlignment: { score: ratings.strategicAgencyAlignment, rationale: 'Analyst-rated strategic agency alignment.' },
    expectedContractValue: { score: ratings.expectedContractValue, rationale: 'Analyst-rated value relative to effort.' },
    performanceRisk: { score: 5 - ratings.performanceRisk, rationale: 'Lower performance risk produces a stronger score.' },
  };
  const factorScores: BidNoBidResult['factorScores'] = {};
  let total = 0;
  for (const [name, value] of Object.entries(values)) {
    const weight = weights[name];
    const weighted = Math.round((value.score / 5) * weight * 10) / 10;
    factorScores[name] = { ...value, weight, weighted }; total += weighted;
  }
  const weightedScore = Math.max(0, Math.min(100, Math.round(total)));
  const hardNoBid = eligibility === false || deadlineRating(analysis.responseDeadline ?? opportunity.responseDeadline, today) === 0;
  const recommendedDecision = hardNoBid || weightedScore < 50 ? 'no-bid' : weightedScore >= 70 ? 'bid' : 'conditional-bid';
  const strengths = Object.entries(factorScores).filter(([, value]) => value.score >= 4).map(([name, value]) => `${name}: ${value.rationale}`);
  const weaknesses = Object.entries(factorScores).filter(([, value]) => value.score < 2).map(([name, value]) => `${name}: ${value.rationale}`);
  const informationGaps = Object.entries(factorScores).filter(([, value]) => value.score === 2.5 || value.score === 2).map(([name]) => `Validate ${name.replace(/([A-Z])/g, ' $1').toLowerCase()}.`);
  const risks = [...analysis.identifiedRisks, ...weaknesses];
  const requiredMitigationActions = [...new Set([
    ...informationGaps.map((gap) => `Close gap: ${gap}`),
    ...(eligibility !== true ? ['Obtain written verification of set-aside eligibility before pursuit approval.'] : []),
    ...(analysis.clarificationQuestions.length ? ['Resolve open solicitation clarification questions.'] : []),
  ])];
  return BidNoBidResultSchema.parse({
    projectId: opportunity.projectId, assessedAt: new Date().toISOString(), recommendedDecision,
    weightedScore, factorScores, strengths, weaknesses, risks, informationGaps, requiredMitigationActions,
    humanApproval: opportunity.approvals.bidNoBid,
    disclaimer: 'Recommendation only. A named human approver must authorize pursuit; this assessment does not commit Hutchrok or the business.',
  });
}
