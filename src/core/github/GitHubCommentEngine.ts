import * as core from '@actions/core';
import { GitHubServiceFactory, GitHubService } from './GitHubServiceFactory';
import { VerificationResult } from '../../types';

export interface CommentOptions {
  /**
   * Whether to update existing comment or create new one
   */
  updateExisting?: boolean;
  /**
   * Comment signature to identify for updates
   */
  signature?: string;
  /**
   * Reply to a specific comment ID
   */
  inReplyTo?: number;
  /**
   * Add reactions to the comment
   */
  reactions?: Array<'+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'>;
  /**
   * Thread identifier for grouping related comments
   */
  threadId?: string;
  /**
   * Whether this is an error message
   */
  isError?: boolean;
  /**
   * Progress indicator (for bot commands)
   */
  isProgress?: boolean;
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

export class GitHubCommentEngine {
  private github: GitHubService;
  private context: ReturnType<GitHubService['getContext']>;
  private prNumber: number;
  private owner: string;
  private repo: string;
  
  // Cache for comment threads
  private threadCache: Map<string, number> = new Map();
  
  // Error tracking
  private errorCount = 0;
  private errorSummary: Array<{ timestamp: Date; error: string; location?: string }> = [];

  constructor() {
    this.github = GitHubServiceFactory.getService();
    this.context = this.github.getContext();
    this.owner = this.context.owner;
    this.repo = this.context.repo;
    
    // Get PR number from context
    this.prNumber = this.context.prNumber || 
                   parseInt(process.env.PR_NUMBER || '0');
  }

  /**
   * Post a comment to the PR
   */
  async postComment(message: string, options: CommentOptions = {}): Promise<number | null> {
    try {
      if (this.prNumber === 0) {
        core.warning('No PR number found, cannot post comment');
        return null;
      }

      let body = message;
      
      // Add thread reference if replying
      if (options.inReplyTo) {
        const replyUrl = `https://github.com/${this.owner}/${this.repo}/pull/${this.prNumber}#issuecomment-${options.inReplyTo}`;
        body = `> In reply to [this comment](${replyUrl})\n\n${message}`;
      }
      
      // Add signature if provided
      if (options.signature) {
        body += `\n\n<!-- ${options.signature} -->`;
      }
      
      // Handle thread-based comments
      if (options.threadId) {
        const existingThreadId = this.threadCache.get(options.threadId);
        if (existingThreadId) {
          options.inReplyTo = existingThreadId;
        }
      }
      
      // Format for error messages
      if (options.isError) {
        body = `❌ **Error**\n\n${body}`;
        this.errorCount++;
      }
      
      // Format for progress messages
      if (options.isProgress) {
        body = `⏳ ${body}`;
      }
      
      let commentId: number;
      
      // Update existing comment if requested
      if (options.updateExisting && options.signature) {
        const existingComment = await this.findCommentBySignature(options.signature);
        
        if (existingComment) {
          await this.github.updateComment(
            existingComment.id,
            body
          );
          commentId = existingComment.id;
          core.info(`Updated existing comment #${commentId}`);
        } else {
          const result = await this.github.createComment(body);
          commentId = result.id;
          core.info(`Created new comment #${commentId}`);
        }
      } else {
        const result = await this.github.createComment(body);
        commentId = result.id;
        core.info(`Created comment #${commentId}`);
      }
      
      // Cache thread ID
      if (options.threadId && !this.threadCache.has(options.threadId)) {
        this.threadCache.set(options.threadId, commentId);
      }
      
      // Add reactions if requested
      if (options.reactions && options.reactions.length > 0) {
        for (const reaction of options.reactions) {
          await this.addReaction(commentId, reaction);
        }
      }
      
      return commentId;
    } catch (error) {
      core.error(`Failed to post comment: ${error}`);
      return null;
    }
  }

  /**
   * Post an error comment with enhanced context
   */
  async postError(error: Error | string, context?: ErrorContext): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error && context?.includeStackTrace ? error.stack : undefined;
    
    // Track error
    this.errorSummary.push({
      timestamp: new Date(),
      error: errorMessage,
      location: context?.location
    });
    
    let message = `### 🚨 Error Occurred\n\n`;
    message += `**Error**: ${errorMessage}\n\n`;
    
    if (context?.location) {
      message += `**Location**: \`${context.location}\`\n\n`;
    }
    
