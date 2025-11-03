import * as core from '@actions/core';
import { Anthropic } from '@anthropic-ai/sdk';
import { VisualIssue, CodeFix, FileFix, FixResult } from '../../bot/types';
import { FixValidator } from './FixValidator';
import { FixTemplates } from './FixTemplates';
import { CacheManager } from '../../optimization/CacheManager';
import config from '../../config';

/**
 * AI-powered fix generator that generates code fixes for visual issues
 */
export class FixGenerator {
  private claude: Anthropic;
  private validator: FixValidator;
  private templates: FixTemplates;
  private cache: CacheManager;

  constructor(claudeApiKey: string, cache?: CacheManager) {
    this.claude = new Anthropic({ apiKey: claudeApiKey });
    this.validator = new FixValidator();
    this.templates = new FixTemplates();
    this.cache = cache || new CacheManager();
  }

  /**
   * Generate fixes for multiple issues
   */
  async generateFixes(issues: VisualIssue[]): Promise<FixResult> {
    const fixes: CodeFix[] = [];
    const errors: string[] = [];

    for (const issue of issues) {
      try {
        const fix = await this.generateFix(issue);
        if (fix) {
          fixes.push(fix);
        }
      } catch (error) {
        errors.push(`Failed to generate fix for issue #${issue.id}: ${error.message}`);
      }
    }

    return {
      generated: fixes.length,
      applied: 0,
      fixes,
      errors
    };
  }

  /**
   * Generate intelligent fixes for visual issues
   */
  async generateFix(issue: VisualIssue): Promise<CodeFix | null> {
    try {
      // Step 1: Get fix template if available
      const template = this.templates.getTemplate(issue.type);

      // Step 2: Build contextual prompt
      const prompt = this.buildContextualPrompt(issue, template);

      // Step 3: Generate fix with Claude (with caching)
      const cacheKey = this.cache.createAIResponseKey({
        model: config.get('ai.claude.models.fixing'),
        prompt,
        temperature: config.get('ai.claude.temperature', 0.3),
        maxTokens: 2048
      });

      const fixData = await this.cache.wrap(
        cacheKey,
        () => this.generateWithClaude(prompt, issue),
        { ttl: 7200 } // Cache for 2 hours
      );

      if (!fixData) {
        return null;
      }

      // Step 4: Validate the fix
      const validated = await this.validator.validate(fixData, issue);

      if (!validated.isValid) {
        core.warning(`Fix validation failed: ${validated.reason}`);
        return null;
      }

      // Step 5: Format and return
      return {
        id: Date.now(),
        issueId: issue.id,
        description: fixData.description,
        confidence: fixData.confidence,
        files: fixData.files
      };

    } catch (error) {
      core.error(`Failed to generate fix: ${error.message}`);
      return null;
    }
  }

  /**
   * Build contextual prompt for Claude
   */
  private buildContextualPrompt(issue: VisualIssue, template?: any): string {
    let prompt = `Generate a code fix for this visual issue:

Issue Type: ${issue.type}
Severity: ${issue.severity}
Description: ${issue.description}
Affected Viewports: ${issue.affectedViewports.join(', ')}
Location: ${issue.location.route}
${issue.location.selector ? `CSS Selector: ${issue.location.selector}` : ''}
${issue.location.file ? `File: ${issue.location.file}` : ''}

Requirements:
1. The fix MUST resolve the visual issue
2. Use minimal changes - don't refactor unnecessarily
3. Maintain existing functionality
4. Follow responsive design best practices
5. Ensure cross-browser compatibility`;

    // Add template guidance if available
    if (template) {
      prompt += `\n\nRecommended approach for ${issue.type}:
${template.description}
Common solutions:
${template.solutions.map((s: any) => `- ${s}`).join('\n')}`;
    }

    prompt += `\n\nReturn the fix in this exact JSON format:
{
  "description": "Brief description of what the fix does",
  "confidence": 0.85,
  "reasoning": "Why this fix works",
  "files": [
    {
      "path": "path/to/file.css",
      "language": "css",
      "changes": [
        {
          "type": "add|replace|remove",
          "line": 10,
          "original": "original code if type is replace",
          "content": "new code to add or replace"
        }
      ]
    }
  ]
}`;

    return prompt;
  }

  /**
   * Generate fix using Claude
   */
  private async generateWithClaude(prompt: string, issue: VisualIssue): Promise<any> {
    try {
      // Use Claude for better code generation
      const response = await this.claude.messages.create({
        model: config.get('ai.claude.models.fixing'),
        max_tokens: config.get('ai.claude.maxTokens.fixing'),
        temperature: config.get('ai.claude.temperature', 0.3),
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const responseText = response.content[0].type === 'text' ? 
        response.content[0].text : '';
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const fixData = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!fixData.files || !Array.isArray(fixData.files)) {
        throw new Error('Invalid fix format: missing files array');
      }

      // Add confidence based on issue severity and fix complexity
      if (!fixData.confidence) {
        fixData.confidence = this.calculateConfidence(issue, fixData);
      }

      return fixData;
      
    } catch (error) {
      core.error(`Claude API error: ${error.message}`);
      
      // Fallback to template-based fix if available
      const template = this.templates.getTemplate(issue.type);
      if (template && template.defaultFix) {
        return this.applyTemplateFix(issue, template);
      }
      
      return null;
    }
  }

  /**
   * Calculate confidence score for the fix
   */
  private calculateConfidence(issue: VisualIssue, fixData: any): number {
    let confidence = 0.7; // Base confidence

    // Adjust based on issue type
    const highConfidenceTypes = ['text-overflow', 'button-overlap', 'responsive-breakage'];
    const lowConfidenceTypes = ['layout-shift', 'complex-alignment'];
    
    if (highConfidenceTypes.includes(issue.type)) {
      confidence += 0.15;
    } else if (lowConfidenceTypes.includes(issue.type)) {
      confidence -= 0.15;
    }

    // Adjust based on fix complexity
    const totalChanges = fixData.files.reduce((sum: number, file: any) => 
      sum + (file.changes?.length || 0), 0
    );
    
    if (totalChanges <= 3) {
      confidence += 0.1; // Simple fixes are more reliable
    } else if (totalChanges > 10) {
      confidence -= 0.1; // Complex fixes are riskier
    }

    // Adjust based on viewport specificity
    if (issue.affectedViewports.length === 1) {
      confidence += 0.05; // Single viewport issues are easier
    }

    return Math.max(0.3, Math.min(0.95, confidence));
  }

  /**
   * Apply template-based fix as fallback
   */
  private applyTemplateFix(issue: VisualIssue, template: any): any {
    const defaultFix = template.defaultFix;
    
    // Customize based on issue details
    const customized = {
      ...defaultFix,
      description: `Fix ${issue.type} on ${issue.affectedViewports.join(', ')} viewport(s)`,
      confidence: 0.6, // Lower confidence for template fixes
      files: defaultFix.files.map((file: any) => ({
        ...file,
        path: issue.location.file || file.path,
        changes: file.changes.map((change: any) => ({
          ...change,
          content: change.content
            .replace('{{selector}}', issue.location.selector || '.element')
            .replace('{{viewport}}', issue.affectedViewports[0] || 'mobile')
        }))
      }))
    };

    return customized;
  }

}