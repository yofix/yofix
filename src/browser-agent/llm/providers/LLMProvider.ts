import { LLMResponse } from '../../types';
import { actionValidator } from '../../core/ActionValidator';

export interface LLMConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export abstract class LLMProvider {
  protected config: LLMConfig;
  
  constructor(config: LLMConfig) {
    this.config = config;
  }
  
  /**
   * Send a prompt to the LLM and get structured response
   */
  abstract complete(prompt: string, systemPrompt?: string): Promise<LLMResponse>;
  
  /**
   * Parse LLM response to extract action and parameters
   */
  protected parseResponse(response: string): LLMResponse {
    try {
      const parsed = this.parseJSON(response);
      
      // Check if this is a completion check response
      if ('completed' in parsed) {
        return this.createCompletionResponse(parsed);
      }
      
      // Extract action data from various possible locations
      const actionData = this.extractActionData(parsed);
      
      // Validate and normalize the response
      return this.normalizeResponse(actionData);
      
    } catch (error) {
      // Fallback: try to extract from raw text
      return this.parseRawText(response);
    }
  }
  
  /**
   * Safely parse JSON with error handling
   */
  private parseJSON(response: string): any {
    try {
      return JSON.parse(response);
    } catch (e) {
      throw new Error('Invalid JSON response');
    }
  }
  
  /**
   * Create completion check response
   */
  private createCompletionResponse(parsed: any): LLMResponse {
    return {
      action: '',
      parameters: {},
      thinking: parsed.thinking || parsed.reasoning || '',
      completed: parsed.completed,
      reason: parsed.reason,
      next_action: parsed.next_action
    } as any;
  }
  
  /**
   * Extract action data from various possible structures
   */
  private extractActionData(parsed: any): any {
    // Priority 1: Direct structure
    if (parsed.action) {
      return parsed;
    }
    
    // Priority 2: Nested in thinking (common LLM mistake)
    if (parsed.thinking && typeof parsed.thinking === 'object' && parsed.thinking.action) {
      return {
        ...parsed.thinking,
        thinking: parsed.thinking.thinking || parsed.thinking.reasoning || ''
      };
    }
    
    // Priority 3: Alternative field names
    if (parsed.command) {
      return { ...parsed, action: parsed.command };
    }
    
    // Priority 4: Try to extract from thinking string
    if (typeof parsed.thinking === 'string') {
      const extracted = this.extractFromThinkingString(parsed.thinking);
      if (extracted) {
        return { ...parsed, ...extracted };
      }
    }
    
    return parsed;
  }
  
  /**
   * Extract action from thinking string that might contain JSON
   */
  private extractFromThinkingString(thinking: string): any | null {
    try {
      const jsonMatch = thinking.match(/{[\s\S]*}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        if (extracted.action) {
          return extracted;
        }
      }
    } catch (e) {
      // Not valid JSON in thinking
    }
    return null;
  }
  
  /**
   * Normalize and validate the response
   */
  private normalizeResponse(data: any): LLMResponse {
    const action = data.action || data.command || '';
    
    // Validate action if present
    if (action && !actionValidator.isValidAction(action)) {
      console.warn(`Invalid action "${action}" detected. Valid actions: ${actionValidator.getValidActions().join(', ')}`);
      // Don't modify the action here - let the Agent handle invalid actions
    }
    
    return {
      action,
      parameters: data.parameters || data.params || {},
      thinking: data.thinking || data.reasoning || '',
      confidence: data.confidence
    };
  }
  
  /**
   * Parse raw text response as fallback
   */
  private parseRawText(response: string): LLMResponse {
    const actionMatch = response.match(/action[:\s]+(\w+)/i);
    const paramsMatch = response.match(/parameters[:\s]+({[^}]+})/i);
    
    return {
      action: actionMatch ? actionMatch[1] : '',
      parameters: paramsMatch ? this.tryParseJSON(paramsMatch[1], {}) : {},
      thinking: response
    };
  }
  
  /**
   * Safely try to parse JSON with fallback
   */
  private tryParseJSON(str: string, fallback: any): any {
    try {
      return JSON.parse(str);
    } catch (e) {
      return fallback;
    }
  }
  
  /**
   * Build system prompt for browser automation
   */
  protected getSystemPrompt(): string {
    return `You are a browser automation agent. Your role is to complete tasks by interacting with web pages through specific actions.

You must respond with valid JSON in this format:
{
  "thinking": "Your reasoning for the next action",
  "action": "action_name",
  "parameters": {
    "param1": "value1"
  }
}

Key principles:
1. Analyze the current page state before acting
2. Use element indices when available (e.g., click index=5)
3. Fill forms completely before submitting
4. Take screenshots of important information
5. Save extracted data to files
6. Verify actions completed successfully
7. Recover gracefully from errors

Always think step-by-step and explain your reasoning.`;
  }
}