import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { server } from '../src/server.js';
import { businessFixture, opportunityFixture } from './fixtures.js';

const dataDir = mkdtempSync(join(tmpdir(), 'govready-api-'));
let base = '';

beforeAll(async () => {
  process.env.GOVREADY_DATA_DIR = dataDir;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  delete process.env.GOVREADY_DATA_DIR;
  rmSync(dataDir, { recursive: true, force: true });
});

describe('local Bid Operations API', () => {
  it('persists and retrieves validated businesses and bids', async () => {
    const businessResponse = await fetch(`${base}/api/businesses`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-govready-actor': 'King Fee' }, body: JSON.stringify({ profile: businessFixture() }) });
    expect(businessResponse.status).toBe(201);
    const bidResponse = await fetch(`${base}/api/bids`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-govready-actor': 'King Fee' }, body: JSON.stringify({ opportunity: opportunityFixture() }) });
    expect(bidResponse.status).toBe(201);
    const getResponse = await fetch(`${base}/api/bids/hsg-example-r408`);
    expect(getResponse.status).toBe(200);
    expect((await getResponse.json()).bid.title).toBe('Example Acquisition Support Services');
  });
});
