import * as core from '@actions/core';
import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';

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
  private octokit: InstanceType<typeof GitHub>;
  private context: typeof github.context;
  private prNumber: number;
  private owner: string;
  private repo: string;
  
  // Cache for comment threads
  private threadCache: Map<string, number> = new Map();
  
  // Error tracking
  private errorCount = 0;
  private errorSummary: Array<{ timestamp: Date; error: string; location?: string }> = [];

  constructor(githubToken: string) {
    this.octokit = github.getOctokit(githubToken);
    this.context = github.context;
    this.owner = this.context.repo.owner;
    this.repo = this.context.repo.repo;
    
    // Get PR number from context
    this.prNumber = this.context.payload.pull_request?.number || 
                   this.context.payload.issue?.number || 
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
        const replyUrl = `${this.context.payload.repository?.html_url}/pull/${this.prNumber}#issuecomment-${options.inReplyTo}`;
        body = `> In reply to [this comment](${replyUrl})\n\n${message}`;
      }
      
      // Add signature if provided
      if (options.signature) {
        body = `${body}\n\n<!-- ${options.signature} -->`;
      }
      
      // Format error messages
      if (options.isError) {
        body = this.formatErrorMessage(body);
      }
      
      // Format progress messages
      if (options.isProgress) {
        body = this.formatProgressMessage(body);
      }

      let commentId: number;
      
      // Update existing comment if requested
      if (options.updateExisting && options.signature) {
        const existingComment = await this.findCommentBySignature(options.signature);
        if (existingComment) {
          await this.octokit.rest.issues.updateComment({
            owner: this.owner,
            repo: this.repo,
            comment_id: existingComment.id,
            body
          });
          commentId = existingComment.id;
          core.info(`Updated existing comment #${commentId}`);
        } else {
          const response = await this.octokit.rest.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: this.prNumber,
            body
          });
          commentId = response.data.id;
          core.info(`Created new comment #${commentId}`);
        }
      } else {
        const response = await this.octokit.rest.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: this.prNumber,
          body
        });
        commentId = response.data.id;
        core.info(`Created new comment #${commentId}`);
      }
      
      // Add reactions if requested
      if (options.reactions && options.reactions.length > 0) {
        await this.addReactions(commentId, options.reactions);
      }
      
      // Cache thread ID
      if (options.threadId) {
        this.threadCache.set(options.threadId, commentId);
      }
      
      return commentId;
      
    } catch (error) {
      core.error(`Failed to post comment: ${error}`);
      return null;
    }
  }

  /**
   * Post an error with context and troubleshooting tips
   */
  async postError(error: Error | string, context?: ErrorContext): Promise<void> {
    try {
      this.errorCount++;
      const errorMessage = error instanceof Error ? error.message : error;
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Track error for summary
      this.errorSummary.push({
        timestamp: new Date(),
        error: errorMessage,
        location: context?.location
      });
      
      // Build error message
      let message = `### ❌ YoFix Error #${this.errorCount}\n\n`;
      
      if (context?.userAction) {
        message += `**Action**: ${context.userAction}\n`;
      }
      
      if (context?.location) {
        message += `**Location**: \`${context.location}\`\n`;
      }
      
      message += `**Error**: ${errorMessage}\n`;
      
      if (context?.metadata) {
        message += '\n**Context**:\n```json\n' + JSON.stringify(context.metadata, null, 2) + '\n```\n';
      }
      
      if (context?.includeStackTrace && errorStack) {
        message += '\n<details>\n<summary>Stack Trace</summary>\n\n```\n' + errorStack + '\n```\n</details>\n';
      }
      
      // Add troubleshooting tips
      const tips = context?.tips || this.generateTroubleshootingTips(errorMessage);
      if (tips.length > 0) {
        message += '\n#### 💡 Troubleshooting Tips:\n' + tips.map(tip => `- ${tip}`).join('\n');
      }
      
      // Add standard help footer
      message += '\n\n---\n';
      message += '📚 [Documentation](https://github.com/yofix/yofix#troubleshooting) | ';
      message += '🐛 [Report Issue](https://github.com/yofix/yofix/issues/new) | ';
      message += '💬 [Get Help](https://github.com/yofix/yofix/discussions)';
      
      await this.postComment(message, {
        isError: true,
        signature: 'yofix-error',
        updateExisting: false // Always create new comment for errors
      });
      
    } catch (postError) {
      // If we can't post to GitHub, at least log it
      core.error(`Failed to post error to GitHub: ${postError}`);
      core.error(`Original error: ${error}`);
    }
  }

  /**
   * Start a new comment thread
   */
  async startThread(threadId: string, message: string, options: Omit<CommentOptions, 'threadId'> = {}): Promise<number | null> {
    const commentId = await this.postComment(message, {
      ...options,
      threadId,
      signature: `yofix-thread-${threadId}`
    });
    
    if (commentId) {
      this.threadCache.set(threadId, commentId);
    }
    
    return commentId;
  }

  /**
   * Reply to a thread
   */
  async replyToThread(threadId: string, message: string, options: Omit<CommentOptions, 'threadId' | 'inReplyTo'> = {}): Promise<number | null> {
    const parentCommentId = this.threadCache.get(threadId);
    if (!parentCommentId) {
      core.warning(`Thread ${threadId} not found, creating new comment`);
      return this.postComment(message, options);
    }
    
    return this.postComment(message, {
      ...options,
      inReplyTo: parentCommentId
    });
  }

  /**
   * Update a thread's main comment
   */
  async updateThread(threadId: string, message: string, options: Omit<CommentOptions, 'threadId' | 'updateExisting'> = {}): Promise<void> {
    await this.postComment(message, {
      ...options,
      updateExisting: true,
      signature: `yofix-thread-${threadId}`
    });
  }

  /**
   * Post a progress update (updates existing comment)
   */
  async postProgress(taskId: string, message: string, options: Omit<CommentOptions, 'updateExisting' | 'signature'> = {}): Promise<void> {
    await this.postComment(message, {
      ...options,
      updateExisting: true,
      signature: `yofix-progress-${taskId}`,
      isProgress: true
    });
  }

  /**
   * Add reactions to a comment
   */
  async addReactions(commentId: number, reactions: CommentOptions['reactions']): Promise<void> {
    if (!reactions) return;
    
    for (const reaction of reactions) {
      try {
        await this.octokit.rest.reactions.createForIssueComment({
          owner: this.owner,
          repo: this.repo,
          comment_id: commentId,
          content: reaction
        });
      } catch (error) {
        core.warning(`Failed to add reaction ${reaction}: ${error}`);
      }
    }
  }

  /**
   * React to an existing comment
   */
  async reactToComment(commentId: number, reaction: CommentOptions['reactions'][0]): Promise<void> {
    try {
      await this.octokit.rest.reactions.createForIssueComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: commentId,
        content: reaction
      });
    } catch (error) {
      core.warning(`Failed to react to comment: ${error}`);
    }
  }

  /**
   * Post error summary at the end of run
   */
  async postErrorSummary(): Promise<void> {
    if (this.errorSummary.length === 0) return;
    
    let message = `## 📊 Error Summary\n\n`;
    message += `Total errors encountered: **${this.errorCount}**\n\n`;
    message += '| Time | Error | Location |\n';
    message += '|------|-------|----------|\n';
    
    for (const error of this.errorSummary) {
      const time = error.timestamp.toLocaleTimeString();
      const errorMsg = error.error.length > 50 ? error.error.substring(0, 50) + '...' : error.error;
      const location = error.location || 'Unknown';
      message += `| ${time} | ${errorMsg} | ${location} |\n`;
    }
    
    await this.postComment(message, {
      signature: 'yofix-error-summary',
      updateExisting: true
    });
  }

  /**
   * Find existing comment by signature
   */
  private async findCommentBySignature(signature: string): Promise<{ id: number } | null> {
    try {
      const comments = await this.octokit.rest.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: this.prNumber,
        per_page: 100
      });
      
      const signatureComment = `<!-- ${signature} -->`;
      const existingComment = comments.data.find(comment => 
        comment.body?.includes(signatureComment)
      );
      
      return existingComment ? { id: existingComment.id } : null;
    } catch (error) {
      core.warning(`Failed to find existing comment: ${error}`);
      return null;
    }
  }

  /**
   * Format error message with styling
   */
  private formatErrorMessage(message: string): string {
    return `🚨 **Error** 🚨\n\n${message}`;
  }

  /**
   * Format progress message with styling
   */
  private formatProgressMessage(message: string): string {
    const timestamp = new Date().toLocaleTimeString();
    return `🔄 **Progress Update** (${timestamp})\n\n${message}`;
  }

  /**
   * Generate troubleshooting tips based on error message
   */
  private generateTroubleshootingTips(errorMessage: string): string[] {
    const tips: string[] = [];
    
    if (errorMessage.includes('Claude API') || errorMessage.includes('authentication_error')) {
      tips.push('🔑 Verify your Claude API key is valid and has sufficient credits');
      tips.push('📋 Set `CLAUDE_API_KEY` secret in your repository settings');
    }
    
    if (errorMessage.includes('Firebase') || errorMessage.includes('storage')) {
      tips.push('🔥 Check your Firebase credentials and storage bucket');
      tips.push('📋 Ensure `firebase-credentials` is base64 encoded correctly');
      tips.push('💡 Alternative: Use `storage-provider: s3` for AWS S3 storage');
    }
    
    if (errorMessage.includes('preview-url') || errorMessage.includes('accessible')) {
      tips.push('🌐 The preview URL might not be accessible');
      tips.push('⏳ Wait for deployment to complete before running YoFix');
      tips.push('🔒 Check if the URL requires authentication');
    }
    
    if (errorMessage.includes('auth') || errorMessage.includes('login')) {
      tips.push('🔐 Check your test credentials');
      tips.push('🤖 Try `auth-mode: smart` if LLM auth fails');
      tips.push('📍 Verify `auth-login-url` points to the correct login page');
    }
    
    if (errorMessage.includes('timeout')) {
      tips.push('⏱️ Increase `test-timeout` value (e.g., `10m`)');
      tips.push('🌐 Check if the site is loading slowly');
      tips.push('🔄 Try running the test again');
    }
    
    if (errorMessage.includes('screenshot') || errorMessage.includes('visual')) {
      tips.push('🖼️ Ensure the page is fully loaded before screenshots');
      tips.push('📱 Check if the viewport size is appropriate');
      tips.push('🔄 Clear browser cache and retry');
    }
    
    if (tips.length === 0) {
      tips.push('📖 Check the [documentation](https://github.com/yofix/yofix#configuration)');
      tips.push('🐛 [Report an issue](https://github.com/yofix/yofix/issues) if the problem persists');
    }
    
    return tips;
  }
  
  /**
   * Get thread history
   */
  async getThreadHistory(threadId: string): Promise<any[]> {
    const parentCommentId = this.threadCache.get(threadId);
    if (!parentCommentId) return [];
    
    try {
      const comments = await this.octokit.rest.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: this.prNumber
      });
      
      // Find all comments that reference the parent
      return comments.data.filter(comment => 
        comment.body?.includes(`#issuecomment-${parentCommentId}`)
      );
    } catch (error) {
      core.warning(`Failed to get thread history: ${error}`);
      return [];
    }
  }
}

// Singleton instance for easy access
let globalInstance: GitHubCommentEngine | null = null;

/**
 * Get or create global GitHub comment engine instance
 */
export function getGitHubCommentEngine(githubToken?: string): GitHubCommentEngine {
  if (!globalInstance) {
    const token = githubToken || core.getInput('github-token', { required: true });
    globalInstance = new GitHubCommentEngine(token);
  }
  return globalInstance;
}