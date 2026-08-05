import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it } from 'vitest';
import { assessBid, generateCapturePlan, generateComplianceMatrix, writeComplianceMatrix } from '../src/bids/index.js';
import { ProposalPackageBuilder } from '../src/documents/index.js';
import { businessFixture, opportunityFixture, analysisFixture } from './fixtures.js';

const dirs: string[] = [];
const temp = () => { const value = mkdtempSync(join(tmpdir(), 'govready-test-')); dirs.push(value); return value; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe('compliance and proposal artifacts', () => {
  it('generates branded JSON and Excel compliance matrices', async () => {
    const matrix = generateComplianceMatrix(analysisFixture()); const dir = temp();
    const json = join(dir, 'compliance-matrix.json'); const xlsx = join(dir, 'compliance-matrix.xlsx');
    await writeComplianceMatrix(matrix, json, xlsx);
    expect(matrix.requirements.length).toBeGreaterThan(5);
    expect(JSON.parse(readFileSync(json, 'utf8')).draftStatus).toBe('DO NOT SUBMIT — DRAFT');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xlsx);
    expect(wb.getWorksheet('Compliance Matrix')?.getCell('A1').value).toContain('DO NOT SUBMIT');
  });

  it('creates the complete workspace with placeholders and excludes unverified claims', async () => {
    const business = businessFixture();
    business.proposalAssets.reusableTechnicalApproach = { content: 'UNVERIFIED SECRET CAPABILITY CLAIM', verified: false };
    business.proposalAssets.pastPerformanceRecords = [{ projectName: 'Unverified Contract', customer: 'Unknown Agency', description: 'Should never render', verified: false }];
    const opportunity = opportunityFixture(); const analysis = analysisFixture();
    const assessment = assessBid(business, opportunity, analysis, { today: '2026-08-05' });
    const matrix = generateComplianceMatrix(analysis); const capture = generateCapturePlan(business, opportunity, analysis, assessment);
    const result = await new ProposalPackageBuilder().build({ business, opportunity, analysis, assessment, complianceMatrix: matrix, capturePlan: capture }, temp());
    const expected = ['proposal-manifest.json', 'capture-plan.md', 'compliance-matrix.xlsx', 'executive-summary.md', 'technical-approach.md', 'management-plan.md', 'staffing-plan.md', 'quality-control-plan.md', 'transition-plan.md', 'past-performance.md', 'pricing-narrative.md', 'submission-checklist.md', 'risk-register.md', 'review-log.md'];
    expected.forEach((file) => expect(result.files).toContain(file));
    const allMarkdown = result.files.filter((file) => file.endsWith('.md')).map((file) => readFileSync(join(result.workspaceDir, file), 'utf8')).join('\n');
    expect(allMarkdown).toContain('DO NOT SUBMIT — DRAFT');
    expect(allMarkdown).toContain('Official solicitation instructions and amendments control');
    expect(allMarkdown).toContain('[REQUIRED INPUT:');
    expect(allMarkdown).not.toContain('UNVERIFIED SECRET CAPABILITY CLAIM');
    expect(allMarkdown).not.toContain('Unverified Contract');
  });
});
