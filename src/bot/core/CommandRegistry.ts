import { BotCommand } from '../types';
import { BotCommandHandler } from '../handlers/ImpactCommandHandler';

/**
 * Command registry interface - follows Interface Segregation Principle
 */
export interface CommandRegistry {
  register(handler: BotCommandHandler): void;
  getHandler(command: BotCommand): BotCommandHandler | null;
  getAllHandlers(): BotCommandHandler[];
}

/**
 * Default implementation of command registry
 * Follows Open/Closed Principle - can add new handlers without modifying this class
 */
export class DefaultCommandRegistry implements CommandRegistry {
  private handlers: BotCommandHandler[] = [];

  register(handler: BotCommandHandler): void {
    this.handlers.push(handler);
  }

  getHandler(command: BotCommand): BotCommandHandler | null {
    return this.handlers.find(handler => handler.canHandle(command)) || null;
  }

  getAllHandlers(): BotCommandHandler[] {
    return [...this.handlers];
  }

  /**
   * Generate help text from all registered handlers
   */
  generateHelpText(): string {
    const helpTexts = this.handlers
      .map(handler => handler.getHelpText())
      .filter(text => text.length > 0);

    return `## 🔧 YoFix Bot - Available Commands\n\n${helpTexts.join('\n')}`;
  }
}

/**
 * Builder pattern for easy command registration
 */
export class CommandRegistryBuilder {
  private registry = new DefaultCommandRegistry();

  add(handler: BotCommandHandler): this {
    this.registry.register(handler);
    return this;
  }

  addMany(handlers: BotCommandHandler[]): this {
    handlers.forEach(handler => this.registry.register(handler));
    return this;
  }

  build(): CommandRegistry {
    return this.registry;
  }
}