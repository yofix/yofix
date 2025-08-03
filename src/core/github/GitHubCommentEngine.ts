import * as core from '@actions/core';
import { GitHubServiceFactory, GitHubService } from './GitHubServiceFactory';

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
            this.owner,
            this.repo,
            existingComment.id,
            body
          );
          commentId = existingComment.id;
          core.info(`Updated existing comment #${commentId}`);
        } else {
          const result = await this.github.createComment(
            this.owner,
            this.repo,
            this.prNumber,
            body
          );
          commentId = result.id;
          core.info(`Created new comment #${commentId}`);
        }
      } else {
        const result = await this.github.createComment(
          this.owner,
          this.repo,
          this.prNumber,
          body
        );
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
        this.owner,
        this.repo,
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
      const comments = await this.github.listComments(
        this.owner,
        this.repo,
        this.prNumber
      );
      
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
      const comments = await this.github.listComments(
        this.owner,
        this.repo,
        this.prNumber
      );
      
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