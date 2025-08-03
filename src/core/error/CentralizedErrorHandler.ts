import * as core from '@actions/core';
import { GitHubServiceFactory, GitHubService } from '../github/GitHubServiceFactory';

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
  /**
   * Error location in code
   */
  location?: string;
  /**
   * User action that triggered the error
   */
  userAction?: string;
  /**
   * Additional context data
   */
  metadata?: Record<string, any>;
  /**
   * Whether to include stack trace
   */
  includeStackTrace?: boolean;
  /**
   * Custom troubleshooting tips
   */
  tips?: string[];
}

export interface ErrorOptions extends ErrorContext {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  recoverable?: boolean;
  skipGitHubPost?: boolean;
  silent?: boolean;
}

export class YoFixError extends Error {
  public severity: ErrorSeverity;
  public category: ErrorCategory;
  public recoverable: boolean;
  public context?: ErrorContext;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message);
    this.name = 'YoFixError';
    this.severity = options.severity || ErrorSeverity.MEDIUM;
    this.category = options.category || ErrorCategory.UNKNOWN;
    this.recoverable = options.recoverable ?? false;
    this.context = options;
  }
}

export class CentralizedErrorHandler {
  private static instance: CentralizedErrorHandler;
  private github: GitHubService | null = null;
  private errorBuffer: Array<{ error: Error | string; context?: ErrorOptions; timestamp: Date }> = [];
  private isTestMode = process.env.NODE_ENV === 'test';
  private prNumber: number = 0;
  private owner: string = '';
  private repo: string = '';
  
  // Error statistics
  private errorStats = {
    total: 0,
    byCategory: {} as Record<ErrorCategory, number>,
    bySeverity: {} as Record<ErrorSeverity, number>,
    recovered: 0
  };

  private constructor() {
    // Initialize error stats
    this.initializeErrorStats();
    // Set up global error handlers
    this.setupGlobalHandlers();
    // Initialize GitHub service (lazy initialization)
    this.initializeGitHub();
  }
  
  private initializeErrorStats(): void {
    // Initialize category stats
    Object.values(ErrorCategory).forEach(category => {
      this.errorStats.byCategory[category] = 0;
    });
    
    // Initialize severity stats
    Object.values(ErrorSeverity).forEach(severity => {
      this.errorStats.bySeverity[severity] = 0;
    });
  }

  private initializeGitHub(): void {
    try {
      this.github = GitHubServiceFactory.getService();
      const context = this.github.getContext();
      this.owner = context.owner;
      this.repo = context.repo;
      this.prNumber = context.prNumber || parseInt(process.env.PR_NUMBER || '0');
      core.info('Centralized error handler initialized with GitHub integration');
    } catch (error) {
      core.warning('Failed to initialize GitHub service, errors will only be logged');
      this.github = null;
    }
  }

  static getInstance(): CentralizedErrorHandler {
    if (!CentralizedErrorHandler.instance) {
      CentralizedErrorHandler.instance = new CentralizedErrorHandler();
    }
    return CentralizedErrorHandler.instance;
  }

  /**
   * Handle an error with centralized logic
   */
  async handleError(error: Error | string, options: ErrorOptions = {}): Promise<void> {
    // Update statistics
    this.updateErrorStats(options);
    
    // Create error entry
    const errorEntry = {
      error,
      context: options,
      timestamp: new Date()
    };
    
    // Add to buffer
    this.errorBuffer.push(errorEntry);
    
    // Log to console/GitHub Actions
    this.logError(error, options);
    
    // Post to GitHub if enabled
    if (!options.skipGitHubPost && !this.isTestMode && this.github && this.prNumber > 0) {
      await this.postErrorToGitHub(error, options);
    }
    
    // Throw if not recoverable
    if (!options.recoverable) {
      if (error instanceof Error) {
        throw error;
      } else {
        throw new YoFixError(error, options);
      }
    }
  }

  /**
   * Log error to console/GitHub Actions
   */
  private logError(error: Error | string, options: ErrorOptions): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const logMessage = this.formatLogMessage(errorMessage, options);
    
    // Don't log if silent
    if (options.silent) {
      return;
    }
    
    // Log based on severity
    switch (options.severity) {
      case ErrorSeverity.CRITICAL:
        core.error(logMessage);
        if (!this.isTestMode) {
          core.setFailed(logMessage);
        }
        break;
      case ErrorSeverity.HIGH:
        core.error(logMessage);
        break;
      case ErrorSeverity.MEDIUM:
        core.warning(logMessage);
        break;
      case ErrorSeverity.LOW:
        core.notice(logMessage);
        break;
    }
    
