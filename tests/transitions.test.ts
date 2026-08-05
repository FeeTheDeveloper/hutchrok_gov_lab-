import { describe, expect, it } from 'vitest';
import { OpportunityProjectSchema, transitionProject } from '../src/bids/index.js';
import { opportunityFixture } from './fixtures.js';

describe('project status transitions and human gates', () => {
  it('blocks pursuing status without explicit Bid / No-Bid approval', () => {
    const project = opportunityFixture();
    expect(() => OpportunityProjectSchema.parse({ ...project, status: 'pursuing' })).toThrow(/Human Bid \/ No-Bid approval/);
  });

  it('allows approved bid-review to move into pursuing', () => {
    const project = OpportunityProjectSchema.parse({
      ...opportunityFixture(), status: 'bid-review', bidDecision: 'bid',
      approvals: { ...opportunityFixture().approvals, bidNoBid: { status: 'approved', approvedBy: 'King Fee', approvedAt: '2026-08-05T13:00:00.000Z' } },
    });
    expect(transitionProject(project, 'pursuing', '2026-08-05T13:01:00.000Z').status).toBe('pursuing');
  });

  it('rejects invalid lifecycle jumps', () => {
    expect(() => transitionProject(opportunityFixture(), 'submitted')).toThrow(/Invalid opportunity status transition/);
  });
});