    if (context?.userAction) {
      message += `**During**: ${context.userAction}\n\n`;
    }
    
    if (context?.metadata && Object.keys(context.metadata).length > 0) {
      message += `**Context**:\n`;
      for (const [key, value] of Object.entries(context.metadata)) {
        message += `- ${key}: ${JSON.stringify(value)}\n`;
      }
      message += '\n';
    }
    
    if (context?.tips && context.tips.length > 0) {
      message += `**💡 Troubleshooting Tips**:\n`;
      for (const tip of context.tips) {
        message += `- ${tip}\n`;
      }
      message += '\n';
    }
    
    if (errorStack) {
      message += `<details>\n<summary>Stack Trace</summary>\n\n\`\`\`\n${errorStack}\n\`\`\`\n</details>\n`;
    }
    
    await this.postComment(message, { isError: true, signature: 'yofix-error' });
  }

  /**
   * Post a progress update
   */
  async postProgress(message: string, options: { threadId?: string; reaction?: '+1' | 'eyes' | 'rocket' } = {}): Promise<void> {
    const commentId = await this.postComment(message, {
      isProgress: true,
      threadId: options.threadId,
      reactions: options.reaction ? [options.reaction] : undefined
    });
    
    if (commentId && options.reaction) {
      await this.addReaction(commentId, options.reaction);
    }
  }

  /**
   * Post a summary comment (typically at the end of processing)
   */
  async postSummary(summary: { 
    title: string; 
    sections: Array<{ heading: string; content: string }>;
    status?: 'success' | 'warning' | 'error';
  }): Promise<void> {
    let message = `## ${summary.title}\n\n`;
    
    // Add status indicator
    const statusEmoji = {
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    
    if (summary.status) {
      message = `${statusEmoji[summary.status]} ${message}`;
    }
    
    // Add sections
    for (const section of summary.sections) {
      message += `### ${section.heading}\n\n`;
      message += `${section.content}\n\n`;
    }
    
    // Add error summary if any
    if (this.errorCount > 0) {
      message += `### ⚠️ Errors Encountered\n\n`;
      message += `Total errors: ${this.errorCount}\n\n`;
      
      if (this.errorSummary.length > 0) {
        message += `<details>\n<summary>Error Details</summary>\n\n`;
        for (const error of this.errorSummary) {
          message += `- **${error.timestamp.toISOString()}**`;
          if (error.location) {
            message += ` at \`${error.location}\``;
          }
          message += `: ${error.error}\n`;
        }
        message += `\n</details>\n`;
      }
    }
    
    await this.postComment(message, {
      signature: 'yofix-summary',
      updateExisting: true
    });
  }

  /**
   * Add a reaction to a comment
   */
  private async addReaction(commentId: number, reaction: string): Promise<void> {
    try {
      await this.github.addReaction(
        commentId,
        reaction as any
      );
      core.debug(`Added ${reaction} reaction to comment #${commentId}`);
    } catch (error) {
      core.warning(`Failed to add reaction: ${error}`);
    }
  }

  /**
   * Post a quick reaction to the triggering comment
   */
  async postReaction(reaction: 'eyes' | '+1' | '-1' | 'rocket' | 'confused'): Promise<void> {
    try {
      // Get the comment that triggered this action
      const triggeringCommentId = this.getTriggeringCommentId();
      
      if (triggeringCommentId) {
        await this.addReaction(triggeringCommentId, reaction);
      }
    } catch (error) {
      core.warning(`Failed to post reaction: ${error}`);
    }
  }

  /**
   * React to a specific comment
   */
  async reactToComment(commentId: number, reaction: 'eyes' | '+1' | '-1' | 'rocket' | 'confused'): Promise<void> {
    try {
      await this.addReaction(commentId, reaction);
    } catch (error) {
      core.warning(`Failed to react to comment: ${error}`);
    }
  }

  /**
   * Start a new thread
   */
  async startThread(threadId: string, message: string, options?: { reactions?: string[] }): Promise<number | null> {
    const commentId = await this.postComment(message, {
      threadId,
      reactions: options?.reactions as any
    });
    
    return commentId;
  }

  /**
   * Update a thread
   */
  async updateThread(threadId: string, message: string, options?: { reactions?: string[] }): Promise<void> {
    await this.postComment(message, {
      threadId,
      updateExisting: true,
      signature: `yofix-thread-${threadId}`,
      reactions: options?.reactions as any
    });
  }

  /**
   * Reply to a thread
   */
  async replyToThread(threadId: string, message: string, options?: { reactions?: string[] }): Promise<void> {
    const threadCommentId = this.threadCache.get(threadId);
    
    await this.postComment(message, {
      threadId,
      inReplyTo: threadCommentId,
      reactions: options?.reactions as any
    });
  }

  /**
   * Get the ID of the comment that triggered this action
   */
  private getTriggeringCommentId(): number | null {
    // This would come from GitHub Actions context
    const commentId = parseInt(process.env.GITHUB_EVENT_PATH ? 
      JSON.parse(require('fs').readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))?.comment?.id || '0' : '0'
    );
    
    return commentId || null;
  }

