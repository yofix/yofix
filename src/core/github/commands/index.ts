/**
 * Commands Module
 *
 * Exports all command-related functionality
 */

export * from './BaseCommand';
export * from './TestCommand';
export * from './CommandRegistry';

// Export singleton getter
export { getCommandRegistry } from './CommandRegistry';
