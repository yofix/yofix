/**
 * Centralized Async and Timeout Utilities
 * Provides consistent patterns for async operations, timeouts, and concurrency
 */

import { createModuleLogger } from '../error/ErrorHandlerFactory';
import { ErrorCategory, ErrorSeverity } from '../error/CentralizedErrorHandler';

export interface TimeoutOptions {
  /**
   * Timeout message
   */
  message?: string;
  /**
   * Error to throw on timeout
   */
  error?: Error;
  /**
   * Cleanup function to call on timeout
   */
  onTimeout?: () => void | Promise<void>;
}

export interface DelayOptions {
  /**
   * Whether the delay can be cancelled
   */
  cancellable?: boolean;
  /**
   * Callback when delay is cancelled
   */
  onCancel?: () => void;
}

export interface ThrottleOptions {
  /**
   * Whether to call on leading edge
   */
  leading?: boolean;
  /**
   * Whether to call on trailing edge
   */
  trailing?: boolean;
}

export interface DebounceOptions {
  /**
   * Whether to call on leading edge
   */
  leading?: boolean;
  /**
   * Maximum time to wait
   */
  maxWait?: number;
}

export interface ConcurrencyOptions {
  /**
   * Maximum concurrent operations
   */
  concurrency: number;
  /**
   * Whether to throw on first error
   */
  throwOnError?: boolean;
  /**
   * Progress callback
   */
  onProgress?: (completed: number, total: number) => void;
}

const logger = createModuleLogger({
  module: 'AsyncUtilities',
  defaultCategory: ErrorCategory.PROCESSING
});

/**
 * Add timeout to a promise
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  options: TimeoutOptions = {}
): Promise<T> {
  const { 
    message = `Operation timed out after ${timeoutMs}ms`,
    error = new Error(message),
    onTimeout
  } = options;

  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(async () => {
      if (onTimeout) {
        try {
          await onTimeout();
        } catch (cleanupError) {
          logger.warn('Timeout cleanup failed', cleanupError);
        }
      }
      reject(error);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (err) {
    clearTimeout(timeoutId!);
    throw err;
  }
}

/**
 * Create a cancellable delay
 */
export function delay(ms: number, options: DelayOptions = {}): {
  promise: Promise<void>;
  cancel: () => void;
} {
  let timeoutId: NodeJS.Timeout;
  let rejectFn: (reason?: any) => void;
  
  const promise = new Promise<void>((resolve, reject) => {
    rejectFn = reject;
    timeoutId = setTimeout(resolve, ms);
  });

  const cancel = () => {
    clearTimeout(timeoutId);
    if (options.onCancel) {
      options.onCancel();
    }
    if (options.cancellable) {
      rejectFn(new Error('Delay cancelled'));
    }
  };

  return { promise, cancel };
}

/**
 * Simple delay function
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff (enhanced version)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    onRetry?: (attempt: number, error: Error, nextDelay: number) => void | Promise<void>;
    shouldRetry?: (error: Error, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    onRetry,
    shouldRetry = () => true
  } = options;

  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      const nextDelay = Math.min(
        initialDelay * Math.pow(factor, attempt - 1),
        maxDelay
      );

      if (onRetry) {
        await onRetry(attempt, lastError, nextDelay);
      }

      await sleep(nextDelay);
    }
  }

  throw lastError!;
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number,
  options: ThrottleOptions = {}
): T & { cancel: () => void; flush: () => void } {
  const { leading = true, trailing = true } = options;
  
  let timeoutId: NodeJS.Timeout | null = null;
  let lastCallTime = 0;
  let lastArgs: any[] | null = null;
  let result: any;

  const throttled = function(this: any, ...args: any[]) {
    const now = Date.now();
    const remaining = waitMs - (now - lastCallTime);

    lastArgs = args;

    if (remaining <= 0 || remaining > waitMs) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCallTime = now;
      if (leading) {
        result = fn.apply(this, args);
      }
    } else if (!timeoutId && trailing) {
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        timeoutId = null;
        if (lastArgs) {
          result = fn.apply(this, lastArgs);
        }
      }, remaining);
    }

    return result;
  } as T;

  (throttled as any).cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  (throttled as any).flush = () => {
    if (timeoutId && lastArgs) {
      clearTimeout(timeoutId);
      result = fn.apply(throttled, lastArgs);
      timeoutId = null;
      lastArgs = null;
      lastCallTime = Date.now();
    }
  };

  return throttled as T & { cancel: () => void; flush: () => void };
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number,
  options: DebounceOptions = {}
): T & { cancel: () => void; flush: () => void } {
  const { leading = false, maxWait } = options;
  
  let timeoutId: NodeJS.Timeout | null = null;
  let maxTimeoutId: NodeJS.Timeout | null = null;
  let lastCallTime = 0;
  let lastArgs: any[] | null = null;
  let result: any;

  const debounced = function(this: any, ...args: any[]) {
    const now = Date.now();
    
    lastArgs = args;

    const later = () => {
      timeoutId = null;
      maxTimeoutId = null;
      lastCallTime = 0;
      if (!leading && lastArgs) {
        result = fn.apply(this, lastArgs);
      }
    };

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (leading && !lastCallTime) {
      result = fn.apply(this, args);
    }

    timeoutId = setTimeout(later, waitMs);

    if (maxWait && !maxTimeoutId) {
      maxTimeoutId = setTimeout(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        later();
      }, maxWait);
    }

    lastCallTime = now;
    return result;
  } as T;

  (debounced as any).cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (maxTimeoutId) {
      clearTimeout(maxTimeoutId);
      maxTimeoutId = null;
    }
    lastArgs = null;
    lastCallTime = 0;
  };

  (debounced as any).flush = () => {
    if (timeoutId && lastArgs) {
      clearTimeout(timeoutId);
      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId);
      }
      result = fn.apply(debounced, lastArgs);
      timeoutId = null;
      maxTimeoutId = null;
      lastArgs = null;
      lastCallTime = 0;
    }
  };

  return debounced as T & { cancel: () => void; flush: () => void };
}

/**
 * Run promises with concurrency limit
 */