  /**
   * Find a comment by its signature
   */
  private async findCommentBySignature(signature: string): Promise<{ id: number; body: string } | null> {
    try {
      const comments = await this.github.listComments();
      
      const signaturePattern = `<!-- ${signature} -->`;
      const existingComment = comments.find(comment => 
        comment.body.includes(signaturePattern)
      );
      
      return existingComment || null;
    } catch (error) {
      core.warning(`Failed to find comment by signature: ${error}`);
      return null;
    }
  }

  /**
   * Delete all bot comments (useful for cleanup)
   */
  async deleteAllBotComments(): Promise<void> {
    try {
      const comments = await this.github.listComments();
      
      const botComments = comments.filter(comment => 
        comment.user.login.includes('[bot]') ||
        comment.body.includes('<!-- yofix-')
      );
      
      // Note: GitHub API doesn't provide a delete comment method
      // This would need to be implemented in GitHubService if needed
      core.info(`Found ${botComments.length} bot comments`);
    } catch (error) {
      core.warning(`Failed to list comments: ${error}`);
    }
  }

  /**
   * Get the current PR number
   */
  getPRNumber(): number {
    return this.prNumber;
  }

  /**
   * Check if we're in a valid PR context
   */
  isValidContext(): boolean {
    return this.prNumber > 0;
  }

  /**
   * Post verification results to PR (replaces PRReporter functionality)
   */
  async postVerificationResults(result: VerificationResult, storageConsoleUrl?: string): Promise<void> {
    try {
      core.info(`Posting verification results to PR #${this.prNumber}...`);
      
      const comment = this.formatVerificationResults(result, storageConsoleUrl);
      
      await this.postComment(comment, {
        updateExisting: true,
        signature: 'yofix-verification-results'
      });
      
      core.info('Posted verification results to PR');
    } catch (error) {
      core.error(`Failed to post verification results: ${error}`);
      throw error;
    }
  }

