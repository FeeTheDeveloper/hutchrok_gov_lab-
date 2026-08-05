import type { OpportunityProject, OpportunityStatus } from './schema.js';
import { OpportunityProjectSchema } from './schema.js';

const transitions: Record<OpportunityStatus, OpportunityStatus[]> = {
  discovered: ['qualifying', 'archived'],
  qualifying: ['bid-review', 'no-bid', 'archived'],
  'bid-review': ['pursuing', 'no-bid', 'qualifying'],
  pursuing: ['capture', 'no-bid', 'archived'],
  capture: ['drafting', 'no-bid', 'archived'],
  drafting: ['internal-review', 'capture', 'no-bid'],
  'internal-review': ['drafting', 'submission-ready', 'no-bid'],
  'submission-ready': ['internal-review', 'submitted', 'no-bid'],
  submitted: ['awarded', 'lost', 'archived'],
  awarded: ['archived'],
  lost: ['archived'],
  archived: [],
  'no-bid': ['qualifying', 'archived'],
};

export function canTransition(from: OpportunityStatus, to: OpportunityStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionProject(project: OpportunityProject, to: OpportunityStatus, now = new Date().toISOString()): OpportunityProject {
  if (!canTransition(project.status, to)) throw new Error(`Invalid opportunity status transition: ${project.status} -> ${to}`);
  return OpportunityProjectSchema.parse({ ...project, status: to, updatedAt: now });
}
