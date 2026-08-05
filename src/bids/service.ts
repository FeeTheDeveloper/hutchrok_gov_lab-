import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BusinessProfile } from '../business/schema.js';
import { BusinessProfileSchema } from '../business/schema.js';
import { ProposalPackageBuilder, type ProposalPackageResult } from '../documents/index.js';
import { appendAuditEvent, createAuditEvent } from './audit.js';
import { assessBid, type AssessBidOptions, type BidNoBidResult } from './bidNoBid.js';
import { generateCapturePlan } from './capture.js';
import { generateComplianceMatrix } from './compliance.js';
import type { HumanGate, OpportunityProject, SolicitationAnalysis } from './schema.js';
import { OpportunityProjectSchema, SolicitationAnalysisSchema } from './schema.js';
import { GovReadyStore } from './store.js';
import { transitionProject } from './transitions.js';

export class BidOperationsService {
  constructor(readonly store = new GovReadyStore()) {}

  saveBusiness(raw: unknown, actor: string): { profile: BusinessProfile; path: string } {
    const profile = BusinessProfileSchema.parse(raw);
    let previous: unknown;
    try { previous = this.store.getBusiness(profile.businessId); } catch { previous = undefined; }
    const path = this.store.saveBusiness(profile);
    appendAuditEvent(this.store.root, createAuditEvent({ actor, businessId: profile.businessId, action: previous ? 'business.updated' : 'business.created', summary: `${profile.legalBusinessName} profile ${previous ? 'updated' : 'created'}.`, affectedArtifact: path, previousState: previous, newState: profile }));
    return { profile, path };
  }

  saveOpportunity(raw: unknown, actor: string): { project: OpportunityProject; path: string } {
    const project = OpportunityProjectSchema.parse(raw);
    this.store.getBusiness(project.businessId);
    let previous: unknown;
    try { previous = this.store.getOpportunity(project.projectId); } catch { previous = undefined; }
    const path = this.store.saveOpportunity(project);
    appendAuditEvent(this.store.root, createAuditEvent({ actor, businessId: project.businessId, opportunityId: project.projectId, action: previous ? 'opportunity.updated' : 'opportunity.imported', summary: `${project.title} ${previous ? 'updated' : 'imported'}.`, affectedArtifact: path, previousState: previous, newState: project }));
    return { project, path };
  }

  ensureOpportunity(raw: unknown, actor: string): OpportunityProject {
    const candidate = OpportunityProjectSchema.parse(raw);
    try {
      const existing = this.store.getOpportunity(candidate.projectId);
      if (existing.businessId !== candidate.businessId || existing.noticeId !== candidate.noticeId) {
        throw new Error(`Persistent project ${candidate.projectId} does not match the supplied business or notice.`);
      }
      return existing;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      return this.saveOpportunity(candidate, actor).project;
    }
  }

  assess(business: BusinessProfile, opportunity: OpportunityProject, analysis: SolicitationAnalysis, actor: string, options: AssessBidOptions = {}): { result: BidNoBidResult; path: string } {
    BusinessProfileSchema.parse(business); OpportunityProjectSchema.parse(opportunity); SolicitationAnalysisSchema.parse(analysis);
    const result = assessBid(business, opportunity, analysis, { ...options, actor });
    const dir = this.store.proposalDir(opportunity.projectId); mkdirSync(dir, { recursive: true });
    const path = join(dir, 'bid-assessment.json'); writeFileSync(path, JSON.stringify(result, null, 2), 'utf8');
    appendAuditEvent(this.store.root, createAuditEvent({ actor, businessId: business.businessId, opportunityId: opportunity.projectId, action: 'bid.assessed', summary: `Bid / No-Bid assessment recommended ${result.recommendedDecision} at ${result.weightedScore}/100. Human approval remains pending.`, affectedArtifact: path, newState: result }));
    return { result, path };
  }

