import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BusinessProfile, ProposalAssetSchema } from '../business/schema.js';
import type { BidNoBidResult } from '../bids/bidNoBid.js';
import type { CapturePlan } from '../bids/capture.js';
import { renderCapturePlan } from '../bids/capture.js';
import type { ComplianceMatrix } from '../bids/compliance.js';
import { writeComplianceMatrix } from '../bids/compliance.js';
import type { OpportunityProject, SolicitationAnalysis } from '../bids/schema.js';
import { MarkdownTemplateRenderer, REQUIRED_INPUT } from './renderer.js';
import type { ProposalManifest, TemplateRenderer } from './types.js';
import { ProposalManifestSchema } from './types.js';

type Asset = { content: string; verified: boolean } | undefined;

export interface ProposalPackageInput {
  business: BusinessProfile;
  opportunity: OpportunityProject;
  analysis: SolicitationAnalysis;
  assessment: BidNoBidResult;
  complianceMatrix: ComplianceMatrix;
  capturePlan: CapturePlan;
}

export interface ProposalPackageResult {
  workspaceDir: string;
  manifest: ProposalManifest;
  files: string[];
}

const safeSegment = (value: string) => value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'record';
const verifiedAsset = (asset: Asset, missing: string) => asset?.verified ? asset.content : REQUIRED_INPUT(missing);
const bullets = (values: string[], missing: string) => values.length ? values.map((value) => `- ${value}`).join('\n') : `- ${REQUIRED_INPUT(missing)}`;

export class ProposalPackageBuilder {
  constructor(private readonly renderer: TemplateRenderer = new MarkdownTemplateRenderer()) {}

