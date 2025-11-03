import { LLMProvider, LLMConfig } from './LLMProvider';
import { LLMResponse, ActionDefinition } from '../../types';
import * as core from '@actions/core';
import config from '../../../config';
import { ToolSchemaBuilder } from '../ToolSchemaBuilder';

export class AnthropicProvider extends LLMProvider {
  private claude: any;
  private toolSchemas: any[] = [];

  constructor(config: LLMConfig) {
    super(config);
  }

  private async initializeClient() {
    if (!this.claude) {
      const { Anthropic } = await import('@anthropic-ai/sdk');
      this.claude = new Anthropic({
        apiKey: this.config.apiKey
      });
    }
  }

  /**
   * Set available actions as tools (called when actions are registered)
   */
  setAvailableActions(actions: ActionDefinition[]): void {
    this.toolSchemas = ToolSchemaBuilder.buildToolSchemas(actions);
    core.debug(`✅ Registered ${this.toolSchemas.length} tools for Claude`);
  }

  async complete(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    await this.initializeClient();

    try {
      // Use tools API for structured responses
      const response = await this.claude.messages.create({
        model: this.config.model || 'claude-sonnet-4-5-20250929',
        max_tokens: this.config.maxTokens || 2048,
        temperature: this.config.temperature || 0.3,
        system: systemPrompt || ToolSchemaBuilder.buildSystemPrompt(),
        tools: this.toolSchemas,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // Parse tool use response
      const parsed = this.parseToolUseResponse(response);

      // Log for debugging
      if (parsed.thinking) {
        core.debug(`🤔 Claude thinking: ${parsed.thinking.substring(0, 200)}...`);
      }
      core.info(`✅ Claude selected tool: ${parsed.action}`);
      core.debug(`   Parameters: ${JSON.stringify(parsed.parameters)}`);

      return parsed;
    } catch (error) {
      core.error(`Anthropic API error: ${error}`);
      throw error;
    }
  }

  /**
   * Parse Claude's tool use response
   * This is guaranteed to be structured, eliminating text parsing issues!
   */
  private parseToolUseResponse(response: any): LLMResponse {
    const content = response.content;

    let thinking = '';
    let toolUse: any = null;

    // Extract thinking (text blocks) and tool use
    for (const block of content) {
      if (block.type === 'text') {
        thinking += block.text + ' ';
      } else if (block.type === 'tool_use') {
        toolUse = block;
      }
    }

    if (!toolUse) {
      // No tool use found - Claude might be asking for clarification
      core.warning('⚠️  No tool use in Claude response (might need clarification)');
      core.debug(`Response content: ${JSON.stringify(content)}`);

      return {
        action: '',
        parameters: {},
        thinking: thinking.trim(),
        error: 'No tool use found in response'
      } as any;
    }

    // Extract structured data from tool use
    return {
      action: toolUse.name,
      parameters: toolUse.input || {},
      thinking: thinking.trim(),
      tool_use_id: toolUse.id // For future tool result reporting
    };
  }
  
  protected getSystemPrompt(): string {
    return `You are Claude, a browser automation agent powered by Anthropic. ${super.getSystemPrompt()}
    
Additional capabilities:
- You can see and analyze screenshots when provided
- You understand complex web layouts and can identify UI patterns
- You can handle multi-step workflows intelligently
- You learn from previous actions to improve success rates

When you see indexed elements like [0], [1], [2], use the index parameter to interact with them.
For example: click index=0 to click the first interactive element.`;
  }
}