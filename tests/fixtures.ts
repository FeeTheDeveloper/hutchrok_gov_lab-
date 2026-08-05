import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseBusinessProfile, type BusinessProfile } from '../src/business/index.js';
import { parseOpportunityProject, parseSolicitationAnalysis, type OpportunityProject, type SolicitationAnalysis } from '../src/bids/index.js';

const read = (path: string): unknown => JSON.parse(readFileSync(resolve(path), 'utf8'));

export function businessFixture(): BusinessProfile { return parseBusinessProfile(read('examples/business-profile.hutchrok.json')); }
export function opportunityFixture(): OpportunityProject { return parseOpportunityProject(read('examples/opportunity-project.example.json')); }
export function analysisFixture(): SolicitationAnalysis { return parseSolicitationAnalysis(read('examples/solicitation-analysis.example.json')); }
