// Core exports
export { Agent } from './core/Agent';
export { DOMIndexer } from './core/DOMIndexer';
export { ActionRegistry } from './core/ActionRegistry';
export { StateManager } from './core/StateManager';

// LLM exports
export { PromptBuilder } from './llm/PromptBuilder';
export { LLMProvider, LLMConfig } from './llm/providers/LLMProvider';
export { AnthropicProvider } from './llm/providers/AnthropicProvider';

// Action exports
export { registerBuiltInActions } from './actions';
export { navigateActions } from './actions/navigation';
export { interactionActions } from './actions/interaction';
export { extractionActions } from './actions/extraction';
export { visualTestingActions } from './actions/visual';
export { authActions } from './actions/auth';

// Type exports
export * from './types';

// Convenience function to create and run agent
export async function runAgent(task: string, options?: any): Promise<any> {
  const { Agent } = await import('./core/Agent');
  const agent = new Agent(task, options);
  
  try {
    await agent.initialize();
    const result = await agent.run();
    return result;
  } finally {
    await agent.cleanup();
  }
}