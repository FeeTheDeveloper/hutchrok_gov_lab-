import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import type { BusinessProfile } from '../business/schema.js';
import { BusinessProfileSchema } from '../business/schema.js';
import type { AuditEvent, AuditSink } from './audit.js';
import { NotFoundError } from './errors.js';
import type { OpportunityProject } from './schema.js';
import { OpportunityProjectSchema } from './schema.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the Supabase-backed Bid Operations store.`);
  return value;
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createServiceRoleClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class SupabaseGovReadyStore {
  constructor(private readonly client: SupabaseClient) {}

  async saveBusiness(profile: BusinessProfile): Promise<string> {
    const value = BusinessProfileSchema.parse(profile);
    const { error } = await this.client.from('businesses').upsert({
      business_id: value.businessId,
      legal_business_name: value.legalBusinessName,
      state: value.state,
      primary_naics: value.serviceAlignment.primaryNaics,
      profile: value,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Failed to save business ${value.businessId}: ${error.message}`);
    return `supabase:businesses/${value.businessId}`;
  }

  async getBusiness(id: string): Promise<BusinessProfile> {
    const { data, error } = await this.client.from('businesses').select('profile').eq('business_id', id).maybeSingle();
    if (error) throw new Error(`Failed to load business ${id}: ${error.message}`);
    if (!data) throw new NotFoundError(`Business ${id} was not found.`);
    return BusinessProfileSchema.parse(data.profile);
  }

  async listBusinesses(): Promise<BusinessProfile[]> {
    const { data, error } = await this.client.from('businesses').select('profile').order('legal_business_name');
    if (error) throw new Error(`Failed to list businesses: ${error.message}`);
    return (data ?? []).map((row) => BusinessProfileSchema.parse(row.profile));
  }

  async saveOpportunity(project: OpportunityProject): Promise<string> {
    const value = OpportunityProjectSchema.parse(project);
    const { error } = await this.client.from('opportunities').upsert({
      project_id: value.projectId,
      business_id: value.businessId,
      notice_id: value.noticeId,
      status: value.status,
      bid_decision: value.bidDecision,
      fit_score: value.fitScore,
      project: value,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Failed to save opportunity ${value.projectId}: ${error.message}`);
    return `supabase:opportunities/${value.projectId}`;
  }

  async getOpportunity(id: string): Promise<OpportunityProject> {
    const { data, error } = await this.client.from('opportunities').select('project').eq('project_id', id).maybeSingle();
    if (error) throw new Error(`Failed to load opportunity ${id}: ${error.message}`);
    if (!data) throw new NotFoundError(`Opportunity ${id} was not found.`);
    return OpportunityProjectSchema.parse(data.project);
  }

  async listOpportunities(): Promise<OpportunityProject[]> {
    const { data, error } = await this.client.from('opportunities').select('project').order('updated_at', { ascending: false });
    if (error) throw new Error(`Failed to list opportunities: ${error.message}`);
    return (data ?? []).map((row) => OpportunityProjectSchema.parse(row.project));
  }
}

export class SupabaseAuditSink implements AuditSink {
  constructor(private readonly client: SupabaseClient) {}

  async append(event: AuditEvent): Promise<void> {
    const { error } = await this.client.from('audit_events').insert({
      event_id: event.eventId,
      business_id: event.businessId,
      opportunity_id: event.opportunityId ?? null,
      actor: event.actor,
      action: event.action,
      summary: event.summary,
      affected_artifact: event.affectedArtifact ?? null,
      previous_state: event.previousState ?? null,
      new_state: event.newState ?? null,
      occurred_at: event.timestamp,
    });
    if (error) throw new Error(`Failed to append audit event: ${error.message}`);
  }
}
