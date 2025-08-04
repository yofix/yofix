/**
 * Consistency Patterns for YoFix
 * Provides clean, predictable patterns for common operations
 */

import { errorHandler, ErrorCategory, ErrorSeverity } from '../error/CentralizedErrorHandler';
import { GitHubServiceFactory, GitHubService } from '../github/GitHubServiceFactory';
import { botActivity } from '../bot/BotActivityHandler';
import { getConfiguration } from '../hooks/ConfigurationHook';
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
  private static github: GitHubService | null = null;
  private static context: ReturnType<GitHubService['getContext']> | null = null;
  
  private static ensureInitialized(): void {
    if (!this.github) {
      this.github = GitHubServiceFactory.getService();
      this.context = this.github.getContext();
    }
  }
  
  static async postProgress(message: string, threadId?: string): Promise<void> {
    this.ensureInitialized();
    
    if (!this.context?.prNumber) {
      core.warning('No PR context available, skipping progress comment');
      return;
    }
    
    const signature = threadId ? `yofix-progress-${threadId}` : 'yofix-progress';
    const body = `⏳ ${message}\n\n<!-- ${signature} -->`;
    
    try {
      // Try to find and update existing comment
      const comments = await this.github!.listComments();
      
      const existingComment = comments.find(comment => 
        comment.body.includes(`<!-- ${signature} -->`)
      );
      
      if (existingComment) {
        await this.github!.updateComment(
          existingComment.id,
          body
        );
      } else {
        await this.github!.createComment(
          body
        );
      }
    } catch (error) {
      core.warning(`Failed to post progress comment: ${error}`);
    }
  }
  
  static async postResult(result: OperationResult<any>, operation: string): Promise<void> {
    this.ensureInitialized();
    
    if (!this.context?.prNumber) {
      core.warning('No PR context available, skipping result comment');
      return;
    }
    
    const emoji = result.success ? '✅' : '❌';
    const status = result.success ? 'Success' : 'Failed';
    
    let message = `${emoji} **${operation}**: ${status}`;
    
    if (result.error) {
      message += `\n\n**Error**: ${result.error}`;
    }
    
    if (result.data && typeof result.data === 'object') {
      message += '\n\n**Details**:\n```json\n' + JSON.stringify(result.data, null, 2) + '\n```';
    }
    
    if (result.metadata && Object.keys(result.metadata).length > 0) {
      message += '\n\n**Metadata**:\n';
      for (const [key, value] of Object.entries(result.metadata)) {
        message += `- ${key}: ${value}\n`;
      }
    }
    
    const signature = `yofix-result-${operation.toLowerCase().replace(/\s+/g, '-')}`;
    message += `\n\n<!-- ${signature} -->`;
    
    try {
      await this.github!.createComment(
        message
      );
    } catch (error) {
      core.warning(`Failed to post result comment: ${error}`);
    }
  }
  
  static async addReaction(reaction: '+1' | '-1' | 'eyes' | 'rocket' | 'confused'): Promise<void> {
    this.ensureInitialized();
    
    if (!this.context?.prNumber) {
      return;
    }
    
    try {
      // Try to find the triggering comment
      const triggeringCommentId = this.getTriggeringCommentId();
      
      if (triggeringCommentId) {
        await this.github!.addReaction(
          triggeringCommentId,
          reaction
        );
      }
    } catch (error) {
      core.debug(`Failed to add reaction: ${error}`);
    }
  }
  
  private static getTriggeringCommentId(): number | null {
    try {
      const eventPath = process.env.GITHUB_EVENT_PATH;
      if (!eventPath) return null;
      
      const event = JSON.parse(require('fs').readFileSync(eventPath, 'utf8'));
      return event?.comment?.id || null;
    } catch {
      return null;
    }
  }
}

/**
 * Standard pattern for bot operations
 */
export class BotOperations {
  static async trackActivity(
    operation: string,
    handler: () => Promise<any>
  ): Promise<OperationResult<any>> {
    return botActivity.trackActivity(operation, async () => {
      const result = await executeOperation(handler, {
        name: operation,
        category: ErrorCategory.MODULE
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Operation failed');
      }
      
      return result.data;
    }).then(data => ({
      success: true,
      data
    })).catch(error => ({
      success: false,
      error: error.message
    }));
  }
}

/**
 * Configuration pattern for consistent settings access
 */
export class ConfigPattern {
  private static config = getConfiguration();
  
  static get(key: string, defaultValue?: string): string {
    return this.config.getInput(key) || defaultValue || '';
  }
  
  static getBoolean(key: string, defaultValue: boolean = false): boolean {
    return this.config.getBooleanInput(key) || defaultValue;
  }
  
  static getNumber(key: string, defaultValue: number = 0): number {
    const value = this.config.getInput(key);
    if (!value) return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  }
  
  static getJson<T>(key: string, defaultValue: T): T {
    const value = this.config.getInput(key);
    if (!value) return defaultValue;
    
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }
}

/**
 * Retry pattern for flaky operations
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts || 3;
  const delay = options.delay || 1000;
  const backoff = options.backoff || 2;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxAttempts) {
        if (options.onRetry) {
          options.onRetry(attempt, lastError);
        }
        
        const waitTime = delay * Math.pow(backoff, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Parallel execution pattern with error collection
 */
export async function executeParallel<T>(
  operations: Array<() => Promise<T>>,
  options: {
    maxConcurrency?: number;
    continueOnError?: boolean;
  } = {}
): Promise<Array<OperationResult<T>>> {
  const maxConcurrency = options.maxConcurrency || operations.length;
  const results: Array<OperationResult<T>> = [];
  
  const queue = [...operations];
  const executing: Array<Promise<void>> = [];
  
  while (queue.length > 0 || executing.length > 0) {
    while (executing.length < maxConcurrency && queue.length > 0) {
      const operation = queue.shift()!;
      const index = operations.indexOf(operation);
      
      const promise = operation()
        .then(data => {
          results[index] = { success: true, data };
        })
        .catch(error => {
          results[index] = { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
          
          if (!options.continueOnError) {
            throw error;
          }
        });
      
      executing.push(promise);
      
      promise.finally(() => {
        const idx = executing.indexOf(promise);
        if (idx !== -1) {
          executing.splice(idx, 1);
        }
      });
    }
    
    if (executing.length > 0) {
      await Promise.race(executing);
    }
  }
  
  return results;
}