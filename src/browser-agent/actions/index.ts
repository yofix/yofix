import { ActionRegistry } from '../core/ActionRegistry';
import { navigateActions } from './navigation';
import { getInteractionActions, interactionActions } from './interaction';
import { extractionActions } from './extraction';
import { visualTestingActions } from './visual';
import { getAuthActions, authActions } from './auth';

/**
 * Register all built-in actions
 */
export function registerBuiltInActions(registry: ActionRegistry, llmProvider?: any): void {
  // Register navigation actions
  navigateActions.forEach(({ definition, handler }) => {
    registry.register(definition, handler);
  });
  
  // Register interaction actions with LLM provider
  const interactionActionsWithLLM = getInteractionActions(llmProvider);
  interactionActionsWithLLM.forEach(({ definition, handler }) => {
    registry.register(definition, handler);
  });
  
  // Register extraction actions
  extractionActions.forEach(({ definition, handler }) => {
    registry.register(definition, handler);
  });
  
  // Register visual testing actions
  visualTestingActions.forEach(({ definition, handler }) => {
    registry.register(definition, handler);
  });
  
  // Register auth actions with LLM provider
  const authActionsWithLLM = getAuthActions(llmProvider);
  authActionsWithLLM.forEach(({ definition, handler }) => {
    registry.register(definition, handler);
  });
}

export { navigateActions } from './navigation';
export { interactionActions } from './interaction';
export { extractionActions } from './extraction';
export { visualTestingActions } from './visual';
export { authActions } from './auth';