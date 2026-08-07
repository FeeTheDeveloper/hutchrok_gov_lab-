import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BusinessProfile } from '../business/schema.js';
import { BusinessProfileSchema } from '../business/schema.js';
import { ProposalPackageBuilder, type ProposalPackageResult } from '../documents/index.js';
import type { ArtifactBackend } from './artifactBackend.js';
import { createAuditEvent, FileAuditSink, type AuditSink } from './audit.js';
import { assessBid, type AssessBidOptions, type BidNoBidResult } from './bidNoBid.js';
import { generateCapturePlan } from './capture.js';
import { generateComplianceMatrix } from './compliance.js';
import type { HumanGate, OpportunityProject, SolicitationAnalysis } from './schema.js';
import { OpportunityProjectSchema, SolicitationAnalysisSchema } from './schema.js';
import { GovReadyStore, resolveDataDir } from './store.js';
import type { SupabaseGovReadyStore } from './supabaseStore.js';
import { transitionProject } from './transitions.js';

type BidStore = GovReadyStore | SupabaseGovReadyStore;

export class BidOperationsService {
  constructor(
    readonly store: BidStore = new GovReadyStore(),
    private readonly auditSink: AuditSink = store instanceof GovReadyStore ? new FileAuditSink(store.root) : new FileAuditSink(resolveDataDir()),
    readonly artifacts?: ArtifactBackend,
  ) {}

  private proposalDir(projectId: string): string {
    if (!(this.store instanceof GovReadyStore)) throw new Error('Local proposal directory is unavailable on the Supabase-backed store.');
    return this.store.proposalDir(projectId);
  }

  async saveBusiness(raw: unknown, actor: string): Promise<{ profile: BusinessProfile; path: string }> {
    const profile = BusinessProfileSchema.parse(raw);
    let previous: unknown;
    try { previous = await this.store.getBusiness(profile.businessId); } catch { previous = undefined; }
    const path = await this.store.saveBusiness(profile);
    await this.auditSink.append(createAuditEvent({ actor, businessId: profile.businessId, action: previous ? 'business.updated' : 'business.created', summary: `${profile.legalBusinessName} profile ${previous ? 'updated' : 'created'}.`, affectedArtifact: path, previousState: previous, newState: profile }));
    return { profile, path };
  }

  async saveOpportunity(raw: unknown, actor: string): Promise<{ project: OpportunityProject; path: string }> {
    const project = OpportunityProjectSchema.parse(raw);
    await this.store.getBusiness(project.businessId);
    let previous: unknown;
    try { previous = await this.store.getOpportunity(project.projectId); } catch { previous = undefined; }
    const path = await this.store.saveOpportunity(project);
    await this.auditSink.append(createAuditEvent({ actor, businessId: project.businessId, opportunityId: project.projectId, action: previous ? 'opportunity.updated' : 'opportunity.imported', summary: `${project.title} ${previous ? 'updated' : 'imported'}.`, affectedArtifact: path, previousState: previous, newState: project }));
    return { project, path };
  }

  async ensureOpportunity(raw: unknown, actor: string): Promise<OpportunityProject> {
    const candidate = OpportunityProjectSchema.parse(raw);
    try {
      const existing = await this.store.getOpportunity(candidate.projectId);
      if (existing.businessId !== candidate.businessId || existing.noticeId !== candidate.noticeId) {
        throw new Error(`Persistent project ${candidate.projectId} does not match the supplied business or notice.`);
      }
      return existing;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      return (await this.saveOpportunity(candidate, actor)).project;
    }
  }

  async assess(business: BusinessProfile, opportunity: OpportunityProject, analysis: SolicitationAnalysis, actor: string, options: AssessBidOptions = {}): Promise<{ result: BidNoBidResult; path: string }> {
    BusinessProfileSchema.parse(business); OpportunityProjectSchema.parse(opportunity); SolicitationAnalysisSchema.parse(analysis);
    const result = assessBid(business, opportunity, analysis, { ...options, actor });
    const content = JSON.stringify(result, null, 2);
    let path: string;
    if (this.artifacts) {
      path = await this.artifacts.writeSideFile(business.businessId, opportunity.projectId, 'bid-assessment.json', content);
    } else {
      const dir = this.proposalDir(opportunity.projectId); mkdirSync(dir, { recursive: true });
      path = join(dir, 'bid-assessment.json'); writeFileSync(path, content, 'utf8');
    }
    await this.auditSink.append(createAuditEvent({ actor, businessId: business.businessId, opportunityId: opportunity.projectId, action: 'bid.assessed', summary: `Bid / No-Bid assessment recommended ${result.recommendedDecision} at ${result.weightedScore}/100. Human approval remains pending.`, affectedArtifact: path, newState: result }));
    return { result, path };
  }

