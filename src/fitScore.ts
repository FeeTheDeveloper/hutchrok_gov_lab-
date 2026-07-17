import type {
  Intake, Opportunity, ScoredOpportunity, Tier, AssistanceListing, GrantMatch, Report,
} from './types.js';
import { WEIGHTS, ACTION_BY_TYPE, TIER_CUTS, isEligible } from './config.js';
import { strengthKeywords } from './intake.js';

/** Whole days from `today` (ISO date) to a deadline (ISO date). */
export function daysBetween(todayIso: string, deadlineIso: string | null): number | null {
  if (!deadlineIso) return null;
  const a = Date.parse(todayIso + 'T00:00:00Z');
  const b = Date.parse(deadlineIso + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Does the opportunity's NAICS fall inside the client's swept lanes? */
function inLane(naics: string, lanes: string[]): boolean {
  if (!naics) return true; // unknown NAICS: don't penalize, the sweep was per-lane
  return lanes.some((l) => l && (naics === l || naics.startsWith(l) || l.startsWith(naics)));
}

function assignTier(
  score: number,
  eligible: boolean,
  type: Opportunity['type'],
  days: number | null,
): Tier {
  // Award notices and things you can't win are intel, regardless of score.
  if (type === 'AWARD') return 'INTEL';
  if (!eligible) return 'INTEL';
  if (days !== null && days < 0) return 'INTEL'; // already closed
  if (score >= TIER_CUTS.pursue) return 'PURSUE';
  if (score >= TIER_CUTS.qualify) return 'QUALIFY';
  if (score >= TIER_CUTS.monitor) return 'MONITOR';
  return 'INTEL';
}

export function scoreOpportunity(
  o: Opportunity,
  intake: Intake,
  todayIso: string,
  keywords: string[],
): ScoredOpportunity {
  const reasons: string[] = [];
  const eligible = isEligible(o.setAside, intake.certifications);

  // 1. Opportunity type
  const typePts = WEIGHTS.type[o.type];
  reasons.push(`${ACTION_BY_TYPE[o.type]} (${o.rawType || o.type})`);

  // 2. Set-aside eligibility
  let setAsidePts = 0;
  if (o.setAside === 'OPEN') {
    reasons.push('Unrestricted — open competition');
  } else if (eligible) {
    setAsidePts = WEIGHTS.setAsideEligible[o.setAside];
    reasons.push(`${o.rawSetAside || o.setAside} set-aside — you qualify`);
  } else {
    setAsidePts = WEIGHTS.ineligiblePenalty;
    reasons.push(`${o.rawSetAside || o.setAside} set-aside — you are NOT eligible`);
  }

  // 3. Deadline runway
  const days = daysBetween(todayIso, o.responseDeadline);
  const dl = WEIGHTS.deadline(days);
  reasons.push(dl.note);

  // 4. Strength match against title + description
  const haystack = `${o.title} ${o.description}`.toLowerCase();
  const hits = [...new Set(keywords.filter((k) => k && haystack.includes(k)))];
  const strengthPts = Math.min(hits.length * WEIGHTS.strengthPerHit, WEIGHTS.strengthCap);
  if (hits.length) reasons.push(`strength match: ${hits.join(', ')}`);

  // 5. Lane adjustment
  const laneAdjust = inLane(o.naics, intake.naicsLanes) ? 0 : WEIGHTS.offLanePenalty;
  if (laneAdjust !== 0) reasons.push(`outside your NAICS lanes (${o.naics})`);

  const raw = typePts + setAsidePts + dl.pts + strengthPts + laneAdjust;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const tier = assignTier(score, eligible, o.type, days);

  return {
    ...o,
    score,
    tier,
    eligible,
    daysToDeadline: days,
    action: ACTION_BY_TYPE[o.type],
    reasons,
    components: {
      type: typePts,
      setAside: setAsidePts,
      deadline: dl.pts,
      strength: strengthPts,
      laneAdjust,
    },
  };
}

const TIER_RANK: Record<Tier, number> = { PURSUE: 0, QUALIFY: 1, MONITOR: 2, INTEL: 3 };

/**
 * Match assistance listings to the client's structural advantages
 * ("right culture, best position"). Veteran-mission programs only surface for
 * veteran-verified clients — the benefit-integrity guardrail, in code.
 */
export function matchGrants(listings: AssistanceListing[], intake: Intake): GrantMatch[] {
  const c = intake.certifications;
  const veteran = c.sdvosb || c.vosb;
  const keywords = strengthKeywords(intake);

  const matches: GrantMatch[] = [];
  for (const l of listings) {
    const text = `${l.title} ${l.description} ${l.agency}`.toLowerCase();
    const reasons: string[] = [];
    const veteranProgram = /\bveteran|\bvet\b|sdvosb|servicemember|military/.test(text);

    // Skip veteran-only programs for non-veteran clients (benefit integrity).
    if (veteranProgram && !veteran) continue;

    if (veteranProgram && veteran) reasons.push('Veteran-owned advantage · mission alignment');
    if (c.wosb || c.edwosb) {
      if (/\bwomen|\bwoman\b/.test(text)) reasons.push('Woman-owned alignment');
    }
    if (c.hubzone && /\brural|underserved|hubzone|distressed/.test(text))
      reasons.push('HUBZone / underserved-community positioning');
    if (c.eightA && /\bdisadvantaged|minority|8\(a\)/.test(text))
      reasons.push('8(a) / disadvantaged-business alignment');

    const kwHits = keywords.filter((k) => k && text.includes(k));
    if (kwHits.length) reasons.push(`capability match: ${[...new Set(kwHits)].slice(0, 4).join(', ')}`);

    if (reasons.length === 0) continue; // no structural advantage → not positioned
    matches.push({ ...l, reasons, veteranAdvantaged: veteranProgram && veteran });
  }

  // Veteran-advantaged first, then by number of matching reasons.
  return matches.sort(
    (a, b) => Number(b.veteranAdvantaged) - Number(a.veteranAdvantaged) || b.reasons.length - a.reasons.length,
  );
}

/** Readiness percentage from the intake checklist. */
export function readinessPct(intake: Intake): number {
  const r = intake.readiness;
  const vet = r.vetCertVerification;
  const vetDone = vet === true || vet === 'complete';
  const items = [
    r.samRegistered, r.ueiCage, r.repsAndCerts, vetDone,
    r.capabilityStatement, r.pastPerformanceFile, r.financialStatements, r.grantReadiness,
  ];
  return Math.round((100 * items.filter(Boolean).length) / items.length);
}

/** Score all opportunities and assemble the full report. */
export function buildReport(
  intake: Intake,
  opportunities: Opportunity[],
  listings: AssistanceListing[],
  todayIso: string,
): Report {
  const keywords = strengthKeywords(intake);

  // Only score opportunities in the client's lanes (the sweep is per-lane).
  const inLaneOps = opportunities.filter((o) => inLane(o.naics, intake.naicsLanes));

  const scored = inLaneOps
    .map((o) => scoreOpportunity(o, intake, todayIso, keywords))
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.score - a.score);

  const grants = matchGrants(listings, intake);

  const stats = {
    inLane: scored.length,
    pursue: scored.filter((o) => o.tier === 'PURSUE').length,
    qualify: scored.filter((o) => o.tier === 'QUALIFY').length,
    monitor: scored.filter((o) => o.tier === 'MONITOR').length,
    intel: scored.filter((o) => o.tier === 'INTEL').length,
    eligible: scored.filter((o) => o.eligible && o.setAside !== 'OPEN').length,
    urgent: scored.filter((o) => o.daysToDeadline !== null && o.daysToDeadline >= 0 && o.daysToDeadline <= 7).length,
    readinessPct: readinessPct(intake),
  };

  return {
    intake,
    generatedAt: new Date().toISOString(),
    today: todayIso,
    opportunities: scored,
    grants,
    stats,
  };
}
