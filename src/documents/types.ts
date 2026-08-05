import { z } from 'zod';

export const ProposalManifestSchema = z.object({
  projectId: z.string(), businessId: z.string(), generatedAt: z.string().datetime(),
  status: z.literal('DO NOT SUBMIT — DRAFT'), officialInstructionsControl: z.literal(true),
  artifacts: z.array(z.object({ file: z.string(), kind: z.string(), status: z.enum(['draft', 'generated', 'needs-input']) }).strict()),
  approvals: z.record(z.object({ status: z.string(), approvedBy: z.string().optional(), approvedAt: z.string().optional() }).passthrough()),
  prohibitedAutomations: z.array(z.string()),
}).strict();
export type ProposalManifest = z.infer<typeof ProposalManifestSchema>;

export interface RenderContext {
  title: string;
  instructions: string;
  complianceReferences?: string[];
  body: string;
}

export interface TemplateRenderer {
  render(context: RenderContext): string;
}

export interface DocumentGenerator<TInput = unknown> {
  readonly fileName: string;
  generate(input: TInput): string | Promise<string>;
}
