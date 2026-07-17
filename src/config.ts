import type { OppType, SetAside, Certifications } from './types.js';

/**
 * Scoring weights. Defaults mirror the client-facing prototype's engine
 * (type base + set-aside + deadline runway + strength match), hardened and
 * generalized for real SAM.gov exports. Tune here — every number is in one place.
 */
export const WEIGHTS = {
  type: {
    SOLICITATION: 30,
    SOURCES_SOUGHT: 25,
    PRESOLICITATION: 15,
    AWARD: 0,
    SPECIAL: 5,
    UNKNOWN: 5,
  } as Record<OppType, number>,

  /** Points when the client IS eligible for the set-aside. */
  setAsideEligible: {
    OPEN: 0, // open competition — no boost, no penalty
    SB: 15,
    SDVOSB: 35,
    VOSB: 32,
    WOSB: 30,
    EDWOSB: 30,
    HUBZONE: 30,
    EIGHT_A: 32,
    OTHER: 5,
  } as Record<SetAside, number>,

  /** Penalty when a set-aside exists but the client is NOT eligible. */
  ineligiblePenalty: -15,

  /** Deadline runway points by days remaining. */
  deadline(days: number | null): { pts: number; note: string } {
    if (days === null) return { pts: 4, note: 'no stated deadline' };
    if (days < 0) return { pts: 0, note: 'closed' };
    if (days <= 3) return { pts: 3, note: `${days}d left — very tight` };
    if (days <= 7) return { pts: 5, note: `${days}d left — tight` };
    if (days <= 30) return { pts: 10, note: `${days}d runway` };
    if (days <= 60) return { pts: 8, note: `${days}d runway` };
    return { pts: 5, note: `${days}d out` };
  },

  /** Points per matched strength keyword, and the cap. */
  strengthPerHit: 6,
  strengthCap: 18,

  /** Penalty when an opportunity's NAICS is outside the client's lanes. */
  offLanePenalty: -25,
};

export const ACTION_BY_TYPE: Record<OppType, string> = {
  SOLICITATION: 'Bid now',
  SOURCES_SOUGHT: 'Send capability statement',
  PRESOLICITATION: 'Prep for the RFP',
  AWARD: 'Intel — study who won',
  SPECIAL: 'Monitor',
  UNKNOWN: 'Monitor',
};

/** Tier cut-offs (applied after special-casing award/ineligible/closed). */
export const TIER_CUTS = { pursue: 60, qualify: 40, monitor: 25 };

/**
 * Map a raw SAM.gov "Type" string to a normalized bucket.
 * SAM values seen in exports: Solicitation, Combined Synopsis/Solicitation,
 * Sources Sought, Presolicitation, Award Notice, Special Notice, Sale of Surplus, Justification.
 */
export function normalizeType(raw: string): OppType {
  const t = (raw || '').toLowerCase();
  if (t.includes('combined') || t.includes('solicitation')) {
    if (t.includes('pre')) return 'PRESOLICITATION';
    return 'SOLICITATION';
  }
  if (t.includes('sources sought') || t.includes('rfi') || t.includes('request for information'))
    return 'SOURCES_SOUGHT';
  if (t.includes('presolicitation') || t.includes('synopsis')) return 'PRESOLICITATION';
  if (t.includes('award')) return 'AWARD';
  if (t.includes('special')) return 'SPECIAL';
  return 'UNKNOWN';
}

/**
 * Map a raw SAM.gov SetAsideCode (or the human-readable SetAside label) to a
 * normalized category. Codes reference the SAM.gov contract-opportunities data model.
 */
export function normalizeSetAside(code: string, label = ''): SetAside {
  const c = (code || '').toUpperCase().trim();
  const l = (label || '').toLowerCase();

  const byCode: Record<string, SetAside> = {
    SBA: 'SB',
    SBP: 'SB',
    '8A': 'EIGHT_A',
    '8AN': 'EIGHT_A',
    HZC: 'HUBZONE',
    HZS: 'HUBZONE',
    SDVOSBC: 'SDVOSB',
    SDVOSBS: 'SDVOSB',
    VSA: 'VOSB',
    VSS: 'VOSB',
    WOSB: 'WOSB',
    WOSBSS: 'WOSB',
    EDWOSB: 'EDWOSB',
    EDWOSBSS: 'EDWOSB',
    IEE: 'OTHER',
    ISBEE: 'OTHER',
    BI: 'OTHER',
    LAS: 'OTHER',
  };
  if (c && byCode[c]) return byCode[c];

  // Fall back to parsing the human-readable label.
  if (l.includes('service-disabled') || l.includes('sdvosb')) return 'SDVOSB';
  if (l.includes('veteran')) return 'VOSB';
  if (l.includes('economically disadvantaged') || l.includes('edwosb')) return 'EDWOSB';
  if (l.includes('women') || l.includes('woman') || l.includes('wosb')) return 'WOSB';
  if (l.includes('hubzone')) return 'HUBZONE';
  if (l.includes('8(a)') || l.includes('8a')) return 'EIGHT_A';
  if (l.includes('total small') || l.includes('partial small') || l.includes('small business'))
    return 'SB';
  if (l.includes('indian') || l.includes('tribal') || l.includes('local area')) return 'OTHER';
  return 'OPEN';
}

/** Is the client eligible to compete under a given set-aside? */
export function isEligible(setAside: SetAside, certs: Certifications): boolean {
  switch (setAside) {
    case 'OPEN':
      return true; // anyone can compete on full & open
    case 'SB':
      return certs.smallBusiness;
    case 'SDVOSB':
      return certs.sdvosb;
    case 'VOSB':
      return certs.vosb || certs.sdvosb; // SDVOSB is a superset of VOSB
    case 'WOSB':
      return certs.wosb || certs.edwosb;
    case 'EDWOSB':
      return certs.edwosb;
    case 'HUBZONE':
      return certs.hubzone;
    case 'EIGHT_A':
      return certs.eightA;
    case 'OTHER':
      return false; // tribal / Buy-Indian / local-area — conservatively ineligible
    default:
      return false;
  }
}

/** Human-readable short label for a set-aside chip. */
export function setAsideLabel(sa: SetAside): string {
  return {
    OPEN: 'Open',
    SB: 'Small biz',
    SDVOSB: 'SDVOSB',
    VOSB: 'VOSB',
    WOSB: 'WOSB',
    EDWOSB: 'EDWOSB',
    HUBZONE: 'HUBZone',
    EIGHT_A: '8(a)',
    OTHER: 'Restricted',
  }[sa];
}
