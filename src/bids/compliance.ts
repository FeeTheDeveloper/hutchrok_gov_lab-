import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { SolicitationAnalysis } from './schema.js';

export const ComplianceStatusSchema = z.enum(['not-started', 'drafting', 'complete', 'needs-review', 'approved', 'not-applicable']);
export const ComplianceRequirementSchema = z.object({
  requirementId: z.string(), sourceSection: z.string(), sourcePage: z.number().int().positive().optional(),
  requirementText: z.string(), category: z.string(), mandatory: z.boolean(), proposalVolume: z.string().optional(),
  assignedOwner: z.string().optional(), responseLocation: z.string().optional(), status: ComplianceStatusSchema,
  reviewerNotes: z.string().optional(), dueDate: z.string().date().optional(),
}).strict();
export const ComplianceMatrixSchema = z.object({
  projectId: z.string(), generatedAt: z.string().datetime(), draftStatus: z.literal('DO NOT SUBMIT — DRAFT'),
  officialInstructionsControl: z.literal(true), requirements: z.array(ComplianceRequirementSchema),
}).strict();
export type ComplianceRequirement = z.infer<typeof ComplianceRequirementSchema>;
export type ComplianceMatrix = z.infer<typeof ComplianceMatrixSchema>;

export function generateComplianceMatrix(analysis: SolicitationAnalysis): ComplianceMatrix {
  let sequence = 0;
  const requirements: ComplianceRequirement[] = [];
  const add = (items: string[], category: string, section: string, mandatory = true) => items.forEach((text) => requirements.push({
    requirementId: `REQ-${String(++sequence).padStart(3, '0')}`, sourceSection: section,
    requirementText: text, category, mandatory, status: 'not-started',
  }));
  add(analysis.mandatoryRequirements, 'mandatory-requirement', 'Solicitation analysis — mandatory requirements');
  add(analysis.submissionInstructions, 'submission', 'Solicitation analysis — submission instructions');
  add(analysis.requiredForms, 'form', 'Solicitation analysis — required forms');
  add(analysis.requiredCertifications, 'certification', 'Solicitation analysis — required certifications');
  add(analysis.deliverables, 'deliverable', 'Solicitation analysis — deliverables');
  add(analysis.pricingInstructions, 'pricing', 'Solicitation analysis — pricing instructions');
  add(analysis.pastPerformanceRequirements, 'past-performance', 'Solicitation analysis — past performance');
  add(analysis.staffingRequirements, 'staffing', 'Solicitation analysis — staffing');
  add(analysis.securityRequirements, 'security', 'Solicitation analysis — security');
  add(analysis.insuranceRequirements, 'insurance', 'Solicitation analysis — insurance');
  add(analysis.bondingRequirements, 'bonding', 'Solicitation analysis — bonding');
  add(analysis.subcontractingRequirements, 'subcontracting', 'Solicitation analysis — subcontracting');
  add(analysis.siteVisitRequirements, 'site-visit', 'Solicitation analysis — site visit');
  add(analysis.oralPresentationRequirements, 'oral-presentation', 'Solicitation analysis — oral presentation');
  add(analysis.amendmentRequirements, 'amendment', 'Solicitation analysis — amendments');
  for (const factor of analysis.evaluationFactors) add([`${factor.name}: ${factor.details}${factor.weight ? ` (weight: ${factor.weight})` : ''}`], 'evaluation-factor', 'Solicitation analysis — evaluation factors');
  return ComplianceMatrixSchema.parse({ projectId: analysis.projectId, generatedAt: new Date().toISOString(), draftStatus: 'DO NOT SUBMIT — DRAFT', officialInstructionsControl: true, requirements });
}

export async function writeComplianceMatrix(matrix: ComplianceMatrix, jsonPath: string, xlsxPath: string): Promise<void> {
  mkdirSync(dirname(jsonPath), { recursive: true }); writeFileSync(jsonPath, JSON.stringify(matrix, null, 2), 'utf8');
  const wb = new ExcelJS.Workbook(); wb.creator = 'Hutchrok Solutions Group LLC';
  const ws = wb.addWorksheet('Compliance Matrix', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.mergeCells('A1:M1'); ws.getCell('A1').value = 'DO NOT SUBMIT — DRAFT · HUTCHROK GOVREADY LAB';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 }; ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E5E' } };
  ws.mergeCells('A2:M2'); ws.getCell('A2').value = 'Official solicitation instructions and amendments control. Verify every requirement against the source.';
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF8A6400' } };
  const headers = ['ID', 'Source Section', 'Page', 'Requirement', 'Category', 'Mandatory', 'Volume', 'Owner', 'Response Location', 'Status', 'Reviewer Notes', 'Due Date', 'Verified'];
  const row = ws.getRow(4); row.values = headers; row.eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E5E' } }; });
  matrix.requirements.forEach((item) => ws.addRow([item.requirementId, item.sourceSection, item.sourcePage ?? '', item.requirementText, item.category, item.mandatory ? 'Yes' : 'No', item.proposalVolume ?? '', item.assignedOwner ?? '', item.responseLocation ?? '', item.status, item.reviewerNotes ?? '', item.dueDate ?? '', 'No']));
  [14, 34, 8, 60, 22, 12, 18, 18, 28, 18, 35, 14, 12].forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  ws.eachRow((r, index) => { if (index >= 4) r.alignment = { vertical: 'top', wrapText: true }; });
  ws.autoFilter = { from: 'A4', to: 'M4' }; await wb.xlsx.writeFile(xlsxPath);
}
