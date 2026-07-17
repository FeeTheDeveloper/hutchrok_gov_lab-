// Core domain types for the GovReady Lab Phase 1 engine.

/** A normalized set-aside category, independent of SAM.gov's raw codes. */
export type SetAside =
  | 'OPEN' // Full & open / unrestricted
  | 'SB' // Total or partial small business
  | 'SDVOSB' // Service-disabled veteran-owned
  | 'VOSB' // Veteran-owned (VA authority)
  | 'WOSB' // Woman-owned
  | 'EDWOSB' // Economically disadvantaged woman-owned
  | 'HUBZONE'
  | 'EIGHT_A' // 8(a)
  | 'OTHER'; // Buy Indian, local-area, tribal, etc. — treated conservatively

/** Normalized opportunity type buckets that drive the "what to do" action. */
export type OppType =
  | 'SOLICITATION' // Solicitation / Combined Synopsis — bid now
  | 'SOURCES_SOUGHT' // Sources Sought / RFI — capability statement
  | 'PRESOLICITATION' // Presolicitation — prep for RFP
  | 'AWARD' // Award Notice — intel only
  | 'SPECIAL' // Special Notice / other
  | 'UNKNOWN';

/** The four client-facing tiers from the concept doc. */
export type Tier = 'PURSUE' | 'QUALIFY' | 'MONITOR' | 'INTEL';

/** A single opportunity parsed from a SAM.gov contract-opportunities CSV export. */
export interface Opportunity {
  noticeId: string;
  title: string;
  agency: string;
  office: string;
  naics: string;
  type: OppType;
  rawType: string;
  setAside: SetAside;
  rawSetAside: string;
  postedDate: string | null; // ISO
  responseDeadline: string | null; // ISO
  popState: string;
  link: string;
  description: string;
  active: boolean;
}

/** A funded assistance listing parsed from a SAM.gov / grants export. */
export interface AssistanceListing {
  programNumber: string; // e.g. 59.066
  title: string;
  agency: string;
  description: string;
}

/** Certifications the client holds (drives set-aside eligibility). */
export interface Certifications {
  smallBusiness: boolean;
  sdvosb: boolean;
  vosb: boolean;
  wosb: boolean;
  edwosb: boolean;
  eightA: boolean;
  hubzone: boolean;
}

export type CertStatus = 'complete' | 'in_progress' | 'not_started';

/** Readiness document / registration checklist — feeds the readiness meter. */
export interface Readiness {
  samRegistered: boolean;
  ueiCage: boolean;
  repsAndCerts: boolean;
  vetCertVerification: CertStatus | boolean;
  capabilityStatement: boolean;
  pastPerformanceFile: boolean;
  financialStatements: boolean;
  grantReadiness: boolean;
}

/** The client profile assembled from the Part 1 intake form. */
export interface Intake {
  company: string;
  entityType?: string;
  state: string;
  yearFounded?: number;
  uei?: string;
  cage?: string;
  employees?: string;
  revenueRange?: string;
  certifications: Certifications;
  /** NAICS lanes to sweep — the analyst pre-maps these from Section C. */
  naicsLanes: string[];
  /** Free-text strong points from intake Section C, used for strength matching. */
  strengths: string;
  /** Extra keywords to boost strength matching beyond what strengths text yields. */
  strengthKeywords?: string[];
  geographicRange?: string;
  interestedIn?: 'contracts' | 'grants' | 'both';
  revenueGoal?: string;
  readiness: Readiness;
}

/** A scored opportunity with the reasoning trail exposed to the client. */
export interface ScoredOpportunity extends Opportunity {
  score: number;
  tier: Tier;
  eligible: boolean;
  action: string;
  daysToDeadline: number | null;
  reasons: string[];
  /** Component breakdown for transparency / the Excel "why" columns. */
  components: {
    type: number;
    setAside: number;
    deadline: number;
    strength: number;
    laneAdjust: number;
  };
}

export interface GrantMatch extends AssistanceListing {
  reasons: string[];
  veteranAdvantaged: boolean;
}

export interface Report {
  intake: Intake;
  generatedAt: string; // ISO
  today: string; // ISO date used for runway math
  opportunities: ScoredOpportunity[];
  grants: GrantMatch[];
  stats: {
    inLane: number;
    pursue: number;
    qualify: number;
    monitor: number;
    intel: number;
    eligible: number;
    urgent: number; // <= 7 days
    readinessPct: number;
  };
}
