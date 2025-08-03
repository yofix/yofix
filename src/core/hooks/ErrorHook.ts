/**
 * Error hook interface for decoupling from GitHub Actions
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  API = 'api',
  NETWORK = 'network',
  CONFIGURATION = 'configuration',
  BROWSER = 'browser',
  ANALYSIS = 'analysis',
  STORAGE = 'storage',
  MODULE = 'module',
  AI = 'ai',
  FILE_SYSTEM = 'file_system',
  VALIDATION = 'validation',
  PROCESSING = 'processing',
  UNKNOWN = 'unknown'
}

export interface ErrorContext {
  module?: string;
  operation?: string;
  details?: any;
  skipGitHubPost?: boolean;
}

export interface ErrorOptions extends ErrorContext {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  recoverable?: boolean;
  retryable?: boolean;
  userMessage?: string;
  userAction?: string;
  metadata?: any;
}

/**
 * Simple error handler that doesn't depend on GitHub Actions
 */
export class SimpleErrorHandler {
  private logger: any;
  
  constructor(logger: any) {
    this.logger = logger;
  }
  
  handle(error: Error | unknown, options: ErrorOptions = {}): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const severity = options.severity || ErrorSeverity.MEDIUM;
    const category = options.category || ErrorCategory.UNKNOWN;
    
    // Log based on severity
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error(`🚨 CRITICAL [${category}]: ${errorMessage}`);
        break;
      case ErrorSeverity.HIGH:
        this.logger.error(`❌ HIGH [${category}]: ${errorMessage}`);
        break;
      case ErrorSeverity.MEDIUM:
        this.logger.warning(`⚠️ MEDIUM [${category}]: ${errorMessage}`);
        break;
      case ErrorSeverity.LOW:
        this.logger.info(`ℹ️ LOW [${category}]: ${errorMessage}`);
        break;
    }
    
    // Log additional context if provided
    if (options.module) {
      this.logger.debug(`Module: ${options.module}`);
    }
    if (options.operation) {
      this.logger.debug(`Operation: ${options.operation}`);
    }
    if (options.details) {
      this.logger.debug(`Details: ${JSON.stringify(options.details, null, 2)}`);
    }
  }
}

/**
 * Error handler factory
 */
export class ErrorHandlerFactory {
  private static instance: SimpleErrorHandler;
  
  static getErrorHandler(logger: any): SimpleErrorHandler {
    if (!this.instance) {
      this.instance = new SimpleErrorHandler(logger);
    }
    return this.instance;
  }
  
  static setErrorHandler(handler: SimpleErrorHandler): void {
    this.instance = handler;
  }
}