  async approveGate(projectId: string, gate: keyof OpportunityProject['approvals'], actor: string, notes?: string): Promise<OpportunityProject> {
    const project = await this.store.getOpportunity(projectId);
    const previous = project.approvals[gate];
    const approval: HumanGate = { status: 'approved', approvedBy: actor, approvedAt: new Date().toISOString(), notes };
    const updated = OpportunityProjectSchema.parse({
      ...project,
      bidDecision: gate === 'bidNoBid' ? 'bid' : project.bidDecision,
      decisionRationale: gate === 'bidNoBid' ? notes || project.decisionRationale : project.decisionRationale,
      approvals: { ...project.approvals, [gate]: approval }, updatedAt: new Date().toISOString(),
    });
    const path = await this.store.saveOpportunity(updated);
    await this.auditSink.append(createAuditEvent({ actor, businessId: project.businessId, opportunityId: projectId, action: `approval.${gate}`, summary: `Human approval recorded for ${gate}.`, affectedArtifact: path, previousState: previous, newState: approval }));
    return updated;
  }

  async changeStatus(projectId: string, status: OpportunityProject['status'], actor: string): Promise<OpportunityProject> {
    const project = await this.store.getOpportunity(projectId);
    const updated = transitionProject(project, status);
    const path = await this.store.saveOpportunity(updated);
    await this.auditSink.append(createAuditEvent({ actor, businessId: project.businessId, opportunityId: projectId, action: 'status.changed', summary: `Opportunity status changed from ${project.status} to ${status}.`, affectedArtifact: path, previousState: project.status, newState: status }));
    return updated;
  }

  async recordSubmissionReadinessReview(projectId: string, actor: string, passed: boolean, findings: string[]): Promise<string> {
    const project = await this.store.getOpportunity(projectId);
    const review = { projectId, completedAt: new Date().toISOString(), completedBy: actor, passed, findings, submissionAuthorized: project.approvals.submissionAuthorization.status === 'approved' };
    const content = JSON.stringify(review, null, 2);
    let path: string;
    if (this.artifacts) {
      path = await this.artifacts.writeSideFile(project.businessId, projectId, 'submission-readiness-review.json', content);
    } else {
      const dir = this.proposalDir(projectId); mkdirSync(dir, { recursive: true });
      path = join(dir, 'submission-readiness-review.json'); writeFileSync(path, content, 'utf8');
    }
    await this.auditSink.append(createAuditEvent({ actor, businessId: project.businessId, opportunityId: projectId, action: 'submission-readiness.review-completed', summary: `Submission-readiness review completed: ${passed ? 'passed' : 'not ready'}. Submission authorization is separately controlled.`, affectedArtifact: path, newState: review }));
    return path;
  }

  async prepare(input: { business: BusinessProfile; opportunity: OpportunityProject; analysis: SolicitationAnalysis; actor: string; outputRoot: string; ratings?: AssessBidOptions['ratings'] }): Promise<ProposalPackageResult> {
    const assessed = (await this.assess(input.business, input.opportunity, input.analysis, input.actor, { ratings: input.ratings })).result;
    const matrix = generateComplianceMatrix(input.analysis);
    const capture = generateCapturePlan(input.business, input.opportunity, input.analysis, assessed);
    const priorIndex = this.artifacts
      ? Boolean(await this.artifacts.getIndex(input.opportunity.projectId))
      : existsSync(join(this.proposalDir(input.opportunity.projectId), 'artifacts.json'));
    const result = await new ProposalPackageBuilder().build({ business: input.business, opportunity: input.opportunity, analysis: input.analysis, assessment: assessed, complianceMatrix: matrix, capturePlan: capture }, input.outputRoot);
    if (this.artifacts) {
      await this.artifacts.persistWorkspace(input.business.businessId, input.opportunity.projectId, result.workspaceDir, result.files, result.manifest);
    } else {
      const indexDir = this.proposalDir(input.opportunity.projectId); mkdirSync(indexDir, { recursive: true });
      const artifactIndex = { projectId: input.opportunity.projectId, workspaceDir: result.workspaceDir, generatedAt: new Date().toISOString(), files: result.files.map((file) => ({ file, path: join(result.workspaceDir, file) })) };
      writeFileSync(join(indexDir, 'artifacts.json'), JSON.stringify(artifactIndex, null, 2), 'utf8');
    }
    await this.auditSink.append(createAuditEvent({ actor: input.actor, businessId: input.business.businessId, opportunityId: input.opportunity.projectId, action: priorIndex ? 'document.regenerated' : 'proposal.workspace-created', summary: priorIndex ? 'Draft proposal documents regenerated. No submission action was taken.' : 'Draft proposal workspace generated. No submission action was taken.', affectedArtifact: result.workspaceDir, newState: result.manifest }));
    return result;
  }

  async listArtifacts(projectId: string): Promise<unknown> {
    if (this.artifacts) {
      const index = await this.artifacts.getIndex(projectId);
      return index ?? { projectId, files: [] };
    }
    const indexPath = join(this.proposalDir(projectId), 'artifacts.json');
    if (!existsSync(indexPath)) return { projectId, files: [] };
    return JSON.parse(readFileSync(indexPath, 'utf8'));
  }
}
