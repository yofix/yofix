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
      // No tool use found - Claude might be responding with JSON in thinking field
      // This happens for verification/feedback prompts that aren't registered as tools
      core.warning('⚠️  No tool use in Claude response (might need clarification)');
      core.debug(`Response content: ${JSON.stringify(content)}`);

      // Try to parse JSON from thinking field (for verification/feedback responses)
      const thinkingText = thinking.trim();

      // Strategy 1: Try parsing thinking text directly as JSON
      try {
        const parsed = JSON.parse(thinkingText);
        core.debug(`✅ Parsed JSON directly from thinking text`);

        // Return the parsed JSON as parameters (verification/feedback data)
        return {
          action: 'text_response',
          parameters: parsed,
          thinking: parsed.thinking || thinkingText,
          rawText: thinkingText
        };
      } catch (directParseError) {
        // Not valid JSON, try extracting from code block
      }

      // Strategy 2: Try to extract JSON from markdown code block
      const jsonMatch = thinkingText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          core.debug(`✅ Parsed JSON from markdown code block`);

          return {
            action: 'text_response',
            parameters: parsed,
            thinking: parsed.thinking || thinkingText,
            rawText: thinkingText
          };
        } catch (error) {
          core.warning(`Failed to parse JSON from code block: ${error}`);
        }
      }

      // Fallback: return empty response
      return {
        action: '',
        parameters: {},
        thinking: thinkingText,
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
}