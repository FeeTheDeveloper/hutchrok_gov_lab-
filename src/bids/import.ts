import { randomUUID } from 'node:crypto';
import type { BusinessProfile } from '../business/schema.js';
import type { Report, ScoredOpportunity } from '../types.js';
import { OpportunityProjectSchema, type OpportunityProject } from './schema.js';

export function projectFromScoredOpportunity(
  business: BusinessProfile,
  opportunity: ScoredOpportunity,
  assignedOwner: string,
  now = new Date().toISOString(),
): OpportunityProject {
  return OpportunityProjectSchema.parse({
    projectId: `${business.businessId}-${opportunity.noticeId || randomUUID()}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-'),
    businessId: business.businessId,
    noticeId: opportunity.noticeId,
    title: opportunity.title,
    agency: opportunity.agency || 'Agency not provided',
    contractingOffice: opportunity.office || undefined,
    naics: opportunity.naics || undefined,
    setAside: opportunity.rawSetAside || opportunity.setAside,
    opportunityType: opportunity.rawType || opportunity.type,
    postedDate: opportunity.postedDate ?? undefined,
    responseDeadline: opportunity.responseDeadline ?? undefined,
    placeOfPerformance: opportunity.popState || undefined,
    sourceUrl: opportunity.link || `https://sam.gov/opp/${encodeURIComponent(opportunity.noticeId)}/view`,
    status: 'discovered', fitScore: opportunity.score,
    eligibilityStatus: opportunity.eligible ? 'eligible' : 'ineligible',
    bidDecision: 'pending', assignedOwner, assignedContributors: [],
    riskLevel: opportunity.daysToDeadline !== null && opportunity.daysToDeadline <= 7 ? 'high' : 'medium',
    createdAt: now, updatedAt: now,
  });
}

export function findScoredOpportunity(report: Report, noticeId: string): ScoredOpportunity {
  const found = report.opportunities.find((item) => item.noticeId.toLowerCase() === noticeId.toLowerCase());
  if (!found) throw new Error(`Notice ID ${noticeId} was not found in the scored report.`);
  return found;
}
