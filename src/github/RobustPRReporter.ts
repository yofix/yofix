import * as core from '@actions/core';
import { GitHubServiceFactory, GitHubService } from '../core/github/GitHubServiceFactory';
import { VerificationResult } from '../types';

/**
 * Robust PR Reporter with multiple fallback mechanisms
 */
export class RobustPRReporter {
  private github: GitHubService;
  private context: ReturnType<GitHubService['getContext']>;
  private prNumber: number;
  private owner: string;
  private repo: string;
  private sha: string;
  private retryCount: number = 3;
  private retryDelay: number = 2000; // 2 seconds

  constructor() {
    this.github = GitHubServiceFactory.getService();
    this.context = this.github.getContext();
    
    this.owner = this.context.owner;
    this.repo = this.context.repo;
    this.prNumber = this.context.prNumber;
    this.sha = this.context.sha || '';

    if (!this.prNumber) {
      throw new Error('No pull request number found in context');
    }
  }

  /**
   * Post results with retry logic
   */
  async postResults(result: VerificationResult, storageConsoleUrl?: string): Promise<void> {
    core.info(`🚀 Attempting to post results to PR #${this.prNumber}...`);
    
    // Try multiple strategies
    const strategies = [
      () => this.postViaIssuesAPI(result, storageConsoleUrl),
      () => this.postViaCheckRun(result, storageConsoleUrl),
      () => this.postMinimalComment(result),
      () => this.postAsWorkflowSummary(result)
    ];

    let lastError: Error | null = null;
    
    for (const [index, strategy] of strategies.entries()) {
      try {
        core.info(`Trying strategy ${index + 1}...`);
        await this.retryWithBackoff(strategy);
        core.info(`✅ Successfully posted results using strategy ${index + 1}`);
        return;
      } catch (error) {
        lastError = error as Error;
        core.warning(`Strategy ${index + 1} failed: ${error}`);
      }
    }

    // If all strategies fail, log the error but don't fail the action
    core.error(`Failed to post PR comment after all strategies: ${lastError}`);
    core.warning('Results will be available in workflow logs and outputs');
  }

  /**
   * Strategy 1: Post via Issues API (standard approach)
   */
  private async postViaIssuesAPI(result: VerificationResult, storageConsoleUrl?: string): Promise<void> {
    const comment = this.generateFullComment(result, storageConsoleUrl);
    
    // Find existing comment
    const existingComment = await this.findExistingComment();
    
    if (existingComment) {
      await this.github.updateComment(
        existingComment.id,
        comment
      );
    } else {
      await this.github.createComment(comment);
    }
  }

  /**
   * Strategy 2: Post via Check Run
   */
  private async postViaCheckRun(result: VerificationResult, storageConsoleUrl?: string): Promise<void> {
    const summary = this.generateCheckRunSummary(result, storageConsoleUrl);
    const passed = result.status === 'success';
    
    // Create or update check run
    const checkRuns = await this.github.listCheckRuns(this.sha);
    
    const existingRun = checkRuns.find(run => run.name === 'YoFix Visual Testing');
    
    if (existingRun) {
      await this.github.updateCheckRun(
        existingRun.id,
        {
          name: 'YoFix Visual Testing',
          status: 'completed',
          conclusion: passed ? 'success' : 'failure',
          output: {
            title: 'Visual Test Results',
            summary
          }
        }
      );
    } else {
      await this.github.createCheckRun(
        {
          name: 'YoFix Visual Testing',
          status: 'completed',
          conclusion: passed ? 'success' : 'failure',
          output: {
            title: 'Visual Test Results',
            summary
          }
        }
      );
    }
  }

  /**
   * Strategy 3: Post minimal comment (fallback for rate limits)
   */
  private async postMinimalComment(result: VerificationResult): Promise<void> {
    const passed = result.status === 'success';
    const emoji = passed ? '✅' : '❌';
    const status = passed ? 'passed' : 'failed';
    
    const minimalComment = `${emoji} **Visual Testing ${status}**\n\n` +
      `Tested ${result.summary.routesTested.length} pages, ${result.failedTests} failed\n\n` +
      `[View full results in workflow logs](${this.getWorkflowUrl()})`;

    await this.github.createComment(minimalComment);
  }

  /**
   * Strategy 4: Post as workflow summary (ultimate fallback)
   */
  private async postAsWorkflowSummary(result: VerificationResult): Promise<void> {
    const summary = this.generateFullComment(result);
    
    // Use GitHub Actions summary
    await core.summary
      .addHeading('YoFix Visual Testing Results')
      .addRaw(summary)
      .write();
    
    // Also output as action output
    core.setOutput('visual-test-results', JSON.stringify(result));
    
    // Post a minimal comment pointing to summary
    await this.github.createComment(
      `📊 Visual testing completed. [View results in workflow summary](${this.getWorkflowUrl()})`
    );
  }

