/**
 * Consistency Patterns for YoFix
 * Provides clean, predictable patterns for common operations
 */

import { errorHandler, ErrorCategory, ErrorSeverity } from '..';
import { getGitHubCommentEngine } from '../github/GitHubCommentEngine';
import { botActivity } from '../bot/BotActivityHandler';
import * as core from '@actions/core';

/**
 * Standard result type for operations
 */
export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Standard async operation wrapper with consistent error handling
 */
export async function executeOperation<T>(
  operation: () => Promise<T>,
  context: {
    name: string;
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    metadata?: Record<string, any>;
    fallback?: T;
  }
): Promise<OperationResult<T>> {
  const startTime = Date.now();
  
  try {
    const data = await operation();
    
    return {
      success: true,
      data,
      metadata: {
        duration: Date.now() - startTime,
        ...context.metadata
      }
    };
  } catch (error) {
    await errorHandler.handleError(error as Error, {
      severity: context.severity || ErrorSeverity.MEDIUM,
      category: context.category || ErrorCategory.UNKNOWN,
      userAction: context.name,
      metadata: {
        ...context.metadata,
        duration: Date.now() - startTime
      },
      recoverable: true
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: context.fallback,
      metadata: {
        duration: Date.now() - startTime,
        ...context.metadata
      }
    };
  }
}

/**
 * Standard pattern for GitHub comment operations
 */
export class GitHubOperations {
  private static commentEngine = getGitHubCommentEngine();
  
  static async postProgress(message: string, threadId?: string): Promise<void> {
    await this.commentEngine.postComment(message, {
      threadId,
      updateExisting: true,
      signature: 'yofix-progress'
    });
  }
  
  static async postResult(result: OperationResult<any>, operation: string): Promise<void> {
    const emoji = result.success ? '✅' : '❌';
    const status = result.success ? 'Success' : 'Failed';
    
    let message = `${emoji} **${operation}**: ${status}`;
    
    if (result.error) {
      message += `\n\n**Error**: ${result.error}`;
    }
    
    if (result.data && typeof result.data === 'object') {
      message += '\n\n**Details**:\n```json\n' + JSON.stringify(result.data, null, 2) + '\n```';
    }
    
    await this.commentEngine.postComment(message, {
      updateExisting: true,
      signature: `yofix-${operation.toLowerCase().replace(/\s+/g, '-')}`
    });
  }
}

/**
 * Standard pattern for bot activity tracking
 */
export class BotOperations {
  private static botActivityHandler = botActivity;
  
  static async trackOperation<T>(
    operation: () => Promise<T>,
    context: {
      id: string;
      command: string;
      steps: Array<{
        name: string;
        operation: () => Promise<any>;
      }>;
    }
  ): Promise<OperationResult<T>> {
    await this.botActivityHandler.startActivity(context.id, context.command);
    
    try {
      // Execute steps sequentially
      for (const step of context.steps) {
        await this.botActivityHandler.addStep(step.name, 'running');
        
        try {
          await step.operation();
          await this.botActivityHandler.updateStep(step.name, 'completed');
        } catch (error) {
          await this.botActivityHandler.updateStep(step.name, 'failed');
          throw error;
        }
      }
      
      // Execute main operation
      const result = await operation();
      await this.botActivityHandler.completeActivity(result);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      await this.botActivityHandler.failActivity(error instanceof Error ? error.message : 'Operation failed');
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Standard pattern for configuration access
 */
export class ConfigPattern {
  static get<T>(path: string, defaultValue: T): T {
    try {
      // Try environment variable first
      const envKey = `YOFIX_${path.toUpperCase().replace(/\./g, '_')}`;
      const envValue = process.env[envKey];
      
      if (envValue !== undefined) {
        // Parse JSON values
        try {
          return JSON.parse(envValue) as T;
        } catch {
          return envValue as unknown as T;
        }
      }
      
      // Try GitHub Action input
      const inputKey = path.toLowerCase().replace(/\./g, '-');
      const inputValue = core.getInput(inputKey);
      
      if (inputValue) {
        try {
          return JSON.parse(inputValue) as T;
        } catch {
          return inputValue as unknown as T;
        }
      }
      
      // Return default
      return defaultValue;
    } catch (error) {
      core.debug(`Failed to get config ${path}: ${error}`);
      return defaultValue;
    }
  }
}

/**
 * Standard pattern for retryable operations
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoff?: boolean;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { 
    maxAttempts = 3, 
    delayMs = 1000, 
    backoff = true,
    onRetry 
  } = options;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxAttempts) {
        if (onRetry) {
          onRetry(attempt, lastError);
        }
        
        const delay = backoff ? delayMs * attempt : delayMs;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Standard pattern for parallel operations with error collection
 */
export async function executeParallel<T>(
  operations: Array<{
    name: string;
    operation: () => Promise<T>;
  }>
): Promise<{
  results: Array<{ name: string; result?: T; error?: Error }>;
  hasErrors: boolean;
}> {
  const results = await Promise.allSettled(
    operations.map(async ({ name, operation }) => {
      try {
        const result = await operation();
        return { name, result };
      } catch (error) {
        return { name, error: error as Error };
      }
    })
  );
  
  const processedResults = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        name: operations[index].name,
        error: result.reason as Error
      };
    }
  });
  
  // Log all errors
  for (const result of processedResults) {
    if (result.error) {
      await errorHandler.handleError(result.error, {
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.UNKNOWN,
        userAction: `Parallel operation: ${result.name}`,
        recoverable: true,
        skipGitHubPost: true
      });
    }
  }
  
  return {
    results: processedResults,
    hasErrors: processedResults.some(r => r.error !== undefined)
  };
}