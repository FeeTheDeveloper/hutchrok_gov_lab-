-- Bid Operations persistence: businesses, opportunities, audit trail, and
-- generated proposal artifact index. Each row keeps the full Zod-validated
-- document as jsonb (schema.ts stays the single source of truth) alongside a
-- few plain columns the API filters/sorts on. Storage bucket
-- 'proposal-artifacts' holds the generated proposal files themselves.
--
-- No RLS policies: every access goes through the server API (service-role
-- key only, never shipped to a browser client). These tables are never
-- queried directly by anon/authenticated roles.

create table businesses (
  business_id text primary key,
  legal_business_name text not null,
  state text not null,
  primary_naics text not null,
  profile jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table opportunities (
  project_id text primary key,
  business_id text not null references businesses(business_id),
  notice_id text not null,
  status text not null,
  bid_decision text not null,
  fit_score numeric not null,
  project jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_business_id_idx on opportunities(business_id);
create index opportunities_status_idx on opportunities(status);

create table audit_events (
  event_id uuid primary key,
  business_id text not null,
  opportunity_id text,
  actor text not null,
  action text not null,
  summary text not null,
  affected_artifact text,
  previous_state jsonb,
  new_state jsonb,
  occurred_at timestamptz not null
);
create index audit_events_opportunity_id_idx on audit_events(opportunity_id);
create index audit_events_business_id_idx on audit_events(business_id);

create table proposal_artifacts (
  project_id text primary key references opportunities(project_id),
  generated_at timestamptz not null,
  manifest jsonb not null,
  files jsonb not null
);

insert into storage.buckets (id, name, public)
values ('proposal-artifacts', 'proposal-artifacts', false)
on conflict (id) do nothing;