  /**
   * Find existing YoFix comment
   */
  private async findExistingComment(): Promise<{ id: number; body: string } | null> {
    try {
      const comments = await this.github.listComments();
      
      const yofixComment = comments.find(comment => 
        comment.body.includes('<!-- yofix-visual-test-results -->')
      );
      
      return yofixComment || null;
    } catch (error) {
      core.warning(`Failed to find existing comment: ${error}`);
      return null;
    }
  }

  /**
   * Generate full comment body
   */
  private generateFullComment(result: VerificationResult, storageConsoleUrl?: string): string {
    const passed = result.status === 'success';
    const emoji = passed ? '✅' : '❌';
    const status = passed ? 'passed' : 'failed';
    
    let comment = `## ${emoji} Visual Testing ${status}\n\n`;
    comment += `<!-- yofix-visual-test-results -->\n\n`;
    
    // Summary
    comment += `### Summary\n`;
    comment += `- **Total Pages Tested:** ${result.summary.routesTested.length}\n`;
    comment += `- **Failed Tests:** ${result.failedTests}\n`;
    comment += `- **Duration:** ${Math.round(result.duration / 1000)}s\n`;
    
    if (result.summary.issuesFound && result.summary.issuesFound.length > 0) {
      comment += `- **Issues Found:** ${result.summary.issuesFound.length}\n`;
    }
    
    comment += '\n';
    
    // Results by test
    if (result.testResults && result.testResults.length > 0) {
      comment += `### Results by Test\n\n`;
      comment += `| Test | Status | Duration | Screenshots |\n`;
      comment += `|------|--------|----------|-------------|\n`;
      
      for (const test of result.testResults) {
        const testEmoji = test.status === 'passed' ? '✅' : '❌';
        const duration = `${Math.round(test.duration / 1000)}s`;
        const screenshots = test.screenshots.length > 0 ? 
          test.screenshots.map(s => `[${s.name}](${s.firebaseUrl || s.path})`).join(', ') : 
          'N/A';
        
        comment += `| ${test.testName} | ${testEmoji} | ${duration} | ${screenshots} |\n`;
      }
      
      comment += '\n';
    }
    
    // Issues section
    if (result.summary.issuesFound && result.summary.issuesFound.length > 0) {
      comment += `### ⚠️ Issues Found\n\n`;
      for (const issue of result.summary.issuesFound) {
        comment += `- ${issue}\n`;
      }
      comment += '\n';
    }
    
    // Links
    comment += `### 🔗 Links\n`;
    comment += `- [Workflow Logs](${this.getWorkflowUrl()})\n`;
    
    if (storageConsoleUrl || result.screenshotsUrl) {
      comment += `- [Screenshots & Baselines](${storageConsoleUrl || result.screenshotsUrl})\n`;
    }
    
    // Tips
    comment += `\n### 💡 Tips\n`;
    comment += `- Use \`@yofix analyze\` to get AI-powered analysis\n`;
    comment += `- Use \`@yofix fix\` to generate fixes for visual issues\n`;
    comment += `- Use \`@yofix update-baseline\` to accept current screenshots as new baseline\n`;
    
    return comment;
  }

  /**
   * Generate check run summary
   */
  private generateCheckRunSummary(result: VerificationResult, storageConsoleUrl?: string): string {
    let summary = `## Visual Testing Results\n\n`;
    
    summary += `**Status:** ${result.status === 'success' ? 'Passed ✅' : 'Failed ❌'}\n`;
    summary += `**Pages Tested:** ${result.summary.routesTested.length}\n`;
    summary += `**Failed Tests:** ${result.failedTests}\n`;
    summary += `**Duration:** ${Math.round(result.duration / 1000)}s\n\n`;
    
    if (result.testResults && result.testResults.length > 0) {
      summary += `### Test Results\n\n`;
      for (const test of result.testResults) {
        const status = test.status === 'passed' ? '✅' : '❌';
        summary += `- ${status} ${test.testName}\n`;
        if (test.status === 'failed' && test.errors.length > 0) {
          summary += `  - Errors: ${test.errors.join(', ')}\n`;
        }
      }
    }
    
    if (storageConsoleUrl || result.screenshotsUrl) {
      summary += `\n[View Screenshots](${storageConsoleUrl || result.screenshotsUrl})`;
    }
    
    return summary;
  }

  /**
   * Get workflow URL
   */
  private getWorkflowUrl(): string {
    const runId = process.env.GITHUB_RUN_ID;
    if (runId) {
      return `https://github.com/${this.owner}/${this.repo}/actions/runs/${runId}`;
    }
    return `https://github.com/${this.owner}/${this.repo}/actions`;
  }

  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.retryCount - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          core.info(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }
}

/**
 * Factory function to create RobustPRReporter
 */
export function createPRReporter(): RobustPRReporter {
  return new RobustPRReporter();
}