export async function concurrent<T>(
  tasks: Array<() => Promise<T>>,
  options: ConcurrencyOptions
): Promise<Array<{ success: boolean; data?: T; error?: Error }>> {
  const { concurrency, throwOnError = false, onProgress } = options;
  
  const results: Array<{ success: boolean; data?: T; error?: Error }> = [];
  const executing: Promise<void>[] = [];
  let completed = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    
    const promise = (async () => {
      try {
        const data = await task();
        results[i] = { success: true, data };
      } catch (error) {
        results[i] = { success: false, error: error as Error };
        if (throwOnError) {
          throw error;
        }
      } finally {
        completed++;
        if (onProgress) {
          onProgress(completed, tasks.length);
        }
      }
    })();

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Create a promise that can be resolved/rejected externally
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  isResolved: boolean;
  isRejected: boolean;
} {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;
  let isResolved = false;
  let isRejected = false;

  const promise = new Promise<T>((res, rej) => {
    resolve = (value: T) => {
      isResolved = true;
      res(value);
    };
    reject = (reason?: any) => {
      isRejected = true;
      rej(reason);
    };
  });

  return { promise, resolve: resolve!, reject: reject!, isResolved, isRejected };
}

/**
 * Timeout parser - converts string timeouts to milliseconds
 */
export function parseTimeout(timeout: string | number): number {
  if (typeof timeout === 'number') {
    return timeout;
  }

  const match = timeout.match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) {
    throw new Error(`Invalid timeout format: ${timeout}`);
  }

  const [, amount, unit = 'ms'] = match;
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000
  };

  return parseInt(amount, 10) * multipliers[unit as keyof typeof multipliers];
}

/**
 * Promise.allSettled polyfill for older environments
 */
export async function allSettled<T>(
  promises: Array<Promise<T>>
): Promise<Array<{ status: 'fulfilled' | 'rejected'; value?: T; reason?: any }>> {
  return Promise.all(
    promises.map(async (promise) => {
      try {
        const value = await promise;
        return { status: 'fulfilled' as const, value };
      } catch (reason) {
        return { status: 'rejected' as const, reason };
      }
    })
  );
}

/**
 * Race with timeout and cleanup
 */
export async function raceWithCleanup<T>(
  promises: Array<{
    promise: Promise<T>;
    cleanup?: () => void | Promise<void>;
  }>,
  timeoutMs?: number
): Promise<T> {
  const cleanupFns = promises.map(p => p.cleanup).filter(Boolean);
  
  try {
    const racers = promises.map(p => p.promise);
    
    if (timeoutMs) {
      const timeoutPromise = withTimeout(
        Promise.race(racers),
        timeoutMs,
        {
          onTimeout: async () => {
            // Run all cleanup functions on timeout
            await Promise.all(cleanupFns.map(fn => fn?.()));
          }
        }
      );
      return await timeoutPromise;
    }
    
    return await Promise.race(racers);
  } finally {
    // Cleanup non-winning promises
    setTimeout(() => {
      cleanupFns.forEach(fn => fn?.());
    }, 0);
  }
}