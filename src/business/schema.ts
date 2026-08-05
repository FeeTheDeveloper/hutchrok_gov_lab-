import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const CertificationStatusSchema = z.enum(['verified', 'pending', 'not-held']);
export type CertificationStatus = z.infer<typeof CertificationStatusSchema>;

export const CertificationRecordSchema = z.object({
  status: CertificationStatusSchema.default('not-held'),
  verificationSource: z.string().trim().min(1).optional(),
  expirationDate: z.string().date().optional(),
}).strict();

export const ContactSchema = z.object({
  name: z.string().trim().min(1),
  title: z.string().trim().optional(),
}).strict();

export const AddressSchema = z.object({
  line1: z.string().trim().min(1),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  postalCode: z.string().trim().min(5),
  country: z.string().trim().default('US'),
}).strict();

export const PastPerformanceRecordSchema = z.object({
  projectName: z.string().trim().min(1),
  customer: z.string().trim().min(1),
  contractNumber: z.string().trim().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  value: z.number().nonnegative().optional(),
  description: z.string().trim().min(1),
  relevance: z.string().trim().optional(),
  verified: z.boolean().default(false),
}).strict();

export const ProposalAssetSchema = z.object({
  content: z.string().trim().min(1),
  verified: z.boolean().default(false),
  source: z.string().trim().optional(),
  lastReviewedAt: z.string().datetime().optional(),
}).strict();

const asset = ProposalAssetSchema.optional();

export const BusinessProfileSchema = z.object({
  businessId: z.string().trim().min(2).regex(/^[a-zA-Z0-9._-]+$/),
  legalBusinessName: z.string().trim().min(1),
  dba: z.string().trim().optional(),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  address: AddressSchema,
  website: z.string().url().optional(),
  primaryContact: ContactSchema,
  email: z.string().email(),
  phone: z.string().trim().min(7),

  federal: z.object({
    uei: z.string().trim().optional(),
    cage: z.string().trim().optional(),
    samStatus: z.enum(['active', 'inactive', 'pending', 'not-registered']),
    samExpirationDate: z.string().date().optional(),
    sbaAccountStatus: z.enum(['active', 'inactive', 'pending', 'not-created']),
  }).strict(),

  certifications: z.object({
    smallBusiness: CertificationRecordSchema.default({ status: 'not-held' }),
    sdvosb: CertificationRecordSchema.default({ status: 'not-held' }),
    vosb: CertificationRecordSchema.default({ status: 'not-held' }),
    eightA: CertificationRecordSchema.default({ status: 'not-held' }),
    hubzone: CertificationRecordSchema.default({ status: 'not-held' }),
    wosb: CertificationRecordSchema.default({ status: 'not-held' }),
    edwosb: CertificationRecordSchema.default({ status: 'not-held' }),
    dbe: CertificationRecordSchema.default({ status: 'not-held' }),
    mbe: CertificationRecordSchema.default({ status: 'not-held' }),
    other: z.array(z.object({
      name: z.string().trim().min(1),
      record: CertificationRecordSchema,
    }).strict()).default([]),
  }).strict(),

  serviceAlignment: z.object({
    primaryNaics: z.string().regex(/^\d{6}$/),
    secondaryNaics: z.array(z.string().regex(/^\d{6}$/)).default([]),
    pscCodes: z.array(z.string().trim().min(2)).default([]),
    keywords: z.array(z.string().trim().min(2)).default([]),
    coreCapabilities: z.array(z.string().trim().min(2)).min(1),
    differentiators: z.array(z.string().trim().min(2)).default([]),
    geographicServiceArea: z.array(z.string().trim().min(2)).default([]),
    agenciesOfInterest: z.array(z.string().trim().min(2)).default([]),
  }).strict(),

  readiness: z.object({
    capabilityStatementAvailable: z.boolean().default(false),
    insurance: z.boolean().default(false),
    bonding: z.boolean().default(false),
    accountingSystem: z.boolean().default(false),
    cybersecurityReadiness: z.enum(['not-assessed', 'gap', 'in-progress', 'ready']).default('not-assessed'),
    keyPersonnel: z.boolean().default(false),
    equipment: z.boolean().default(false),
    pastPerformance: z.boolean().default(false),
    teamingPartners: z.boolean().default(false),
    subcontractingReadiness: z.boolean().default(false),
  }).strict(),

  proposalAssets: z.object({
    companyOverview: asset,
    executiveBiography: asset,
    reusableTechnicalApproach: asset,
    managementApproach: asset,
    qualityControlApproach: asset,
    transitionApproach: asset,
    pastPerformanceRecords: z.array(PastPerformanceRecordSchema).default([]),
    keyPersonnelResumes: z.array(z.object({
      personName: z.string().trim().min(1),
      filePath: z.string().trim().min(1),
      verified: z.boolean().default(false),
    }).strict()).default([]),
    standardRepresentationsAndCertifications: asset,
  }).strict().default({ pastPerformanceRecords: [], keyPersonnelResumes: [] }),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

export function parseBusinessProfile(raw: unknown): BusinessProfile {
  return BusinessProfileSchema.parse(raw);
}

export function loadBusinessProfile(path: string): BusinessProfile {
  return parseBusinessProfile(JSON.parse(readFileSync(path, 'utf8')));
}

export function hasVerifiedCertification(
  profile: BusinessProfile,
  certification: keyof Omit<BusinessProfile['certifications'], 'other'>,
): boolean {
  return profile.certifications[certification].status === 'verified';
}
