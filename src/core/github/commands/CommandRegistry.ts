/**
 * Command Registry
 *
 * Manages all available @yofix commands.
 * Makes it easy to add new commands without modifying core logic.
 *
 * To add a new command:
 * 1. Create a new command class implementing ICommand or extending BaseCommand
 * 2. Register it in the registry using registerCommand()
 */

import * as core from '@actions/core';
import { ICommand, ParsedCommandData, CommandContext } from './BaseCommand';
import { TestCommand } from './TestCommand';

export class CommandRegistry {
  private static instance: CommandRegistry | null = null;
  private commands: Map<string, ICommand> = new Map();

  private constructor() {
    // Register built-in commands
    this.registerBuiltInCommands();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CommandRegistry {
    if (!CommandRegistry.instance) {
      CommandRegistry.instance = new CommandRegistry();
    }
    return CommandRegistry.instance;
  }

  /**
   * Register built-in commands
   */
  private registerBuiltInCommands(): void {
    this.registerCommand(new TestCommand());

    // Future commands can be added here:
    // this.registerCommand(new BaselineCommand());
    // this.registerCommand(new CompareCommand());
    // this.registerCommand(new HelpCommand());
  }

  /**
   * Register a new command
   */
  registerCommand(command: ICommand): void {
    if (this.commands.has(command.name)) {
      core.warning(`Command "${command.name}" is already registered. Overwriting...`);
    }

    this.commands.set(command.name, command);
    core.debug(`Registered command: ${command.name}`);
  }

  /**
   * Get a command by name
   */
  getCommand(name: string): ICommand | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /**
   * Get all registered commands
   */
  getAllCommands(): ICommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Check if a command exists
   */
  hasCommand(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }

  /**
   * Parse comment body to find and extract command
   */
  parseComment(commentBody: string): { command: ICommand; parsed: ParsedCommandData } | null {
    if (!commentBody || typeof commentBody !== 'string') {
      return null;
    }

    // Check if comment contains @yofix
    if (!commentBody.toLowerCase().includes('@yofix')) {
      return null;
    }

    // Try to parse with each registered command
    for (const command of this.commands.values()) {
      const parsed = command.parse(commentBody);
      if (parsed) {
        return { command, parsed };
      }
    }

    return null;
  }

  /**
   * Generate help text for all commands
   */
  generateHelpText(): string {
    let help = '## 🤖 YoFix Commands\n\n';
    help += 'You can trigger YoFix operations by commenting on pull requests:\n\n';

    for (const command of this.commands.values()) {
      help += `### \`@yofix ${command.name}\`\n\n`;
      help += `${command.description}\n\n`;
      help += '**Usage:**\n```\n' + command.usage + '\n```\n\n';
    }

    return help;
  }

  /**
   * Reset registry (useful for testing)
   */
  reset(): void {
    this.commands.clear();
    this.registerBuiltInCommands();
  }
}

/**
 * Get the global command registry
 */
export function getCommandRegistry(): CommandRegistry {
  return CommandRegistry.getInstance();
}
