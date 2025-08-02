import { ActionRegistry } from './ActionRegistry';

/**
 * Validates actions against registered actions
 * This removes the need for hardcoded action lists
 */
export class ActionValidator {
  private static instance: ActionValidator;
  private validActions: Set<string> = new Set();
  
  private constructor() {}
  
  static getInstance(): ActionValidator {
    if (!ActionValidator.instance) {
      ActionValidator.instance = new ActionValidator();
    }
    return ActionValidator.instance;
  }
  
  /**
   * Register an action as valid
   */
  registerAction(actionName: string): void {
    this.validActions.add(actionName);
  }
  
  /**
   * Register multiple actions
   */
  registerActions(actionNames: string[]): void {
    actionNames.forEach(name => this.validActions.add(name));
  }
  
  /**
   * Check if an action is valid
   */
  isValidAction(actionName: string): boolean {
    return this.validActions.has(actionName);
  }
  
  /**
   * Get all valid actions
   */
  getValidActions(): string[] {
    return Array.from(this.validActions);
  }
  
  /**
   * Update valid actions from ActionRegistry
   */
  syncWithRegistry(registry: ActionRegistry): void {
    const definitions = registry.getActionDefinitions();
    this.validActions.clear();
    definitions.forEach(def => this.registerAction(def.name));
  }
  
  /**
   * Clear all registered actions
   */
  clear(): void {
    this.validActions.clear();
  }
}

export const actionValidator = ActionValidator.getInstance();