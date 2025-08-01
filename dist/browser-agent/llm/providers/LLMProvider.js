"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMProvider = void 0;
class LLMProvider {
    constructor(config) {
        this.config = config;
    }
    parseResponse(response) {
        try {
            const parsed = JSON.parse(response);
            if ('completed' in parsed) {
                return {
                    action: '',
                    parameters: {},
                    thinking: parsed.thinking || parsed.reasoning || '',
                    completed: parsed.completed,
                    reason: parsed.reason,
                    next_action: parsed.next_action
                };
            }
            return {
                action: parsed.action || parsed.command || '',
                parameters: parsed.parameters || parsed.params || {},
                thinking: parsed.thinking || parsed.reasoning || '',
                confidence: parsed.confidence
            };
        }
        catch (error) {
            const actionMatch = response.match(/action[:\s]+(\w+)/i);
            const paramsMatch = response.match(/parameters[:\s]+({[^}]+})/i);
            return {
                action: actionMatch ? actionMatch[1] : '',
                parameters: paramsMatch ? JSON.parse(paramsMatch[1]) : {},
                thinking: response
            };
        }
    }
    getSystemPrompt() {
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
exports.LLMProvider = LLMProvider;
