import { LLMProvider, LLMConfig } from './LLMProvider';
import { LLMResponse } from '../../types';
import * as core from '@actions/core';
import config from '../../../config';

export class AnthropicProvider extends LLMProvider {
  private claude: any;
  
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
  
  async complete(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    await this.initializeClient();
    
    try {
      const response = await this.claude.messages.create({
        model: this.config.model || config.get('ai.claude.defaultModel'),
        max_tokens: this.config.maxTokens || 1024,
        temperature: this.config.temperature || 0.3,
        system: systemPrompt || this.getSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });
      
      // Extract text from response
      const content = response.content[0];
      const text = content.type === 'text' ? content.text : '';
      
      // Enhanced debugging for LLM response
      console.log(`LLM ACTION RESPONSE:`);
      console.log(`  THINKING: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
      
      const parsed = this.parseResponse(text);
      
      console.log(`  ACTION: ${parsed.action}`);
      console.log(`  PARAMS: ${JSON.stringify(parsed.parameters)}`);
      
      return parsed;
    } catch (error) {
      core.error(`Anthropic API error: ${error}`);
      throw error;
    }
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