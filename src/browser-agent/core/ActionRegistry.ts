import * as core from '@actions/core';
import { ActionDefinition, ActionResult, AgentContext } from '../types';

export type ActionHandler = (params: any, context: AgentContext) => Promise<ActionResult>;

export interface Action {
  definition: ActionDefinition;
  handler: ActionHandler;
}

export class ActionRegistry {
  private actions = new Map<string, Action>();
  private middleware: Array<(context: AgentContext, next: () => Promise<any>) => Promise<any>> = [];

  /**
   * Register a new action
   */
  register(definition: ActionDefinition, handler: ActionHandler): void {
    core.debug(`Registering action: ${definition.name}`);
    
    this.actions.set(definition.name, {
      definition,
      handler
    });
  }

  /**
   * Register middleware for all actions
   */
  use(middleware: (context: AgentContext, next: () => Promise<any>) => Promise<any>): void {
    this.middleware.push(middleware);
  }

  /**
   * Execute an action by name
   */
  async execute(name: string, params: any, context: AgentContext): Promise<ActionResult> {
    const action = this.actions.get(name);
    
    if (!action) {
      core.error(`Unknown action: ${name}`);
      return {
        success: false,
        error: `Unknown action: ${name}. Available actions: ${this.getAvailableActions().join(', ')}`
      };
    }
    
    core.info(`Executing action: ${name} with params: ${JSON.stringify(params)}`);
    
    const startTime = Date.now();
    
    try {
      // Apply middleware chain
      let index = 0;
      const next = async (): Promise<ActionResult> => {
        if (index < this.middleware.length) {
          const currentMiddleware = this.middleware[index++];
          return currentMiddleware(context, next);
        }
        return action.handler(params, context);
      };
      
      const result = await next();
      
      // Add duration to result
      result.duration = Date.now() - startTime;
      
      if (result.success) {
        core.info(`Action ${name} completed successfully in ${result.duration}ms`);
      } else {
        core.warning(`Action ${name} failed: ${result.error}`);
      }
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.error(`Action ${name} threw error: ${errorMessage}`);
      
      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Get list of available actions
   */
  getAvailableActions(): string[] {
    return Array.from(this.actions.keys());
  }

  /**
   * Get action definitions for LLM context
   */
  getActionDefinitions(): ActionDefinition[] {
    return Array.from(this.actions.values()).map(action => action.definition);
  }

  /**
   * Get formatted action list for LLM prompt
   */
  getActionsForPrompt(): string {
    const lines: string[] = ['Available actions:'];
    
    for (const [name, action] of this.actions) {
      const def = action.definition;
      lines.push(`\n- ${name}: ${def.description}`);
      
      if (def.parameters && Object.keys(def.parameters).length > 0) {
        lines.push(`  Parameters: ${JSON.stringify(def.parameters)}`);
      }
      
      if (def.examples && def.examples.length > 0) {
        lines.push(`  Examples:`);
        def.examples.forEach(ex => lines.push(`    ${ex}`));
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Validate action parameters
   */
  validateParams(actionName: string, params: any): { valid: boolean; errors: string[] } {
    const action = this.actions.get(actionName);
    if (!action) {
      return { valid: false, errors: [`Unknown action: ${actionName}`] };
    }
    
    const errors: string[] = [];
    const expectedParams = action.definition.parameters || {};
    
    // Check required parameters
    for (const [key, schema] of Object.entries(expectedParams)) {
      if (schema.required && !(key in params)) {
        errors.push(`Missing required parameter: ${key}`);
      }
      
      // Basic type validation
      if (key in params) {
        const value = params[key];
        if (schema.type === 'string' && typeof value !== 'string') {
          errors.push(`Parameter ${key} must be a string`);
        } else if (schema.type === 'number' && typeof value !== 'number') {
          errors.push(`Parameter ${key} must be a number`);
        } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Parameter ${key} must be a boolean`);
        } else if (schema.type === 'array' && !Array.isArray(value)) {
          errors.push(`Parameter ${key} must be an array`);
        }
      }
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Clear all registered actions
   */
  clear(): void {
    this.actions.clear();
    this.middleware = [];
  }

  /**
   * Get action by name
   */
  getAction(name: string): Action | undefined {
    return this.actions.get(name);
  }
  
  /**
   * Get action handler by name
   */
  getHandler(name: string): ActionHandler | undefined {
    const action = this.actions.get(name);
    return action?.handler;
  }

  /**
   * Check if action exists
   */
  hasAction(name: string): boolean {
    return this.actions.has(name);
  }

  /**
   * Create a sub-registry with filtered actions
   */
  filter(predicate: (action: Action) => boolean): ActionRegistry {
    const subRegistry = new ActionRegistry();
    
    for (const [name, action] of this.actions) {
      if (predicate(action)) {
        subRegistry.register(action.definition, action.handler);
      }
    }
    
    // Copy middleware
    subRegistry.middleware = [...this.middleware];
    
    return subRegistry;
  }

  /**
   * Merge another registry into this one
   */
  merge(other: ActionRegistry): void {
    for (const [name, action] of other.actions) {
      if (this.actions.has(name)) {
        core.warning(`Overriding existing action: ${name}`);
      }
      this.register(action.definition, action.handler);
    }
  }
}