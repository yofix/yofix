/**
 * Circuit Breaker Pattern for YoFix
 * Prevents cascading failures and provides graceful degradation for external services
 */

import { errorHandler, ErrorCategory, ErrorSeverity } from '..';
import { createModuleLogger } from '../error/ErrorHandlerFactory';

export interface CircuitBreakerConfig {
  /** Name of the service */
  serviceName: string;
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Time in ms to wait before attempting to close circuit */
  resetTimeout?: number;
  /** Time in ms for operation timeout */
  timeout?: number;
  /** Function to check if error should trigger circuit */
  isFailure?: (error: Error) => boolean;
  /** Fallback function when circuit is open */
  fallback?: () => any;
  /** Success percentage required to close circuit */
  successThreshold?: number;
  /** Minimum number of requests in half-open state */
  volumeThreshold?: number;
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  totalRequests: number;
  totalFailures: number;
  consecutiveFailures: number;
  successRate: number;
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private totalFailures = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttempt?: number;
  private halfOpenRequests = 0;
  private halfOpenSuccesses = 0;
  
  private readonly logger = createModuleLogger({
    module: `CircuitBreaker.${this.config.serviceName}`,
    defaultCategory: ErrorCategory.NETWORK
  });
  
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly timeout: number;
  private readonly successThreshold: number;
  private readonly volumeThreshold: number;
  
  constructor(private readonly config: CircuitBreakerConfig) {
    this.failureThreshold = config.failureThreshold ?? 5;
    this.resetTimeout = config.resetTimeout ?? 60000; // 1 minute
    this.timeout = config.timeout ?? 30000; // 30 seconds
    this.successThreshold = config.successThreshold ?? 0.5; // 50%
    this.volumeThreshold = config.volumeThreshold ?? 5;
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;
    
    // Check if circuit should be open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt!) {
        return this.handleOpen();
      }
      
      // Move to half-open state
      this.state = CircuitState.HALF_OPEN;
      this.halfOpenRequests = 0;
      this.halfOpenSuccesses = 0;
      this.logger.info(`Circuit moved to HALF_OPEN state for ${this.config.serviceName}`);
    }
    
    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(operation);
      
      this.onSuccess();
      return result;
    } catch (error) {
      return this.onFailure(error as Error);
    }
  }
  
  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.timeout}ms`));
      }, this.timeout);
      
      try {
        const result = await operation();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
  
  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.failures = 0;
    this.successes++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenRequests++;
      this.halfOpenSuccesses++;
      
      // Check if we should close the circuit
      if (this.halfOpenRequests >= this.volumeThreshold) {
        const successRate = this.halfOpenSuccesses / this.halfOpenRequests;
        
        if (successRate >= this.successThreshold) {
          this.state = CircuitState.CLOSED;
          this.logger.info(`Circuit CLOSED for ${this.config.serviceName} (success rate: ${(successRate * 100).toFixed(1)}%)`);
        } else {
          this.open();
        }
      }
    }
  }
  
  /**
   * Handle failed operation
   */
  private onFailure<T>(error: Error): T {
    this.failures++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    
    // Check if this error should trigger circuit
    const shouldTrigger = this.config.isFailure ? this.config.isFailure(error) : true;
    
    if (!shouldTrigger) {
      throw error;
    }
    
    // Log the failure synchronously to avoid unhandled promise rejections
    errorHandler.handleErrorSync(error, {
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.NETWORK,
      userAction: `${this.config.serviceName} operation`,
      metadata: {
        circuitState: this.state,
        failures: this.failures,
        totalFailures: this.totalFailures
      },
      skipGitHubPost: true,
      recoverable: true
    });
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenRequests++;
      this.open();
    } else if (this.state === CircuitState.CLOSED && this.failures >= this.failureThreshold) {
      this.open();
    }
    
    // If we have a fallback, use it
    if (this.config.fallback) {
      this.logger.info(`Using fallback for ${this.config.serviceName}`);
      return this.config.fallback() as T;
    }
    
    throw error;
  }
  
  /**
   * Open the circuit
   */
  private open(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.resetTimeout;
    
    this.logger.warn(`Circuit OPEN for ${this.config.serviceName} after ${this.failures} failures`);
    
    // Post to GitHub if critical service
    if (this.failures >= this.failureThreshold * 2) {
      // Fire and forget - we don't want to block on this
      errorHandler.handleError(
        new Error(`Circuit breaker opened for ${this.config.serviceName}`),
        {
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.NETWORK,
          userAction: 'Circuit breaker activation',
          metadata: this.getStats()
        }
      ).catch(err => {
        // Log but don't throw - this is a non-critical operation
        this.logger.warn(`Failed to post circuit breaker status to GitHub: ${err}`);
      });
    }
  }
  
  /**
   * Handle open circuit
   */
  private handleOpen<T>(): T {
    const error = new CircuitBreakerError(
      `Circuit breaker is OPEN for ${this.config.serviceName}`,
      this.config.serviceName,
      this.state
    );
    
    if (this.config.fallback) {
      this.logger.debug(`Circuit open, using fallback for ${this.config.serviceName}`);
      return this.config.fallback() as T;
    }
    
    throw error;
  }
  
  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const successRate = this.totalRequests > 0 
      ? (this.totalRequests - this.totalFailures) / this.totalRequests 
      : 0;
      
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      consecutiveFailures: this.failures,
      successRate
    };
  }
  
  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.halfOpenRequests = 0;
    this.halfOpenSuccesses = 0;
    this.nextAttempt = undefined;
    
    this.logger.info(`Circuit reset for ${this.config.serviceName}`);
  }
  
  /**
   * Force the circuit to open
   */
  forceOpen(): void {
    this.open();
  }
  
  /**
   * Force the circuit to close
   */
  forceClose(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.logger.info(`Circuit force closed for ${this.config.serviceName}`);
  }
}

/**
 * Circuit Breaker Error
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly serviceName: string,
    public readonly state: CircuitState
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Factory for creating circuit breakers
 */
export class CircuitBreakerFactory {
  private static breakers = new Map<string, CircuitBreaker>();
  
  /**
   * Get or create a circuit breaker
   */
  static getBreaker(config: CircuitBreakerConfig): CircuitBreaker {
    const existing = this.breakers.get(config.serviceName);
    if (existing) {
      return existing;
    }
    
    const breaker = new CircuitBreaker(config);
    this.breakers.set(config.serviceName, breaker);
    return breaker;
  }
  
  /**
   * Get all circuit breakers
   */
  static getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }
  
  /**
   * Reset all circuit breakers
   */
  static resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
  
  /**
   * Get statistics for all breakers
   */
  static getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    
    return stats;
  }
}

/**
 * Decorator for applying circuit breaker to class methods
 */
export function WithCircuitBreaker(config: Omit<CircuitBreakerConfig, 'serviceName'>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const serviceName = `${target.constructor.name}.${propertyKey}`;
    
    descriptor.value = async function (...args: any[]) {
      const breaker = CircuitBreakerFactory.getBreaker({
        ...config,
        serviceName
      });
      
      return breaker.execute(() => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}

/**
 * Create a wrapped function with circuit breaker
 */
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: CircuitBreakerConfig
): T {
  const breaker = CircuitBreakerFactory.getBreaker(config);
  
  return (async (...args: Parameters<T>) => {
    return breaker.execute(() => fn(...args));
  }) as T;
}