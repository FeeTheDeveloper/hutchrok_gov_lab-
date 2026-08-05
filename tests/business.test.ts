import { describe, expect, it } from 'vitest';
import { BusinessProfileSchema, hasVerifiedCertification } from '../src/business/index.js';
import { businessFixture } from './fixtures.js';

describe('business profile validation and certifications', () => {
  it('validates the Hutchrok example', () => {
    const profile = businessFixture();
    expect(profile.businessId).toBe('hutchrok-solutions-group');
    expect(profile.serviceAlignment.primaryNaics).toBe('541611');
  });

  it('rejects malformed NAICS and unknown fields', () => {
    const profile = businessFixture();
    expect(() => BusinessProfileSchema.parse({ ...profile, extraClaim: 'not allowed' })).toThrow();
    expect(() => BusinessProfileSchema.parse({ ...profile, serviceAlignment: { ...profile.serviceAlignment, primaryNaics: '5416' } })).toThrow();
  });

  it('treats pending certification as unverified', () => {
    const profile = businessFixture();
    expect(profile.certifications.sdvosb.status).toBe('pending');
    expect(hasVerifiedCertification(profile, 'sdvosb')).toBe(false);
  });
});