  async build(input: ProposalPackageInput, outputRoot: string): Promise<ProposalPackageResult> {
    const { business, opportunity, analysis, assessment, complianceMatrix, capturePlan } = input;
    if (business.businessId !== opportunity.businessId || opportunity.projectId !== analysis.projectId) {
      throw new Error('Proposal inputs do not belong to the same business and opportunity project.');
    }
    const workspaceDir = resolve(outputRoot, safeSegment(business.businessId), safeSegment(opportunity.projectId), 'proposal');
    mkdirSync(workspaceDir, { recursive: true });
    const refs = complianceMatrix.requirements.slice(0, 20).map((item) => `${item.requirementId} · ${item.sourceSection}`);
    const assets = business.proposalAssets;
    const documents: Record<string, string> = {
      'executive-summary.md': this.renderer.render({
        title: 'Executive Summary', instructions: 'Tie the verified solution and discriminators directly to the customer mission and evaluation factors. Do not claim relationships, outcomes, or credentials without evidence.', complianceReferences: refs,
        body: `## Company\n\n${business.legalBusinessName}${business.dba ? ` (DBA ${business.dba})` : ''}\n\n## Verified Company Overview\n\n${verifiedAsset(assets.companyOverview, 'Insert a verified company overview')}\n\n## Customer Need\n\n${REQUIRED_INPUT('Summarize the validated customer need')}\n\n## Proposed Value\n\n${REQUIRED_INPUT('Draft an evidence-backed value proposition tied to evaluation factors')}\n`,
      }),
      'technical-approach.md': this.renderer.render({
        title: 'Technical Approach', instructions: 'Respond to the performance requirements and SOW using only verified capabilities. Map each subsection to compliance requirements.', complianceReferences: refs,
        body: `## Scope Understanding\n\n${analysis.scopeSummary || REQUIRED_INPUT('Validate and summarize the solicitation scope')}\n\n## Approach\n\n${verifiedAsset(assets.reusableTechnicalApproach, 'Insert a verified technical approach for this scope')}\n\n## Performance Requirements\n\n${bullets(analysis.performanceRequirements, 'Extract performance requirements from the official solicitation')}\n`,
      }),
      'management-plan.md': this.renderer.render({ title: 'Management Plan', instructions: 'Describe governance, communications, controls, and accountability without naming unconfirmed personnel.', complianceReferences: refs, body: `## Management Approach\n\n${verifiedAsset(assets.managementApproach, 'Insert a verified management approach')}\n\n## Governance and Communications\n\n${REQUIRED_INPUT('Define project governance, communications cadence, and escalation path')}\n` }),
      'staffing-plan.md': this.renderer.render({ title: 'Staffing Plan', instructions: 'Use only approved personnel and verified resumes. Do not invent labor categories or credentials.', complianceReferences: refs, body: `## Staffing Requirements\n\n${bullets(analysis.staffingRequirements, 'Extract staffing requirements')}\n\n## Proposed Personnel\n\n${assets.keyPersonnelResumes.filter((record) => record.verified).length ? assets.keyPersonnelResumes.filter((record) => record.verified).map((record) => `- ${record.personName} — verified resume: ${record.filePath}`).join('\n') : `- ${REQUIRED_INPUT('Identify approved key personnel and attach verified resumes')}`}\n` }),
      'quality-control-plan.md': this.renderer.render({ title: 'Quality Control Plan', instructions: 'Explain measurable controls, inspection, corrective action, and reporting tied to requirements.', complianceReferences: refs, body: `## Quality-Control Approach\n\n${verifiedAsset(assets.qualityControlApproach, 'Insert a verified quality-control approach')}\n\n## Metrics and Corrective Action\n\n${REQUIRED_INPUT('Define solicitation-aligned quality metrics and corrective-action process')}\n` }),
      'transition-plan.md': this.renderer.render({ title: 'Transition Plan', instructions: 'Address transition milestones and continuity without assuming incumbent access or government resources.', complianceReferences: refs, body: `## Transition Approach\n\n${verifiedAsset(assets.transitionApproach, 'Insert a verified transition approach')}\n\n## Milestones\n\n${REQUIRED_INPUT('Define validated transition milestones, owners, dependencies, and acceptance criteria')}\n` }),
      'past-performance.md': this.renderer.render({ title: 'Past Performance', instructions: 'Include only verified records that meet the solicitation recency, size, scope, and contact rules. Never create or embellish contract history.', complianceReferences: refs, body: `## Solicitation Requirements\n\n${bullets(analysis.pastPerformanceRequirements, 'Extract past-performance requirements')}\n\n## Verified Records\n\n${assets.pastPerformanceRecords.filter((record) => record.verified).length ? assets.pastPerformanceRecords.filter((record) => record.verified).map((record) => `### ${record.projectName}\n\n- Customer: ${record.customer}\n- Contract: ${record.contractNumber ?? REQUIRED_INPUT('Insert contract number if required')}\n- Description: ${record.description}\n- Relevance: ${record.relevance ?? REQUIRED_INPUT('Explain relevance to this solicitation')}`).join('\n\n') : REQUIRED_INPUT('Insert verified past-performance example')}\n` }),
      'pricing-narrative.md': this.renderer.render({ title: 'Pricing Narrative', instructions: 'Explain the approved methodology only. Do not invent rates, prices, indirect costs, or assumptions. Final pricing requires explicit human approval.', complianceReferences: refs, body: `## Pricing Instructions\n\n${bullets(analysis.pricingInstructions, 'Extract pricing instructions')}\n\n## Methodology\n\n${REQUIRED_INPUT('Insert reviewed pricing methodology and assumptions')}\n\n## Final Pricing Approval\n\nStatus: **${opportunity.approvals.finalPricing.status}**\n` }),
      'submission-checklist.md': this.renderer.render({ title: 'Submission Checklist', instructions: 'Confirm every item against the latest official solicitation and amendments. Checking an item does not constitute authorization to submit.', complianceReferences: refs, body: `## Required Checks\n\n- [ ] Latest solicitation and all amendments verified\n- [ ] Compliance matrix complete and approved\n- [ ] Page limits and formatting verified\n- [ ] Required forms attached\n- [ ] Pricing approved by authorized human\n- [ ] Representations and certifications approved by authorized human\n- [ ] Proposal release approved by authorized human\n- [ ] Submission authorization approved by authorized human\n- [ ] Submission receipt retained\n\n## Current Gates\n\n${Object.entries(opportunity.approvals).map(([gate, approval]) => `- ${gate}: **${approval.status}**`).join('\n')}\n` }),
      'risk-register.md': this.renderer.render({ title: 'Risk Register', instructions: 'Track probability, impact, mitigation, trigger, and accountable owner. Escalate legal or contractual interpretation to qualified counsel.', body: assessment.risks.length ? assessment.risks.map((risk, index) => `## Risk ${index + 1}\n\n- Risk: ${risk}\n- Mitigation: ${REQUIRED_INPUT('Define mitigation')}\n- Owner: ${opportunity.assignedOwner}\n- Status: Open`).join('\n\n') : `## Risk 1\n\n- Risk: ${REQUIRED_INPUT('Identify performance, compliance, schedule, and pricing risks')}\n` }),
      'review-log.md': this.renderer.render({ title: 'Review Log', instructions: 'Record Pink/Red/Gold or equivalent reviews, reviewers, findings, dispositions, and approvals.', body: `| Date | Review | Reviewer | Finding | Disposition | Status |\n|---|---|---|---|---|---|\n| ${REQUIRED_INPUT('YYYY-MM-DD')} | ${REQUIRED_INPUT('Review stage')} | ${REQUIRED_INPUT('Reviewer')} | ${REQUIRED_INPUT('Finding')} | ${REQUIRED_INPUT('Disposition')} | Open |\n` }),
    };
    const files: string[] = [];
    for (const [file, content] of Object.entries(documents)) { writeFileSync(join(workspaceDir, file), content, 'utf8'); files.push(file); }
    writeFileSync(join(workspaceDir, 'capture-plan.md'), renderCapturePlan(capturePlan), 'utf8');
    writeFileSync(join(workspaceDir, 'capture-plan.json'), JSON.stringify(capturePlan, null, 2), 'utf8');
    files.push('capture-plan.md', 'capture-plan.json');
    await writeComplianceMatrix(complianceMatrix, join(workspaceDir, 'compliance-matrix.json'), join(workspaceDir, 'compliance-matrix.xlsx'));
    files.push('compliance-matrix.json', 'compliance-matrix.xlsx');
    const manifest = ProposalManifestSchema.parse({
      projectId: opportunity.projectId, businessId: business.businessId, generatedAt: new Date().toISOString(), status: 'DO NOT SUBMIT — DRAFT', officialInstructionsControl: true,
      artifacts: files.map((file) => ({ file, kind: file.split('.').pop() ?? 'document', status: documents[file]?.includes('[REQUIRED INPUT:') || file === 'capture-plan.md' ? 'needs-input' : 'generated' })),
      approvals: opportunity.approvals,
      prohibitedAutomations: ['automatic bid submission', 'automatic signature or certification', 'automatic pricing certification', 'automatic representations and certifications', 'automatic teaming authorization'],
    });
    writeFileSync(join(workspaceDir, 'proposal-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8'); files.unshift('proposal-manifest.json');
    return { workspaceDir, manifest, files };
  }
}
