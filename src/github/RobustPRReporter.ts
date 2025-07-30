import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { VerificationResult } from '../types';

/**
 * Robust PR Reporter with multiple fallback mechanisms
 */
export class RobustPRReporter {
  private octokit: ReturnType<typeof getOctokit>;
  private prNumber: number;
  private owner: string;
  private repo: string;
  private retryCount: number = 3;
  private retryDelay: number = 2000; // 2 seconds

  constructor(githubToken: string) {
    this.octokit = getOctokit(githubToken);
    
    const context = require('@actions/github').context;
    this.owner = context.repo.owner;
    this.repo = context.repo.repo;
    this.prNumber = context.payload.pull_request?.number;

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
      await this.octokit.rest.issues.updateComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: existingComment.id,
        body: comment
      });
    } else {
      await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: this.prNumber,
        body: comment
      });
    }
  }

  /**
   * Strategy 2: Post via Check Run
   */
  private async postViaCheckRun(result: VerificationResult, storageConsoleUrl?: string): Promise<void> {
    const summary = this.generateCheckRunSummary(result, storageConsoleUrl);
    
    // Create or update check run
    const checkRuns = await this.octokit.rest.checks.listForRef({
      owner: this.owner,
      repo: this.repo,
      ref: require('@actions/github').context.sha,
      check_name: 'YoFix Visual Testing'
    });

    if (checkRuns.data.check_runs.length > 0) {
      await this.octokit.rest.checks.update({
        owner: this.owner,
        repo: this.repo,
        check_run_id: checkRuns.data.check_runs[0].id,
        status: 'completed',
        conclusion: result.status === 'success' ? 'success' : 'failure',
        output: {
          title: 'Visual Testing Results',
          summary: summary
        }
      });
    } else {
      await this.octokit.rest.checks.create({
        owner: this.owner,
        repo: this.repo,
        name: 'YoFix Visual Testing',
        head_sha: require('@actions/github').context.sha,
        status: 'completed',
        conclusion: result.status === 'success' ? 'success' : 'failure',
        output: {
          title: 'Visual Testing Results',
          summary: summary
        }
      });
    }
  }

  /**
   * Strategy 3: Post minimal comment
   */
  private async postMinimalComment(result: VerificationResult): Promise<void> {
    const minimalComment = `## Visual Testing Results

**Status**: ${result.status} | **Tests**: ${result.passedTests}/${result.totalTests} passed

View full results in the [workflow logs](${this.getWorkflowUrl()})`;

    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.prNumber,
      body: minimalComment
    });
  }

  /**
   * Strategy 4: Post as workflow summary
   */
  private async postAsWorkflowSummary(result: VerificationResult): Promise<void> {
    const summary = this.generateWorkflowSummary(result);
    await core.summary
      .addHeading('YoFix Visual Testing Results')
      .addRaw(summary)
      .write();
    
    // Also add a minimal PR comment pointing to the summary
    const comment = `## Visual Testing Complete

Results have been posted to the [workflow summary](${this.getWorkflowUrl()})`;
    
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.prNumber,
      body: comment
    });
  }

  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff(fn: () => Promise<void>): Promise<void> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < this.retryCount; i++) {
      try {
        await fn();
        return;
      } catch (error) {
        lastError = error as Error;
        const delay = this.retryDelay * Math.pow(2, i);
        core.info(`Retry ${i + 1}/${this.retryCount} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Find existing comment
   */
  private async findExistingComment(): Promise<{ id: number } | null> {
    try {
      const comments = await this.octokit.rest.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: this.prNumber,
        per_page: 100
      });

      const existingComment = comments.data.find(comment => 
        comment.body?.includes('Runtime PR Verification') ||
        comment.body?.includes('Visual Testing Results')
      );

      return existingComment ? { id: existingComment.id } : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate full comment
   */
  private generateFullComment(result: VerificationResult, storageConsoleUrl?: string): string {
    // Reuse existing logic from PRReporter
    const PRReporter = require('./PRReporter').PRReporter;
    const reporter = new PRReporter('dummy-token');
    return reporter['generateCommentBody'](result, storageConsoleUrl);
  }

  /**
   * Generate check run summary
   */
  private generateCheckRunSummary(result: VerificationResult, storageConsoleUrl?: string): string {
    let summary = `## Test Results: ${result.passedTests}/${result.totalTests} passed\n\n`;
    
    if (result.failedTests > 0) {
      summary += `### Failed Tests\n\n`;
      for (const test of result.testResults.filter(t => t.status === 'failed')) {
        summary += `- **${test.testName}**: ${test.errors.join(', ')}\n`;
      }
      summary += '\n';
    }

    if (storageConsoleUrl) {
      summary += `### Screenshots\n\nView all screenshots in [Firebase Console](${storageConsoleUrl})\n\n`;
    }

    return summary;
  }

  /**
   * Generate workflow summary
   */
  private generateWorkflowSummary(result: VerificationResult): string {
    return `
### Status: ${result.status}

| Metric | Value |
|--------|-------|
| Total Tests | ${result.totalTests} |
| Passed | ${result.passedTests} |
| Failed | ${result.failedTests} |
| Duration | ${(result.duration / 1000).toFixed(2)}s |

### Test Details

${result.testResults.map(test => 
  `- ${test.status === 'passed' ? '✅' : '❌'} **${test.testName}** (${test.duration}ms)`
).join('\n')}
`;
  }

  /**
   * Get workflow URL
   */
  private getWorkflowUrl(): string {
    const context = require('@actions/github').context;
    const runId = process.env.GITHUB_RUN_ID || context.runId;
    return `https://github.com/${this.owner}/${this.repo}/actions/runs/${runId}`;
  }
}