  approveGate(projectId: string, gate: keyof OpportunityProject['approvals'], actor: string, notes?: string): OpportunityProject {
    const project = this.store.getOpportunity(projectId);
    const previous = project.approvals[gate];
    const approval: HumanGate = { status: 'approved', approvedBy: actor, approvedAt: new Date().toISOString(), notes };
    const updated = OpportunityProjectSchema.parse({
      ...project,
      bidDecision: gate === 'bidNoBid' ? 'bid' : project.bidDecision,
      decisionRationale: gate === 'bidNoBid' ? notes || project.decisionRationale : project.decisionRationale,
      approvals: { ...project.approvals, [gate]: approval }, updatedAt: new Date().toISOString(),
    });
    const path = this.store.saveOpportunity(updated);
    appendAuditEvent(this.store.root, createAuditEvent({ actor, businessId: project.businessId, opportunityId: projectId, action: `approval.${gate}`, summary: `Human approval recorded for ${gate}.`, affectedArtifact: path, previousState: previous, newState: approval }));
    return updated;
  }

  changeStatus(projectId: string, status: OpportunityProject['status'], actor: string): OpportunityProject {
    const project = this.store.getOpportunity(projectId);
    const updated = transitionProject(project, status);
    const path = this.store.saveOpportunity(updated);
    appendAuditEvent(this.store.root, createAuditEvent({ actor, businessId: project.businessId, opportunityId: projectId, action: 'status.changed', summary: `Opportunity status changed from ${project.status} to ${status}.`, affectedArtifact: path, previousState: project.status, newState: status }));
    return updated;
  }

  recordSubmissionReadinessReview(projectId: string, actor: string, passed: boolean, findings: string[]): string {
    const project = this.store.getOpportunity(projectId);
    const dir = this.store.proposalDir(projectId); mkdirSync(dir, { recursive: true });
    const review = { projectId, completedAt: new Date().toISOString(), completedBy: actor, passed, findings, submissionAuthorized: project.approvals.submissionAuthorization.status === 'approved' };
    const path = join(dir, 'submission-readiness-review.json'); writeFileSync(path, JSON.stringify(review, null, 2), 'utf8');
    appendAuditEvent(this.store.root, createAuditEvent({ actor, businessId: project.businessId, opportunityId: projectId, action: 'submission-readiness.review-completed', summary: `Submission-readiness review completed: ${passed ? 'passed' : 'not ready'}. Submission authorization is separately controlled.`, affectedArtifact: path, newState: review }));
    return path;
  }

  async prepare(input: { business: BusinessProfile; opportunity: OpportunityProject; analysis: SolicitationAnalysis; actor: string; outputRoot: string; ratings?: AssessBidOptions['ratings'] }): Promise<ProposalPackageResult> {
    const assessed = this.assess(input.business, input.opportunity, input.analysis, input.actor, { ratings: input.ratings }).result;
    const matrix = generateComplianceMatrix(input.analysis);
    const capture = generateCapturePlan(input.business, input.opportunity, input.analysis, assessed);
    const priorIndex = existsSync(join(this.store.proposalDir(input.opportunity.projectId), 'artifacts.json'));
    const result = await new ProposalPackageBuilder().build({ business: input.business, opportunity: input.opportunity, analysis: input.analysis, assessment: assessed, complianceMatrix: matrix, capturePlan: capture }, input.outputRoot);
    const indexDir = this.store.proposalDir(input.opportunity.projectId); mkdirSync(indexDir, { recursive: true });
    const artifactIndex = { projectId: input.opportunity.projectId, workspaceDir: result.workspaceDir, generatedAt: new Date().toISOString(), files: result.files.map((file) => ({ file, path: join(result.workspaceDir, file) })) };
    writeFileSync(join(indexDir, 'artifacts.json'), JSON.stringify(artifactIndex, null, 2), 'utf8');
    appendAuditEvent(this.store.root, createAuditEvent({ actor: input.actor, businessId: input.business.businessId, opportunityId: input.opportunity.projectId, action: priorIndex ? 'document.regenerated' : 'proposal.workspace-created', summary: priorIndex ? 'Draft proposal documents regenerated. No submission action was taken.' : 'Draft proposal workspace generated. No submission action was taken.', affectedArtifact: result.workspaceDir, newState: result.manifest }));
    return result;
  }

  listArtifacts(projectId: string): unknown {
    const indexPath = join(this.store.proposalDir(projectId), 'artifacts.json');
    if (!existsSync(indexPath)) return { projectId, files: [] };
    return JSON.parse(readFileSync(indexPath, 'utf8'));
  }
}
