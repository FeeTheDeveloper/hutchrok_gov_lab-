import { z } from 'zod';
import type { BusinessProfile } from '../business/schema.js';
import type { BidNoBidResult } from './bidNoBid.js';
import type { OpportunityProject, SolicitationAnalysis } from './schema.js';

const placeholder = (label: string) => `[REQUIRED INPUT: ${label}]`;
export const CapturePlanSchema = z.object({
  projectId: z.string(), generatedAt: z.string().datetime(), draftStatus: z.literal('DO NOT SUBMIT — DRAFT'),
  opportunityOverview: z.string(), customerMission: z.string(), customerPainPoints: z.array(z.string()),
  acquisitionTimeline: z.array(z.object({ milestone: z.string(), date: z.string() }).strict()),
  incumbentInformation: z.string(), knownCompetitors: z.array(z.string()), strengths: z.array(z.string()), weaknesses: z.array(z.string()),
  discriminators: z.array(z.string()), winThemes: z.array(z.string()), teamingStrategy: z.string(), relationshipStrategy: z.string(),
  pricingStrategy: z.string(), solutionStrategy: z.string(), riskRegister: z.array(z.object({ risk: z.string(), mitigation: z.string(), owner: z.string() }).strict()),
  actionPlan: z.array(z.object({ action: z.string(), owner: z.string(), dueDate: z.string() }).strict()),
  decisionGates: z.array(z.object({ gate: z.string(), status: z.string(), approver: z.string() }).strict()),
  submissionCalendar: z.array(z.object({ event: z.string(), date: z.string() }).strict()), officialInstructionsControl: z.literal(true),
}).strict();
export type CapturePlan = z.infer<typeof CapturePlanSchema>;

export function generateCapturePlan(business: BusinessProfile, opportunity: OpportunityProject, analysis: SolicitationAnalysis, assessment: BidNoBidResult): CapturePlan {
  return CapturePlanSchema.parse({
    projectId: opportunity.projectId, generatedAt: new Date().toISOString(), draftStatus: 'DO NOT SUBMIT — DRAFT',
    opportunityOverview: `${opportunity.title} · ${opportunity.agency} · ${opportunity.solicitationNumber ?? opportunity.noticeId}`,
    customerMission: placeholder('Validate the customer mission from authoritative agency sources'),
    customerPainPoints: [placeholder('Document validated customer pain points and supporting evidence')],
    acquisitionTimeline: [
      ...(opportunity.questionsDeadline ? [{ milestone: 'Questions deadline', date: opportunity.questionsDeadline }] : []),
      ...(opportunity.responseDeadline ? [{ milestone: 'Response deadline', date: opportunity.responseDeadline }] : []),
      ...(opportunity.anticipatedAwardDate ? [{ milestone: 'Anticipated award', date: opportunity.anticipatedAwardDate }] : []),
    ],
    incumbentInformation: placeholder('Identify and verify incumbent information'), knownCompetitors: [placeholder('Identify known competitors from verified sources')],
    strengths: assessment.strengths, weaknesses: assessment.weaknesses,
    discriminators: business.serviceAlignment.differentiators.length ? business.serviceAlignment.differentiators : [placeholder('Define evidence-backed discriminators')],
    winThemes: [placeholder('Develop win themes tied to evaluation factors and verified strengths')],
    teamingStrategy: business.readiness.teamingPartners ? placeholder('Name approved teaming partners and roles') : placeholder('Determine whether teaming is required and obtain approval'),
    relationshipStrategy: placeholder('Document compliant customer engagement plan; do not imply unverified relationships'),
    pricingStrategy: placeholder('Develop pricing strategy; requires final human pricing approval'),
    solutionStrategy: analysis.scopeSummary || placeholder('Develop solution strategy from verified solicitation scope'),
    riskRegister: assessment.risks.map((risk) => ({ risk, mitigation: placeholder('Define mitigation'), owner: opportunity.assignedOwner })),
    actionPlan: assessment.requiredMitigationActions.map((action) => ({ action, owner: opportunity.assignedOwner, dueDate: placeholder('Assign due date') })),
    decisionGates: Object.entries(opportunity.approvals).map(([gate, approval]) => ({ gate, status: approval.status, approver: approval.approvedBy ?? placeholder('Assign human approver') })),
    submissionCalendar: opportunity.responseDeadline ? [{ event: 'Final response deadline', date: opportunity.responseDeadline }] : [{ event: 'Final response deadline', date: placeholder('Confirm from official solicitation') }],
    officialInstructionsControl: true,
  });
}

export function renderCapturePlan(plan: CapturePlan): string {
  const list = (values: string[]) => values.map((value) => `- ${value}`).join('\n') || '- [REQUIRED INPUT: Complete this section]';
  return `# DO NOT SUBMIT — DRAFT\n\n# Capture Plan\n\n> Official solicitation instructions and amendments control. Verify every item against the source.\n\n## Opportunity Overview\n\n${plan.opportunityOverview}\n\n## Customer Mission\n\n${plan.customerMission}\n\n## Customer Pain Points\n\n${list(plan.customerPainPoints)}\n\n## Incumbent and Competition\n\n- Incumbent: ${plan.incumbentInformation}\n- Competitors:\n${list(plan.knownCompetitors)}\n\n## Strengths\n\n${list(plan.strengths)}\n\n## Weaknesses\n\n${list(plan.weaknesses)}\n\n## Discriminators\n\n${list(plan.discriminators)}\n\n## Win Themes\n\n${list(plan.winThemes)}\n\n## Teaming Strategy\n\n${plan.teamingStrategy}\n\n## Relationship Strategy\n\n${plan.relationshipStrategy}\n\n## Pricing Strategy\n\n${plan.pricingStrategy}\n\n## Solution Strategy\n\n${plan.solutionStrategy}\n\n## Risk Register\n\n${plan.riskRegister.map((r) => `- **${r.risk}** — ${r.mitigation} (Owner: ${r.owner})`).join('\n') || '- No risks entered; analyst review required.'}\n\n## Action Plan\n\n${plan.actionPlan.map((a) => `- ${a.action} — ${a.owner} — ${a.dueDate}`).join('\n') || '- [REQUIRED INPUT: Add capture actions]'}\n\n## Decision Gates\n\n${plan.decisionGates.map((g) => `- ${g.gate}: **${g.status}** — ${g.approver}`).join('\n')}\n\n## Submission Calendar\n\n${plan.submissionCalendar.map((e) => `- ${e.event}: ${e.date}`).join('\n')}\n`;
}