  /**
   * Format verification results for PR comment
   */
  private formatVerificationResults(result: VerificationResult, storageConsoleUrl?: string): string {
    const statusEmoji = result.status === 'success' ? '✅' : result.status === 'partial' ? '⚠️' : '❌';
    const firebaseEmoji = '🔥';
    const reactEmoji = '⚛️';
    
    // Header with overall status
    let comment = `## ${statusEmoji} Runtime PR Verification - React SPA

**Status**: ${result.status.charAt(0).toUpperCase() + result.status.slice(1)} | `;
    comment += `${reactEmoji} React ${result.firebaseConfig.buildSystem === 'vite' ? 'Vite' : 'CRA'} | `;
    comment += `${firebaseEmoji} Firebase ${result.firebaseConfig.target}\n\n`;

    // Test summary
    comment += `**Test Results**: ${result.passedTests}/${result.totalTests} passed`;
    if (result.failedTests > 0) {
      comment += ` • ${result.failedTests} failed`;
    }
    if (result.skippedTests > 0) {
      comment += ` • ${result.skippedTests} skipped`;
    }
    comment += ` • ${this.formatDuration(result.duration)}\n\n`;

    // Quick access links
    const screenshots = result.testResults.flatMap(t => t.screenshots);
    const videos = result.testResults.flatMap(t => t.videos);
    
    if (screenshots.length > 0 || videos.length > 0) {
      comment += `**Visual Evidence**: `;
      comment += `📸 ${screenshots.length} screenshot${screenshots.length !== 1 ? 's' : ''}`;
      if (videos.length > 0) {
        comment += ` • 🎥 ${videos.length} video${videos.length !== 1 ? 's' : ''}`;
      }
      if (storageConsoleUrl) {
        comment += ` • [Firebase Console](${storageConsoleUrl})`;
      }
      comment += '\n\n';
    }

    // Embed screenshots directly
    if (screenshots.length > 0) {
      core.info(`Embedding ${screenshots.length} screenshots in PR comment`);
      const screenshotsWithUrls = screenshots.filter(s => s.firebaseUrl);
      core.info(`Screenshots with Firebase URLs: ${screenshotsWithUrls.length}`);
      
      // Use enhanced comparison layout if baseline data is available
      const hasBaselineData = screenshots.some(s => s.comparison || s.baseline);
      if (hasBaselineData) {
        comment += this.generateVisualComparisonTable(screenshots);
      } else {
        comment += this.generateEmbeddedScreenshots(screenshots);
      }
    }
    
    // Embed videos directly
    if (videos.length > 0) {
      core.info(`Embedding ${videos.length} videos in PR comment`);
      const videosWithUrls = videos.filter(v => v.firebaseUrl);
      core.info(`Videos with Firebase URLs: ${videosWithUrls.length}`);
      
      comment += this.generateEmbeddedVideos(videos);
    }

    // Expandable details section
    comment += '<details>\n<summary><strong>View Detailed Results</strong></summary>\n\n';

    // Components and routes verified
    if (result.summary.componentsVerified.length > 0 || result.summary.routesTested.length > 0) {
      comment += '### ✅ React App Verification\n\n';
      
      if (result.summary.componentsVerified.length > 0) {
        comment += `**Components Tested**: ${result.summary.componentsVerified.join(', ')}\n\n`;
      }
      
      if (result.summary.routesTested.length > 0) {
        comment += `**Routes Verified**: ${result.summary.routesTested.join(', ')}\n\n`;
      }
    }

    // Individual test results
    comment += '### 📋 Test Results\n\n';
    
    for (const test of result.testResults) {
      const testEmoji = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️';
      comment += `${testEmoji} **${test.testName}** (${this.formatDuration(test.duration)})\n`;
      
      if (test.errors.length > 0) {
        comment += `   - ⚠️ Issues: ${test.errors.slice(0, 2).join(', ')}`;
        if (test.errors.length > 2) {
          comment += ` and ${test.errors.length - 2} more`;
        }
        comment += '\n';
      }
      
      if (test.screenshots.length > 0) {
        comment += '   - 📸 Screenshots captured for: ';
        comment += test.screenshots.map(s => s.viewport.name).join(', ') + '\n';
      }
      
      if (test.videos.length > 0 && test.videos[0]?.firebaseUrl) {
        comment += `   - 🎥 Video: [View Recording](${test.videos[0].firebaseUrl})\n`;
      }
      
      comment += '\n';
    }

    // Issues found section
    if (result.summary.issuesFound.length > 0) {
      comment += '### ⚠️ Issues Detected\n\n';
      for (const issue of result.summary.issuesFound.slice(0, 5)) {
        comment += `- ${issue}\n`;
      }
      if (result.summary.issuesFound.length > 5) {
        comment += `- ...and ${result.summary.issuesFound.length - 5} more issues\n`;
      }
      comment += '\n';
    }

    // Firebase configuration details
    comment += '### 🔥 Firebase Configuration\n\n';
    comment += `- **Project**: \`${result.firebaseConfig.projectId}\`\n`;
    comment += `- **Target**: \`${result.firebaseConfig.target}\`\n`;
    comment += `- **Build System**: ${result.firebaseConfig.buildSystem === 'vite' ? 'Vite' : 'Create React App'}\n`;
    comment += `- **Preview URL**: [${result.firebaseConfig.previewUrl}](${result.firebaseConfig.previewUrl})\n\n`;

    // Performance metrics
    const consoleErrors = result.testResults.flatMap(t => 
      t.consoleMessages.filter(m => m.type === 'error')
    );
    
    if (consoleErrors.length > 0) {
      comment += '### 🐛 Console Errors\n\n';
      comment += `Found ${consoleErrors.length} console error${consoleErrors.length !== 1 ? 's' : ''} during testing:\n\n`;
      for (const error of consoleErrors.slice(0, 3)) {
        comment += `- \`${error.text.substring(0, 100)}${error.text.length > 100 ? '...' : ''}\`\n`;
      }
      if (consoleErrors.length > 3) {
        comment += `- ...and ${consoleErrors.length - 3} more errors\n`;
      }
      comment += '\n';
    }

    comment += '</details>\n\n';

    // Footer
    const timestamp = new Date().toLocaleString();
    comment += `---\n*Generated by [YoFix](https://github.com/yofix/yofix) • ${timestamp}*`;

    return comment;
  }

