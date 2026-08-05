import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { BusinessProfile } from '../business/schema.js';
import { BusinessProfileSchema } from '../business/schema.js';
import type { OpportunityProject } from './schema.js';
import { OpportunityProjectSchema } from './schema.js';

export function resolveDataDir(override?: string): string {
  return resolve(override || process.env.GOVREADY_DATA_DIR || '.govready');
}

function safeId(id: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error(`Unsafe record ID: ${id}`);
  return id;
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  renameSync(temp, path);
}

export class GovReadyStore {
  readonly root: string;
  constructor(root?: string) {
    this.root = resolveDataDir(root);
    for (const dir of ['businesses', 'opportunities', 'proposals', 'audit']) mkdirSync(join(this.root, dir), { recursive: true });
  }

  saveBusiness(profile: BusinessProfile): string {
    const value = BusinessProfileSchema.parse(profile);
    const path = join(this.root, 'businesses', `${safeId(value.businessId)}.json`);
    writeJsonAtomic(path, value); return path;
  }
  getBusiness(id: string): BusinessProfile {
    return BusinessProfileSchema.parse(JSON.parse(readFileSync(join(this.root, 'businesses', `${safeId(id)}.json`), 'utf8')));
  }
  listBusinesses(): BusinessProfile[] {
    return this.list('businesses').map((path) => BusinessProfileSchema.parse(JSON.parse(readFileSync(path, 'utf8'))));
  }
  saveOpportunity(project: OpportunityProject): string {
    const value = OpportunityProjectSchema.parse(project);
    const path = join(this.root, 'opportunities', `${safeId(value.projectId)}.json`);
    writeJsonAtomic(path, value); return path;
  }
  getOpportunity(id: string): OpportunityProject {
    return OpportunityProjectSchema.parse(JSON.parse(readFileSync(join(this.root, 'opportunities', `${safeId(id)}.json`), 'utf8')));
  }
  listOpportunities(): OpportunityProject[] {
    return this.list('opportunities').map((path) => OpportunityProjectSchema.parse(JSON.parse(readFileSync(path, 'utf8'))));
  }
  proposalDir(projectId: string): string { return join(this.root, 'proposals', safeId(projectId)); }
  private list(kind: 'businesses' | 'opportunities'): string[] {
    const dir = join(this.root, kind);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => join(dir, name));
  }
}
