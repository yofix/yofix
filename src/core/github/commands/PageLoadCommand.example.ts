/**
 * Example: PageLoad Command
 *
 * This is an example showing how easy it is to add new commands.
 * To enable this command:
 * 1. Rename this file to PageLoadCommand.ts
 * 2. Implement the execute() method
 * 3. Register it in CommandRegistry.ts
 *
 * Usage: @yofix pageload app.tryloop.ai/home
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

export class PageLoadCommand extends BaseCommand {
  readonly name = 'pageload';
  readonly description = 'Measure page load time for a specific URL';
  readonly usage = '@yofix pageload <url>\n\nExample:\n  @yofix pageload app.tryloop.ai/home';

  /**
   * Parse pageload command from comment body
   */
  parse(commentBody: string): ParsedCommandData | null {
    // Pattern: @yofix pageload <url>
    const pattern = /@yofix\s+pageload\s+([^\s]+)/i;
    const match = commentBody.match(pattern);

    if (!match) {
      return null;
    }

    const [raw, urlArg] = match;

    return {
      command: 'pageload',
      args: [urlArg],
      raw,
    };
  }

  /**
   * Validate pageload command arguments
   */
  validate(parsed: ParsedCommandData): CommandValidationResult {
    if (parsed.args.length === 0) {
      return {
        valid: false,
        error: 'PageLoad command requires a URL.\n\nUsage:\n' + this.usage,
      };
    }

    const urlArg = parsed.args[0];
    const url = this.extractUrl(urlArg);

    if (!url) {
      return {
        valid: false,
        error: `Invalid URL format: "${urlArg}"\n\nExpected: https://example.com/page or example.com/page`,
      };
    }

    return { valid: true };
  }

  /**
   * Execute pageload command
   *
   * TODO: Implement page load measurement logic
   */
  async execute(
    parsed: ParsedCommandData,
    context: CommandContext,
    stepData: StepData
  ): Promise<CommandExecutionResult> {
    try {
      const urlArg = parsed.args[0];
      let url = this.extractUrl(urlArg);

      // Add https:// if not present
      if (!url && /^[\w\-.]+\//.test(urlArg)) {
        url = `https://${urlArg}`;
      }

      core.info(`📊 Measuring page load time for: ${url}`);

      // TODO: Implement page load measurement using @yofix/browser
      // 1. Launch browser
      // 2. Navigate to URL with performance metrics
      // 3. Capture timing data (DOMContentLoaded, Load, FCP, LCP, etc.)
      // 4. Post results as comment

      const mockResult = {
        url,
        metrics: {
          DOMContentLoaded: 1234,
          Load: 2345,
          FCP: 890,
          LCP: 1500,
        },
        timestamp: Date.now(),
      };

      core.info(`✅ Page load metrics captured`);
      core.info(`  DOM Content Loaded: ${mockResult.metrics.DOMContentLoaded}ms`);
      core.info(`  Page Load: ${mockResult.metrics.Load}ms`);
      core.info(`  First Contentful Paint: ${mockResult.metrics.FCP}ms`);
      core.info(`  Largest Contentful Paint: ${mockResult.metrics.LCP}ms`);

      // Store in step data for posting in Step 4
      return {
        success: true,
        stepData: {
          _internal: {
            pageLoadMetrics: mockResult,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to measure page load: ${error}`,
      };
    }
  }
}

/*
 * To enable this command:
 *
 * 1. In CommandRegistry.ts, add to registerBuiltInCommands():
 *    this.registerCommand(new PageLoadCommand());
 *
 * 2. That's it! The command will automatically be available.
 *
 * Users can then use: @yofix pageload app.tryloop.ai/home
 */