  /**
   * Post a status update (for early failures)
   */
  async postStatusUpdate(status: 'running' | 'failed' | 'skipped', message: string): Promise<void> {
    try {
      const statusEmoji = {
        running: '🔄',
        failed: '❌',
        skipped: '⏭️'
      };

      const comment = `## ${statusEmoji[status]} Runtime PR Verification

**Status**: ${status.charAt(0).toUpperCase() + status.slice(1)}

${message}

---
*Generated by [YoFix](https://github.com/yofix/yofix) • ${new Date().toLocaleString()}*`;

      await this.postComment(comment, {
        updateExisting: true,
        signature: 'yofix-status-update'
      });
    } catch (error) {
      core.warning(`Failed to post status update: ${error}`);
    }
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(durationMs: number): string {
    if (durationMs < 1000) {
      return `${durationMs}ms`;
    } else if (durationMs < 60000) {
      return `${(durationMs / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(durationMs / 60000);
      const seconds = ((durationMs % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Generate visual comparison table with baseline vs current screenshots
   */
  private generateVisualComparisonTable(screenshots: any[]): string {
    if (screenshots.length === 0) {
      return '';
    }

    // Group screenshots by route
    const groupedByRoute = screenshots.reduce((acc, screenshot) => {
      const route = screenshot.route || this.extractRouteFromScreenshotName(screenshot.name);
      if (!acc[route]) {
        acc[route] = [];
      }
      acc[route].push(screenshot);
      return acc;
    }, {} as Record<string, any[]>);

    // Generate summary statistics
    const totalRoutes = Object.keys(groupedByRoute).length;
    const routesWithIssues = Object.values(groupedByRoute).filter((screenshots: any[]) => 
      screenshots.some(s => s.comparison?.hasDifference || s.comparison?.issues?.length > 0)
    ).length;
    const newRoutes = Object.values(groupedByRoute).filter((screenshots: any[]) =>
      screenshots.some(s => s.comparison?.status === 'new')
    ).length;

    let content = `## 📸 Visual Testing Results\n\n`;
    content += `### 🎯 Summary: ${totalRoutes} route${totalRoutes !== 1 ? 's' : ''} tested`;
    if (routesWithIssues > 0) {
      content += ` • ⚠️ ${routesWithIssues} with issues`;
    }
    if (newRoutes > 0) {
      content += ` • 🆕 ${newRoutes} new`;
    }
    content += `\n\n`;

    // Generate collapsible sections for each route
    for (const [route, routeScreenshots] of Object.entries(groupedByRoute)) {
      const routeHasIssues = (routeScreenshots as any[]).some(s => 
        s.comparison?.hasDifference || s.comparison?.issues?.length > 0
      );
      const isNewRoute = (routeScreenshots as any[]).some(s => s.comparison?.status === 'new');
      
      const statusIcon = isNewRoute ? '🆕' : routeHasIssues ? '⚠️' : '✅';
      const statusText = isNewRoute ? 'New Route' : routeHasIssues ? 'Issues Detected' : 'No Issues';
      
      content += `<details>\n`;
      content += `<summary><strong>📍 ${route}</strong> - ${statusIcon} ${statusText}</summary>\n\n`;
      
      // Create comparison table for this route
      content += `| Baseline (Last Updated) | Current Screenshot | Comparison |\n`;
      content += `|------------------------|-------------------|------------|\n`;
      
      // Sort by viewport size (desktop first)
      const sortedScreenshots = (routeScreenshots as any[]).sort((a, b) => b.viewport.width - a.viewport.width);
      
      for (const screenshot of sortedScreenshots) {
        content += this.generateComparisonTableRow(screenshot);
      }
      
      // Add issues section if any
      const allIssues = (routeScreenshots as any[]).flatMap(s => s.comparison?.issues || []);
      if (allIssues.length > 0) {
        content += `\n**Issues Found:**\n`;
        for (const issue of allIssues) {
          const severityIcon = issue.severity === 'critical' ? '🚨' : 
                              issue.severity === 'warning' ? '⚠️' : 'ℹ️';
          content += `- ${severityIcon} **${issue.type}**: ${issue.description}\n`;
          if (issue.fix) {
            content += `  - 🔧 **Fix**: ${issue.fix}\n`;
          }
        }
      }
      
      content += `\n</details>\n\n`;
    }

    return content;
  }

  /**
   * Generate a single row for the comparison table
   */
  private generateComparisonTableRow(screenshot: any): string {
    const viewport = `**${screenshot.viewport.width}×${screenshot.viewport.height}**`;
    
    // Baseline column (includes viewport info)
    let baselineCell = `${viewport}<br/>`;
    if (screenshot.baseline?.url) {
      const updatedDate = screenshot.baseline.updatedDate || 'Unknown';
      baselineCell += `![Baseline](${screenshot.baseline.url})<br/>*Updated: ${updatedDate}*`;
    } else if (screenshot.comparison?.status === 'new') {
      baselineCell += '🆕 *New baseline created*';
    } else {
      baselineCell += '❌ *No baseline*';
    }
    
    // Current screenshot column (includes viewport info)
    let currentCell = `${viewport}<br/>`;
    if (screenshot.firebaseUrl) {
      const captureDate = new Date(screenshot.timestamp).toLocaleDateString();
      currentCell += `![Current](${screenshot.firebaseUrl})<br/>*Captured: ${captureDate}*`;
    } else {
      currentCell += '❌ *Screenshot not available*';
    }
    
    // Comparison column
    let comparisonCell = '';
    if (screenshot.comparison) {
      const comp = screenshot.comparison;
      switch (comp.status) {
        case 'new':
          comparisonCell = `🆕 **New Route**<br/>Baseline created from current`;
          break;
        case 'unchanged':
          comparisonCell = `✅ **${comp.diffPercentage.toFixed(2)}% diff**<br/>No issues detected`;
          break;
        case 'changed':
          const diffIcon = comp.diffPercentage > 5 ? '🚨' : comp.diffPercentage > 1 ? '⚠️' : 'ℹ️';
          comparisonCell = `${diffIcon} **${comp.diffPercentage.toFixed(2)}% diff**<br/>`;
          if (comp.diffImageUrl) {
            comparisonCell += `[View Diff](${comp.diffImageUrl})`;
          } else {
            comparisonCell += 'Visual changes detected';
          }
          break;
        case 'error':
          comparisonCell = `❌ **Comparison Failed**<br/>Unable to compare images`;
          break;
        default:
          comparisonCell = `❓ **Unknown Status**`;
      }
      
      // Add issue summary if any
      if (comp.issues && comp.issues.length > 0) {
        const criticalIssues = comp.issues.filter((i: any) => i.severity === 'critical').length;
        const warningIssues = comp.issues.filter((i: any) => i.severity === 'warning').length;
        if (criticalIssues > 0) {
          comparisonCell += `<br/>🚨 ${criticalIssues} critical issue${criticalIssues !== 1 ? 's' : ''}`;
        }
        if (warningIssues > 0) {
          comparisonCell += `<br/>⚠️ ${warningIssues} warning${warningIssues !== 1 ? 's' : ''}`;
        }
      }
    } else {
      comparisonCell = 'ℹ️ **No comparison data**';
    }
    
    return `| ${baselineCell} | ${currentCell} | ${comparisonCell} |\n`;
  }

  /**
   * Extract route name from screenshot filename
   */
  private extractRouteFromScreenshotName(screenshotName: string): string {
    // Remove viewport size pattern and file extension
    let route = screenshotName.replace(/-\d+x\d+.*$/, '').replace(/\.(png|jpg|jpeg)$/, '');
    // Convert back to route format
    route = route.replace(/_/g, '/');
    if (!route.startsWith('/')) {
      route = '/' + route;
    }
    if (route === '/root' || route === '/') {
      return '/';
    }
    return route;
  }

  /**
   * Generate embedded screenshots for PR comment (legacy method)
   */
  private generateEmbeddedScreenshots(screenshots: any[]): string {
    if (screenshots.length === 0) {
      return '';
    }

    let gallery = '### 📸 Screenshots\n\n';
    
    // Group screenshots by test/route name (remove viewport info)
    const groupedByRoute = screenshots.reduce((acc, screenshot) => {
      // Extract route from screenshot name by removing viewport dimensions
      let route = screenshot.name;
      // Remove viewport size pattern (e.g., -1920x1080)
      route = route.replace(/-\d+x\d+$/, '');
      // Clean up the route name
      route = route.replace(/^\//, '').replace(/-/g, ' ');
      
      if (!acc[route]) {
        acc[route] = [];
      }
      acc[route].push(screenshot);
      return acc;
    }, {} as Record<string, any[]>);

    // Generate gallery for each route
    for (const [route, routeScreenshots] of Object.entries(groupedByRoute)) {
      gallery += `#### Route: \`${route}\`\n\n`;
      
      // Only show images if they have Firebase URLs
      const screenshotsWithUrls = (routeScreenshots as any[]).filter((s: any) => s.firebaseUrl);
      
      if (screenshotsWithUrls.length === 0) {
        gallery += `_Screenshots captured but URLs not available_\n\n`;
        continue;
      }
      
      // Create a table for viewports
      gallery += '<table>\n<tr>\n';
      
      // Sort by viewport size (desktop, tablet, mobile)
      const sorted = screenshotsWithUrls.sort((a, b) => b.viewport.width - a.viewport.width);
      
      for (const screenshot of sorted) {
        gallery += `<td align="center">\n`;
        gallery += `<strong>${screenshot.viewport.name}</strong><br>\n`;
        gallery += `${screenshot.viewport.width}×${screenshot.viewport.height}<br>\n`;
        gallery += `<img src="${screenshot.firebaseUrl}" width="300" alt="${screenshot.name}" />\n`;
        gallery += `</td>\n`;
      }
      
      gallery += '</tr>\n</table>\n\n';
    }

    return gallery;
  }

  /**
   * Generate embedded videos for PR comment
   */
  private generateEmbeddedVideos(videos: any[]): string {
    if (videos.length === 0) {
      return '';
    }

    let gallery = '### 🎥 Test Videos\n\n';
    
    // Only show videos that have Firebase URLs
    const videosWithUrls = videos.filter(v => v.firebaseUrl);
    
    if (videosWithUrls.length === 0) {
      gallery += '_Videos captured but URLs not available_\n\n';
      return gallery;
    }
    
    // GitHub doesn't support video embedding, so we'll create nice preview links
    // with video thumbnails if possible
    gallery += '<table>\n';
    
    // Create rows of 3 videos each
    for (let i = 0; i < videosWithUrls.length; i += 3) {
      gallery += '<tr>\n';
      
      for (let j = i; j < Math.min(i + 3, videosWithUrls.length); j++) {
        const video = videosWithUrls[j];
        gallery += `<td align="center" width="33%">\n`;
        gallery += `<a href="${video.firebaseUrl}">\n`;
        // Use a play button emoji as a visual indicator
        gallery += `<div>🎬</div>\n`;
        gallery += `<strong>${video.name.replace(/\.(webm|mp4)$/, '')}</strong><br>\n`;
        gallery += `<em>${this.formatDuration(video.duration)}</em><br>\n`;
        gallery += `<kbd>▶️ Click to Play</kbd>\n`;
        gallery += `</a>\n`;
        gallery += `</td>\n`;
      }
      
      // Fill empty cells if needed
      for (let k = videosWithUrls.length % 3; k < 3 && k > 0 && i + 3 > videosWithUrls.length; k++) {
        gallery += `<td></td>\n`;
      }
      
      gallery += '</tr>\n';
    }
    
    gallery += '</table>\n\n';
    
    // Add direct links as well
    gallery += '<details>\n<summary>Direct video links</summary>\n\n';
    for (const video of videosWithUrls) {
      gallery += `- [${video.name}](${video.firebaseUrl}) - ${this.formatDuration(video.duration)}\n`;
    }
    gallery += '\n</details>\n\n';

    return gallery;
  }
}

// Singleton instance for easy access
let globalInstance: GitHubCommentEngine | null = null;

/**
 * Get or create global GitHub comment engine instance
 */
export function getGitHubCommentEngine(): GitHubCommentEngine {
  if (!globalInstance) {
    globalInstance = new GitHubCommentEngine();
  }
  return globalInstance;
}