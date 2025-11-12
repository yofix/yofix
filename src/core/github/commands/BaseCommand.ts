/**
 * Base Command Interface
 *
 * Provides a scalable pattern for adding new @yofix commands.
 * Each command should implement this interface.
 */

import { StepData } from '../../../steps/shared/StepDataManager';

export interface CommandContext {
  commentId: number;
  commentUrl: string;
  commentBody: string;
  commentAuthor: string;
}

export interface ParsedCommandData {
  command: string;
  args: string[];
  raw: string;
}

export interface CommandValidationResult {
  valid: boolean;
  error?: string;
}

export interface CommandExecutionResult {
  success: boolean;
  stepData?: Partial<StepData>;
  error?: string;
}

/**
 * Base command interface that all commands must implement
 */
export interface ICommand {
  /**
   * Command name (e.g., "test", "baseline", "compare")
   */
  readonly name: string;

  /**
   * Command description for help text
   */
  readonly description: string;

  /**
   * Command usage example
   */
  readonly usage: string;

  /**
   * Parse command arguments from comment
   */
  parse(commentBody: string): ParsedCommandData | null;

  /**
   * Validate command arguments
   */
  validate(parsed: ParsedCommandData): CommandValidationResult;

  /**
   * Execute the command
   */
  execute(parsed: ParsedCommandData, context: CommandContext, stepData: StepData): Promise<CommandExecutionResult>;
}

/**
 * Abstract base class for commands
 */
export abstract class BaseCommand implements ICommand {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly usage: string;

  abstract parse(commentBody: string): ParsedCommandData | null;
  abstract validate(parsed: ParsedCommandData): CommandValidationResult;
  abstract execute(parsed: ParsedCommandData, context: CommandContext, stepData: StepData): Promise<CommandExecutionResult>;

  /**
   * Helper to extract URL from string (handles quoted and unquoted)
   */
  protected extractUrl(arg: string): string | null {
    // Remove quotes if present
    const cleaned = arg.replace(/^["']|["']$/g, '');

    // Basic URL validation
    if (/^https?:\/\/.+/.test(cleaned)) {
      return cleaned;
    }

    return null;
  }

  /**
   * Helper to validate viewport format
   */
  protected validateViewportFormat(viewportStr: string): boolean {
    return /^(\d+x\d+)(,\d+x\d+)*$/.test(viewportStr);
  }

  /**
   * Helper to parse viewports
   */
  protected parseViewports(viewportStr: string): Array<{ width: number; height: number; name: string }> {
    if (!this.validateViewportFormat(viewportStr)) {
      return [];
    }

    return viewportStr.split(',').map(viewport => {
      const [width, height] = viewport.trim().split('x').map(Number);
      return { width, height, name: `${width}x${height}` };
    });
  }
}
