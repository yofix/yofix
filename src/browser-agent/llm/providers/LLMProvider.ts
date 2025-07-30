import { LLMResponse } from '../../types';

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
      // Try to parse as JSON
      const parsed = JSON.parse(response);
      
      // Check if this is a completion check response
      if ('completed' in parsed) {
        return {
          action: '',
          parameters: {},
          thinking: parsed.thinking || parsed.reasoning || '',
          completed: parsed.completed,
          reason: parsed.reason,
          next_action: parsed.next_action
        } as any;
      }
      
      return {
        action: parsed.action || parsed.command || '',
        parameters: parsed.parameters || parsed.params || {},
        thinking: parsed.thinking || parsed.reasoning || '',
        confidence: parsed.confidence
      };
    } catch (error) {
      // Fallback parsing for non-JSON responses
      const actionMatch = response.match(/action[:\s]+(\w+)/i);
      const paramsMatch = response.match(/parameters[:\s]+({[^}]+})/i);
      
      return {
        action: actionMatch ? actionMatch[1] : '',
        parameters: paramsMatch ? JSON.parse(paramsMatch[1]) : {},
        thinking: response
      };
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