import * as core from '@actions/core';
import { GitHubServiceFactory, GitHubService } from '../github/GitHubServiceFactory';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  PACKAGE = 'package',           // Errors from @yofix/* packages
  GITHUB = 'github',             // GitHub API/PR integration
  CONFIGURATION = 'configuration', // Input validation, missing config
  ORCHESTRATION = 'orchestration', // Main workflow logic
  UNKNOWN = 'unknown'            // Fallback
}

export interface ErrorContext {
  /**
   * Package or location that threw the error (e.g., '@yofix/browser', 'orchestration')
   */
  location?: string;
  /**
   * Additional context data (keep minimal)
   */
  metadata?: Record<string, any>;
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

    // Individual error posting disabled - only post summary at end
    // User feedback: "We should post only the summary of error '🚨 Error Occurred' not needed"

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
    if (options.silent) return;

    const errorMessage = error instanceof Error ? error.message : error;
    const location = options.location ? `[${options.location}]` : '';
    const logMessage = `${location} ${errorMessage}`.trim();

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
        core.info(logMessage);
        break;
    }
  }

  // Individual error posting removed - only post summary at end
  // User feedback: "We should post only the summary of error '🚨 Error Occurred' not needed"

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

    // Group errors by location (package/source)
    const byLocation: Record<string, number> = {};
    for (const entry of this.errorBuffer) {
      const location = entry.context?.location || 'unknown';
      byLocation[location] = (byLocation[location] || 0) + 1;
    }

    let message = `## ⚠️ Error Summary\n\n`;
    message += `**${this.errorStats.total}** error${this.errorStats.total !== 1 ? 's' : ''} occurred`;
    if (this.errorStats.recovered > 0) {
      message += ` (${this.errorStats.recovered} recovered)`;
    }
    message += `\n\n`;

    // By severity (only if multiple types)
    const severityCounts = Object.entries(this.errorStats.bySeverity).filter(([_, count]) => count > 0);
    if (severityCounts.length > 1) {
      message += `**By Severity**: `;
      message += severityCounts.map(([sev, count]) => `${sev}: ${count}`).join(' • ');
      message += `\n\n`;
    }

    // By source/package
    const locationCounts = Object.entries(byLocation).sort((a, b) => b[1] - a[1]);
    if (locationCounts.length > 0) {
      message += `**By Source**: `;
      message += locationCounts.map(([loc, count]) => `${loc}: ${count}`).join(' • ');
      message += `\n\n`;
    }

    // Recent errors (compact format)
    message += `<details>\n<summary><strong>Error Details</strong></summary>\n\n`;
    const recentErrors = this.errorBuffer.slice(-5); // Show last 5 only
    for (const entry of recentErrors) {
      const errorMessage = entry.error instanceof Error ? entry.error.message : entry.error;
      const time = entry.timestamp.toLocaleTimeString();
      const location = entry.context?.location ? `[${entry.context.location}]` : '';
      message += `- **${time}** ${location} ${errorMessage}\n`;
    }
    if (this.errorBuffer.length > 5) {
      message += `\n...and ${this.errorBuffer.length - 5} more\n`;
    }
    message += `\n</details>\n`;

    try {
      await this.github.createComment(message);
    } catch (error) {
      core.warning(`Failed to post error summary: ${error}`);
    }
  }
}

// Export singleton instance
export const errorHandler = CentralizedErrorHandler.getInstance();