import * as core from '@actions/core';
import { GitHubCommentEngine, ErrorContext } from '../github/GitHubCommentEngine';

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
  private commentEngine: GitHubCommentEngine | null = null;
  private errorBuffer: Array<{ error: Error | string; context?: ErrorOptions; timestamp: Date }> = [];
  private isTestMode = process.env.NODE_ENV === 'test';
  
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

  static getInstance(): CentralizedErrorHandler {
    if (!CentralizedErrorHandler.instance) {
      CentralizedErrorHandler.instance = new CentralizedErrorHandler();
    }
    return CentralizedErrorHandler.instance;
  }

  /**
   * Initialize with GitHub token
   */
  initialize(githubToken: string): void {
    try {
      this.commentEngine = new GitHubCommentEngine(githubToken);
      core.info('Centralized error handler initialized with GitHub integration');
    } catch (error) {
      core.warning('Failed to initialize GitHub comment engine, errors will only be logged');
    }
  }

  /**
   * Handle any error with full context
   */
  async handleError(error: Error | string, options: ErrorOptions = {}): Promise<void> {
    // Update statistics
    this.errorStats.total++;
    this.errorStats.byCategory[options.category || ErrorCategory.UNKNOWN] = 
      (this.errorStats.byCategory[options.category || ErrorCategory.UNKNOWN] || 0) + 1;
    this.errorStats.bySeverity[options.severity || ErrorSeverity.MEDIUM] = 
      (this.errorStats.bySeverity[options.severity || ErrorSeverity.MEDIUM] || 0) + 1;

    // Create error object
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Add to buffer
    this.errorBuffer.push({
      error: errorObj,
      context: options,
      timestamp: new Date()
    });

    // Log based on severity
    this.logError(errorObj, options);

    // Post to GitHub if enabled
    if (!options.skipGitHubPost && !options.silent && this.commentEngine && !this.isTestMode) {
      await this.postErrorToGitHub(errorObj, options);
    }

    // Handle critical errors
    if (options.severity === ErrorSeverity.CRITICAL) {
      await this.handleCriticalError(errorObj, options);
    }

    // Attempt recovery if possible
    if (options.recoverable) {
      this.errorStats.recovered++;
    }
  }

  /**
   * Wrap an async function with error handling
   */
  async wrapAsync<T>(
    fn: () => Promise<T>,
    context: ErrorOptions
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      await this.handleError(error as Error, context);
      if (context.recoverable) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Wrap a sync function with error handling
   */
  wrap<T>(
    fn: () => T,
    context: ErrorOptions
  ): T | null {
    try {
      return fn();
    } catch (error) {
      // Use sync handling for sync functions
      this.handleErrorSync(error as Error, context);
      if (context.recoverable) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a specialized error
   */
  createError(message: string, options: ErrorOptions = {}): YoFixError {
    return new YoFixError(message, options);
  }

  /**
   * Handle authentication errors
   */
  async handleAuthError(error: Error | string, details?: any): Promise<void> {
    await this.handleError(error, {
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      userAction: 'Authentication attempt',
      metadata: details,
      tips: [
        '🔐 Verify your credentials are correct',
        '🔑 Check if the account is locked',
        '🌐 Ensure the login URL is correct',
        '🤖 Try a different auth mode (llm, selectors, smart)'
      ]
    });
  }

  /**
   * Handle API errors
   */
  async handleApiError(error: Error | string, endpoint?: string, details?: any): Promise<void> {
    await this.handleError(error, {
      category: ErrorCategory.API,
      severity: ErrorSeverity.HIGH,
      location: endpoint,
      metadata: details,
      tips: this.getApiErrorTips(error)
    });
  }

  /**
   * Handle browser automation errors
   */
  async handleBrowserError(error: Error | string, action?: string, details?: any): Promise<void> {
    await this.handleError(error, {
      category: ErrorCategory.BROWSER,
      severity: ErrorSeverity.MEDIUM,
      userAction: action,
      metadata: details,
      recoverable: true,
      tips: [
        '🌐 Check if the page loaded correctly',
        '⏱️ Increase timeout values',
        '🔄 Retry the operation',
        '📱 Verify viewport settings'
      ]
    });
  }

  /**
   * Get error summary
   */
  getErrorSummary(): string {
    const { total, byCategory, bySeverity, recovered } = this.errorStats;
    
    let summary = `## 📊 Error Summary\n\n`;
    summary += `**Total Errors**: ${total}\n`;
    summary += `**Recovered**: ${recovered}\n\n`;
    
    summary += `### By Severity\n`;
    Object.entries(bySeverity).forEach(([severity, count]) => {
      const emoji = this.getSeverityEmoji(severity as ErrorSeverity);
      summary += `- ${emoji} ${severity}: ${count}\n`;
    });
    
    summary += `\n### By Category\n`;
    Object.entries(byCategory).forEach(([category, count]) => {
      summary += `- ${category}: ${count}\n`;
    });
    
    return summary;
  }

  /**
   * Post error summary to GitHub
   */
  async postErrorSummary(): Promise<void> {
    if (this.errorStats.total === 0 || !this.commentEngine) return;
    
    await this.commentEngine.postComment(this.getErrorSummary(), {
      signature: 'yofix-error-summary',
      updateExisting: true
    });
  }

  /**
   * Clear error buffer and stats
   */
  reset(): void {
    this.errorBuffer = [];
    this.errorStats = {
      total: 0,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      recovered: 0
    };
    // Re-initialize error stats
    this.initializeErrorStats();
  }

  // Private methods

  private setupGlobalHandlers(): void {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.handleErrorSync(
        new Error(`Unhandled Promise Rejection: ${reason}`),
        {
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.UNKNOWN,
          location: 'Global Promise Handler'
        }
      );
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleErrorSync(error, {
        severity: ErrorSeverity.CRITICAL,
        category: ErrorCategory.UNKNOWN,
        location: 'Global Exception Handler'
      });
    });
  }

  private handleErrorSync(error: Error, options: ErrorOptions): void {
    // Synchronous version for handlers that can't be async
    this.errorStats.total++;
    this.errorStats.byCategory[options.category || ErrorCategory.UNKNOWN] = 
      (this.errorStats.byCategory[options.category || ErrorCategory.UNKNOWN] || 0) + 1;
    this.errorStats.bySeverity[options.severity || ErrorSeverity.MEDIUM] = 
      (this.errorStats.bySeverity[options.severity || ErrorSeverity.MEDIUM] || 0) + 1;

    this.logError(error, options);
    
    // Queue for async posting
    if (!options.skipGitHubPost && !options.silent && this.commentEngine) {
      setImmediate(() => {
        this.postErrorToGitHub(error, options).catch(console.error);
      });
    }
  }

  private logError(error: Error, options: ErrorOptions): void {
    const message = `[${options.category || 'UNKNOWN'}] ${error.message}`;
    
    switch (options.severity) {
      case ErrorSeverity.CRITICAL:
        core.error(`🚨 CRITICAL: ${message}`);
        break;
      case ErrorSeverity.HIGH:
        core.error(`❌ ERROR: ${message}`);
        break;
      case ErrorSeverity.MEDIUM:
        core.warning(`⚠️ WARNING: ${message}`);
        break;
      case ErrorSeverity.LOW:
        core.info(`ℹ️ INFO: ${message}`);
        break;
      default:
        core.error(message);
    }
  }

  private async postErrorToGitHub(error: Error, options: ErrorOptions): Promise<void> {
    if (!this.commentEngine) return;
    
    try {
      await this.commentEngine.postError(error, {
        location: options.location,
        userAction: options.userAction,
        metadata: options.metadata,
        includeStackTrace: options.severity === ErrorSeverity.CRITICAL,
        tips: options.tips
      });
    } catch (postError) {
      core.warning(`Failed to post error to GitHub: ${postError}`);
    }
  }

  private async handleCriticalError(error: Error, options: ErrorOptions): Promise<void> {
    // For critical errors, also fail the GitHub Action
    core.setFailed(`Critical error: ${error.message}`);
    
    // Post immediate notification
    if (this.commentEngine) {
      await this.commentEngine.postComment(
        `🚨 **CRITICAL ERROR** 🚨\n\nThe workflow has failed due to a critical error. Please check the logs for details.`,
        { reactions: ['confused', 'eyes'] }
      );
    }
  }

  private getSeverityEmoji(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return '🚨';
      case ErrorSeverity.HIGH: return '❌';
      case ErrorSeverity.MEDIUM: return '⚠️';
      case ErrorSeverity.LOW: return 'ℹ️';
      default: return '❓';
    }
  }

  private getApiErrorTips(error: Error | string): string[] {
    const errorStr = error.toString();
    const tips: string[] = [];
    
    if (errorStr.includes('401') || errorStr.includes('authentication')) {
      tips.push('🔑 Check your API key is valid');
      tips.push('📋 Ensure the API key has proper permissions');
    }
    
    if (errorStr.includes('429') || errorStr.includes('rate limit')) {
      tips.push('⏱️ Wait a few minutes for rate limit to reset');
      tips.push('📊 Consider implementing request throttling');
    }
    
    if (errorStr.includes('500') || errorStr.includes('internal server')) {
      tips.push('🔄 Retry the request after a short delay');
      tips.push('📧 Contact API support if the issue persists');
    }
    
    if (errorStr.includes('timeout')) {
      tips.push('⏱️ Increase the timeout value');
      tips.push('🌐 Check your network connection');
    }
    
    return tips;
  }
}

// Export singleton instance
export const errorHandler = CentralizedErrorHandler.getInstance();