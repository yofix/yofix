/**
 * Factory for creating consistent error handlers across modules
 * Provides clean, predictable error handling patterns
 */

import { errorHandler, ErrorCategory, ErrorSeverity } from '..';
import * as core from '@actions/core';

export interface ModuleErrorOptions {
  module: string;
  debug?: boolean;
  skipGitHubPost?: boolean;
  defaultSeverity?: ErrorSeverity;
  defaultCategory?: ErrorCategory;
}

export interface LoggerInterface {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (error: Error | string, context?: any) => Promise<void>;
}

/**
 * Creates a consistent logger interface for modules
 */
export function createModuleLogger(options: ModuleErrorOptions): LoggerInterface {
  const { module, debug = false, skipGitHubPost = true, defaultSeverity = ErrorSeverity.MEDIUM, defaultCategory = ErrorCategory.MODULE } = options;
  
  return {
    debug: (message: string, ...args: any[]) => {
      if (debug || core.isDebug()) {
        core.debug(`[${module}] ${message}`);
        if (args.length > 0) {
          core.debug(`[${module}] ${JSON.stringify(args)}`);
        }
      }
    },
    
    info: (message: string, ...args: any[]) => {
      core.info(`[${module}] ${message}`);
      if (args.length > 0 && (debug || core.isDebug())) {
        core.debug(`[${module}] ${JSON.stringify(args)}`);
      }
    },
    
    warn: (message: string, ...args: any[]) => {
      core.warning(`[${module}] ${message}`);
      if (args.length > 0 && (debug || core.isDebug())) {
        core.debug(`[${module}] ${JSON.stringify(args)}`);
      }
    },
    
    error: async (error: Error | string, context?: any) => {
      const errorObj = error instanceof Error ? error : new Error(error);
      
      await errorHandler.handleError(errorObj, {
        severity: context?.severity || defaultSeverity,
        category: context?.category || defaultCategory,
        userAction: context?.userAction || `${module} operation`,
        metadata: {
          module,
          ...context?.metadata
        },
        recoverable: context?.recoverable !== false,
        skipGitHubPost: context?.skipGitHubPost !== undefined ? context.skipGitHubPost : skipGitHubPost
      });
    }
  };
}

/**
 * Wraps an async function with consistent error handling
 */
export function wrapAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    module: string;
    operation: string;
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    extractMetadata?: (...args: Parameters<T>) => any;
  }
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const metadata = options.extractMetadata ? options.extractMetadata(...args) : {};
      
      await errorHandler.handleError(error as Error, {
        severity: options.severity || ErrorSeverity.MEDIUM,
        category: options.category || ErrorCategory.MODULE,
        userAction: `${options.module}: ${options.operation}`,
        metadata: {
          module: options.module,
          operation: options.operation,
          ...metadata
        },
        recoverable: true,
        skipGitHubPost: true
      });
      
      throw error;
    }
  }) as T;
}

/**
 * Creates a consistent try-catch wrapper for module operations
 */
export function createTryCatch(logger: LoggerInterface) {
  return async function tryCatch<T>(
    operation: () => Promise<T>,
    context: {
      userAction: string;
      severity?: ErrorSeverity;
      metadata?: any;
      fallback?: T;
      rethrow?: boolean;
    }
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      await logger.error(error as Error, context);
      
      if (context.rethrow) {
        throw error;
      }
      
      return context.fallback;
    }
  };
}