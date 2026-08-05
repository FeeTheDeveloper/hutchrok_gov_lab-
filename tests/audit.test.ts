import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BidOperationsService, GovReadyStore, readAuditEvents } from '../src/bids/index.js';
import { businessFixture, opportunityFixture } from './fixtures.js';

let dir = '';
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });

describe('audit logging', () => {
  it('creates append-only events for profile and opportunity persistence', () => {
    dir = mkdtempSync(join(tmpdir(), 'govready-audit-'));
    const service = new BidOperationsService(new GovReadyStore(dir));
    service.saveBusiness(businessFixture(), 'King Fee');
    service.saveOpportunity(opportunityFixture(), 'King Fee');
    const date = new Date().toISOString().slice(0, 10);
    const events = readAuditEvents(join(dir, 'audit', `${date}.jsonl`));
    expect(events.map((event) => event.action)).toEqual(['business.created', 'opportunity.imported']);
    expect(events.every((event) => event.actor === 'King Fee')).toBe(true);
  });

  it('does not let a stale working copy overwrite persistent approvals or status', () => {
    dir = mkdtempSync(join(tmpdir(), 'govready-audit-'));
    const service = new BidOperationsService(new GovReadyStore(dir));
    service.saveBusiness(businessFixture(), 'King Fee');
    const stale = opportunityFixture();
    service.saveOpportunity(stale, 'King Fee');
    service.changeStatus(stale.projectId, 'bid-review', 'King Fee');
    service.approveGate(stale.projectId, 'bidNoBid', 'King Fee');
    service.changeStatus(stale.projectId, 'pursuing', 'King Fee');
    const preserved = service.ensureOpportunity(stale, 'King Fee');
    expect(preserved.status).toBe('pursuing');
    expect(preserved.approvals.bidNoBid.status).toBe('approved');
  });
});
