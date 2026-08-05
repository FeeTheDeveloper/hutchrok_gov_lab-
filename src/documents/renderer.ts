import type { RenderContext, TemplateRenderer } from './types.js';

export const REQUIRED_INPUT = (instruction: string): string => `[REQUIRED INPUT: ${instruction}]`;

export class MarkdownTemplateRenderer implements TemplateRenderer {
  render(context: RenderContext): string {
    const references = context.complianceReferences?.length
      ? `\n## Compliance References\n\n${context.complianceReferences.map((value) => `- ${value}`).join('\n')}\n`
      : '';
    return `# DO NOT SUBMIT — DRAFT\n\n# ${context.title}\n\n> Official solicitation instructions and amendments control. This working draft requires verification and authorized human review before release.\n\n## Section Instructions\n\n${context.instructions}\n${references}\n${context.body.trim()}\n`;
  }
}
