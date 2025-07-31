import * as core from '@actions/core';

/**
 * Progress reporter abstraction
 * Follows Interface Segregation Principle - simple interface
 */
export interface ProgressReporter {
  report(message: string): Promise<void>;
}

/**
 * Null object pattern for when no progress reporting is needed
 */
export class NullProgressReporter implements ProgressReporter {
  async report(message: string): Promise<void> {
    // Do nothing
    core.debug(`Progress: ${message}`);
  }
}

/**
 * Console progress reporter for CLI usage
 */
export class ConsoleProgressReporter implements ProgressReporter {
  async report(message: string): Promise<void> {
    console.log(message);
  }
}

/**
 * GitHub comment progress reporter
 */
export class CommentProgressReporter implements ProgressReporter {
  constructor(
    private readonly updateComment: (commentId: number, body: string) => Promise<void>,
    private readonly commentId: number
  ) {}

  async report(message: string): Promise<void> {
    await this.updateComment(this.commentId, message);
  }
}

/**
 * Composite progress reporter - reports to multiple destinations
 */
export class CompositeProgressReporter implements ProgressReporter {
  constructor(private readonly reporters: ProgressReporter[]) {}

  async report(message: string): Promise<void> {
    await Promise.all(
      this.reporters.map(reporter => reporter.report(message))
    );
  }
}

/**
 * Rate-limited progress reporter to avoid API rate limits
 */
export class RateLimitedProgressReporter implements ProgressReporter {
  private lastReport = 0;
  private readonly minInterval = 1000; // 1 second minimum between reports
  private pendingMessage: string | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;

  constructor(private readonly delegate: ProgressReporter) {}

  async report(message: string): Promise<void> {
    const now = Date.now();
    const timeSinceLastReport = now - this.lastReport;

    if (timeSinceLastReport >= this.minInterval) {
      // Can report immediately
      this.lastReport = now;
      await this.delegate.report(message);
    } else {
      // Need to delay
      this.pendingMessage = message;
      
      if (!this.pendingTimer) {
        const delay = this.minInterval - timeSinceLastReport;
        this.pendingTimer = setTimeout(() => {
          this.reportPending();
        }, delay);
      }
    }
  }

  private async reportPending(): Promise<void> {
    if (this.pendingMessage) {
      this.lastReport = Date.now();
      await this.delegate.report(this.pendingMessage);
      this.pendingMessage = null;
      this.pendingTimer = null;
    }
  }
}

/**
 * Factory for creating progress reporters
 */
export class ProgressReporterFactory {
  static createForGitHubComment(
    updateComment: (commentId: number, body: string) => Promise<void>,
    commentId: number
  ): ProgressReporter {
    // Create rate-limited reporter for GitHub API
    const commentReporter = new CommentProgressReporter(updateComment, commentId);
    return new RateLimitedProgressReporter(commentReporter);
  }

  static createComposite(...reporters: ProgressReporter[]): ProgressReporter {
    return new CompositeProgressReporter(reporters);
  }

  static createNull(): ProgressReporter {
    return new NullProgressReporter();
  }
}