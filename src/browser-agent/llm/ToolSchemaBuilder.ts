import { ActionDefinition } from '../types';

/**
 * Converts browser action definitions to Claude tool schemas
 * This enables structured output from Claude using tool use instead of text parsing
 */
export class ToolSchemaBuilder {
  /**
   * Convert action definitions to Claude tool schemas
   */
  static buildToolSchemas(actions: ActionDefinition[]): any[] {
    return actions.map(action => this.actionToToolSchema(action));
  }

  /**
   * Convert a single action definition to Claude tool schema
   */
  private static actionToToolSchema(action: ActionDefinition): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // Convert parameters to JSON schema format
    Object.entries(action.parameters).forEach(([paramName, paramSchema]: [string, any]) => {
      properties[paramName] = {
        type: paramSchema.type || 'string',
        description: paramSchema.description || `${paramName} parameter`
      };

      // Add enum if specified
      if (paramSchema.enum) {
        properties[paramName].enum = paramSchema.enum;
      }

      // Track required parameters
      if (paramSchema.required) {
        required.push(paramName);
      }
    });

    return {
      name: action.name,
      description: action.description,
      input_schema: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined
      }
    };
  }

  /**
   * Build system prompt optimized for tool use
   */
  static buildSystemPrompt(): string {
    return `You are a browser automation agent powered by Claude AI. Your role is to complete tasks by interacting with web pages using the provided tools.

Key principles:
1. Analyze the current page state before deciding which tool to use
2. Use element indices when available for precise interactions
3. Fill forms completely before submitting
4. Think step-by-step and use the most appropriate tool for each action
5. Verify actions completed successfully before proceeding

Tool Usage Guidelines:
- smart_login: For authentication flows - understands login forms automatically
- smart_click: For clicking buttons/links - finds elements by semantic meaning
- smart_type: For filling form fields - identifies fields by type (email, password, etc.)
- go_to: For navigation to URLs
- screenshot: To capture visual state
- wait_for: To wait for elements or conditions

Always think about what you need to accomplish and choose the right tool for the job.`;
  }
}
