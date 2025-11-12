/**
 * Test Command
 *
 * Handles @yofix test <url> [viewports] commands
 */

import * as core from '@actions/core';
import {
  BaseCommand,
  ParsedCommandData,
  CommandValidationResult,
  CommandExecutionResult,
  CommandContext,
} from './BaseCommand';
import { StepData } from '../../../steps/shared/StepDataManager';

export class TestCommand extends BaseCommand {
  readonly name = 'test';
  readonly description = 'Test a specific URL with visual regression testing';
  readonly usage = '@yofix test <url> [viewports]\n\nExamples:\n  @yofix test "https://app.example.com/page"\n  @yofix test https://app.example.com/page 360x700,1080x1200';

  /**
   * Parse test command from comment body
   */
  parse(commentBody: string): ParsedCommandData | null {
    // Pattern: @yofix test <url> [viewports]
    const pattern = /@yofix\s+test\s+([^\s]+)(?:\s+([^\s]+))?/i;
    const match = commentBody.match(pattern);

    if (!match) {
      return null;
    }

    const [raw, urlArg, viewportsArg] = match;

    return {
      command: 'test',
      args: [urlArg, viewportsArg].filter(Boolean),
      raw,
    };
  }

  /**
   * Validate test command arguments
   */
  validate(parsed: ParsedCommandData): CommandValidationResult {
    if (parsed.args.length === 0) {
      return {
        valid: false,
        error: 'Test command requires a URL.\n\nUsage:\n' + this.usage,
      };
    }

    const urlArg = parsed.args[0];
    const url = this.extractUrl(urlArg);

    if (!url) {
      return {
        valid: false,
        error: `Invalid URL format: "${urlArg}"\n\nExpected: https://example.com/page`,
      };
    }

    // Validate viewports if provided
    if (parsed.args.length > 1) {
      const viewportsArg = parsed.args[1];
      if (!this.validateViewportFormat(viewportsArg)) {
        return {
          valid: false,
          error: `Invalid viewport format: "${viewportsArg}"\n\nExpected: widthxheight,widthxheight (e.g., 360x700,1080x1200)`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Execute test command
   */
  async execute(
    parsed: ParsedCommandData,
    context: CommandContext,
    stepData: StepData
  ): Promise<CommandExecutionResult> {
    try {
      const urlArg = parsed.args[0];
      const url = this.extractUrl(urlArg)!;

      core.info(`🧪 Executing test command for URL: ${url}`);

      // Parse custom viewports if provided
      let customViewports;
      if (parsed.args.length > 1) {
        const viewportsArg = parsed.args[1];
        customViewports = this.parseViewports(viewportsArg);
        core.info(`📱 Custom viewports: ${customViewports.map(v => v.name).join(', ')}`);
      } else {
        core.info('📱 Using default viewports from action configuration');
      }

      // Return step data modifications
      return {
        success: true,
        stepData: {
          testUrl: url,
          ...(customViewports && { customViewports }),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute test command: ${error}`,
      };
    }
  }
}