    // Log stack trace in debug mode
    if (error instanceof Error && error.stack && core.isDebug()) {
      core.debug(`Stack trace:\n${error.stack}`);
    }
  }

  /**
   * Format log message
   */
  private formatLogMessage(errorMessage: string, options: ErrorOptions): string {
    const parts = [`[${options.category || ErrorCategory.UNKNOWN}]`];
    
    if (options.location) {
      parts.push(`at ${options.location}`);
    }
    
    parts.push(errorMessage);
    
    return parts.join(' ');
  }

  /**
   * Post error to GitHub PR
   */
  private async postErrorToGitHub(error: Error | string, context: ErrorOptions): Promise<void> {
    if (!this.github || this.prNumber === 0) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error && context.includeStackTrace ? error.stack : undefined;
    
    let message = `### 🚨 Error Occurred\n\n`;
    message += `**Error**: ${errorMessage}\n\n`;
    
    if (context.location) {
      message += `**Location**: \`${context.location}\`\n\n`;
    }
    
    if (context.userAction) {
      message += `**During**: ${context.userAction}\n\n`;
    }
    
    if (context.metadata && Object.keys(context.metadata).length > 0) {
      message += `**Context**:\n`;
      for (const [key, value] of Object.entries(context.metadata)) {
        message += `- ${key}: ${JSON.stringify(value)}\n`;
      }
      message += '\n';
    }
    
    if (context.tips && context.tips.length > 0) {
      message += `**💡 Troubleshooting Tips**:\n`;
      for (const tip of context.tips) {
        message += `- ${tip}\n`;
      }
      message += '\n';
    }
    
    if (errorStack) {
      message += `<details>\n<summary>Stack Trace</summary>\n\n\`\`\`\n${errorStack}\n\`\`\`\n</details>\n`;
    }
    
    try {
      await this.github.createComment(
        this.owner,
        this.repo,
        this.prNumber,
        message
      );
    } catch (postError) {
      core.warning(`Failed to post error to GitHub: ${postError}`);
    }
  }

  /**
   * Update error statistics
   */
  private updateErrorStats(options: ErrorOptions): void {
    this.errorStats.total++;
    
    const category = options.category || ErrorCategory.UNKNOWN;
    const severity = options.severity || ErrorSeverity.MEDIUM;
    
    this.errorStats.byCategory[category]++;
    this.errorStats.bySeverity[severity]++;
    
    if (options.recoverable) {
      this.errorStats.recovered++;
    }
  }

  /**
   * Set up global error handlers
   */
  private setupGlobalHandlers(): void {
    if (this.isTestMode) {
      return;
    }
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      core.error(`Uncaught Exception: ${error.message}`);
      if (error.stack) {
        core.debug(error.stack);
      }
      process.exit(1);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      core.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
      process.exit(1);
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats(): typeof this.errorStats {
    return { ...this.errorStats };
  }

  /**
   * Get error buffer
   */
  getErrorBuffer(): typeof this.errorBuffer {
    return [...this.errorBuffer];
  }

  /**
   * Clear error buffer
   */
  clearErrorBuffer(): void {
    this.errorBuffer = [];
  }

  /**
   * Post a summary of all errors
   */
  async postErrorSummary(): Promise<void> {
    if (!this.github || this.prNumber === 0 || this.errorBuffer.length === 0) {
      return;
    }
    
    let message = `## 📊 Error Summary\n\n`;
    message += `Total errors: ${this.errorStats.total}\n`;
    message += `Recovered: ${this.errorStats.recovered}\n\n`;
    
    // By severity
    message += `### By Severity\n`;
    for (const [severity, count] of Object.entries(this.errorStats.bySeverity)) {
      if (count > 0) {
        message += `- ${severity}: ${count}\n`;
      }
    }
    message += '\n';
    
    // By category
    message += `### By Category\n`;
    for (const [category, count] of Object.entries(this.errorStats.byCategory)) {
      if (count > 0) {
        message += `- ${category}: ${count}\n`;
      }
    }
    message += '\n';
    
    // Recent errors
    if (this.errorBuffer.length > 0) {
      message += `### Recent Errors\n`;
      message += `<details>\n<summary>Last ${Math.min(10, this.errorBuffer.length)} errors</summary>\n\n`;
      
      const recentErrors = this.errorBuffer.slice(-10);
      for (const entry of recentErrors) {
        const errorMessage = entry.error instanceof Error ? entry.error.message : entry.error;
        message += `- **${entry.timestamp.toISOString()}**`;
        if (entry.context?.location) {
          message += ` at \`${entry.context.location}\``;
        }
        message += `: ${errorMessage}\n`;
      }
      
      message += `\n</details>\n`;
    }
    
    try {
      await this.github.createComment(
        this.owner,
        this.repo,
        this.prNumber,
        message
      );
    } catch (error) {
      core.warning(`Failed to post error summary: ${error}`);
    }
  }
}

// Export singleton instance
export const errorHandler = CentralizedErrorHandler.getInstance();