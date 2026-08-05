import { describe, expect, it } from 'vitest';
import { assessBid } from '../src/bids/index.js';
import { businessFixture, opportunityFixture, analysisFixture } from './fixtures.js';

const highRatings = {
  capabilityMatch: 5, pastPerformanceMatch: 5, geographicFit: 5, staffingCapacity: 5,
  equipmentCapacity: 5, solicitationComplexity: 0, competitionRisk: 0, incumbentAdvantage: 0,
  pricingConfidence: 5, teamingAvailability: 5, strategicAgencyAlignment: 5,
  expectedContractValue: 5, performanceRisk: 0,
};

describe('Bid / No-Bid engine', () => {
  it('scores all factors but leaves human approval pending', () => {
    const result = assessBid(businessFixture(), opportunityFixture(), analysisFixture(), { ratings: highRatings, today: '2026-08-05' });
    expect(result.weightedScore).toBeGreaterThan(70);
    expect(result.recommendedDecision).toBe('bid');
    expect(result.humanApproval.status).toBe('pending');
    expect(result.disclaimer).toContain('does not commit');
  });

  it('enforces the veteran-benefit guardrail using verified status only', () => {
    const business = businessFixture();
    const opportunity = { ...opportunityFixture(), setAside: 'SDVOSB', eligibilityStatus: 'needs-verification' as const };
    const pending = assessBid(business, opportunity, analysisFixture(), { ratings: highRatings, today: '2026-08-05' });
    expect(pending.recommendedDecision).toBe('no-bid');
    expect(pending.factorScores.setAsideEligibility.score).toBe(0);

    const verified = { ...business, certifications: { ...business.certifications, sdvosb: { status: 'verified' as const, verificationSource: 'SBA VetCert record' } } };
    const eligible = assessBid(verified, opportunity, analysisFixture(), { ratings: highRatings, today: '2026-08-05' });
    expect(eligible.factorScores.setAsideEligibility.score).toBe(5);
    expect(eligible.recommendedDecision).toBe('bid');
  });

  it('does not recommend a closed opportunity', () => {
    const analysis = { ...analysisFixture(), responseDeadline: '2026-01-01' };
    expect(assessBid(businessFixture(), opportunityFixture(), analysis, { ratings: highRatings, today: '2026-08-05' }).recommendedDecision).toBe('no-bid');
  });

  it('reports an existing human approval without creating one', () => {
    const opportunity = {
      ...opportunityFixture(),
      approvals: { ...opportunityFixture().approvals, bidNoBid: { status: 'approved' as const, approvedBy: 'King Fee', approvedAt: '2026-08-05T14:00:00.000Z' } },
    };
    expect(assessBid(businessFixture(), opportunity, analysisFixture(), { today: '2026-08-05' }).humanApproval.status).toBe('approved');
  });
});
