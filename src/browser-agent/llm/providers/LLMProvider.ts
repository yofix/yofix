import { LLMResponse, ActionDefinition } from '../../types';
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
   * Set available actions for tool use (optional - only some providers support this)
   * Providers that support tool use (like Anthropic) should override this
   */
  setAvailableActions?(actions: ActionDefinition[]): void;

  // NOTE: The old parseResponse, parseJSON, parseRawText methods have been removed.
  // They are obsolete now that we use Claude's tool use API for structured responses.
  // AnthropicProvider.parseToolUseResponse() handles all response parsing.
}