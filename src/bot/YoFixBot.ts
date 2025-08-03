import * as core from '@actions/core';
import { getConfiguration } from '../core/hooks/ConfigurationHook';
// import * as github from '@actions/github'; // Removed - now using GitHubServiceFactory
import { CommandParser } from './CommandParser';
import { CommandHandler } from './CommandHandler';
import { BotResponse } from './types';
import { CodebaseAnalyzer } from '../context/CodebaseAnalyzer';
import { CodebaseContext } from '../context/types';
import { getGitHubCommentEngine, botActivity, errorHandler, ErrorCategory, ErrorSeverity } from '../core';
import { GitHubServiceFactory, GitHubService } from '../core/github/GitHubServiceFactory';

/**
 * YoFix Bot - Main controller for handling GitHub comments and commands
 */
export class YoFixBot {
  private github: GitHubService;
  private context: ReturnType<GitHubService['getContext']>;
  private commandParser: CommandParser;
  private commandHandler: CommandHandler;
  private botUsername = 'yofix';
  private codebaseContext: CodebaseContext | null = null;
  private commentEngine = getGitHubCommentEngine();

  constructor(claudeApiKey: string) {
    this.github = GitHubServiceFactory.getService();
    this.context = this.github.getContext();
    this.commandParser = new CommandParser();
    this.commandHandler = new CommandHandler(claudeApiKey);
    
    // Initialize codebase analysis in the background
    this.initializeCodebaseContext();
  }
  
  /**
   * Initialize codebase context asynchronously
   */
  private async initializeCodebaseContext(): Promise<void> {
    try {
      const analyzer = new CodebaseAnalyzer();
      this.codebaseContext = await analyzer.analyzeRepository();
      
      // Recreate command handler with context
      const { config } = await import('../core');
      const claudeApiKey = config.getSecret('claude-api-key');
      this.commandHandler = new CommandHandler(claudeApiKey, this.codebaseContext);
      
      core.info('✅ Codebase context initialized successfully');
    } catch (error) {
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.CONFIGURATION,
        userAction: 'Initialize codebase context',
        recoverable: true,
        skipGitHubPost: true
      });
    }
  }

  /**
   * Listen for mentions in PR comments
   */
  async handleIssueComment(context: ReturnType<GitHubService['getContext']>): Promise<void> {
    const { issue, comment } = context.payload;
    
    if (!issue?.pull_request || !comment) {
      return;
    }

    const commentBody = comment.body.toLowerCase();
    
    // Check if bot is mentioned
    if (!commentBody.includes(`@${this.botUsername}`)) {
      return;
    }

    core.info(`YoFix bot mentioned in PR #${issue.number}`);

    try {
      // Parse command from comment
      const command = this.commandParser.parse(comment.body);
      
      if (!command) {
        await botActivity.handleUnknownCommand(comment.body.replace(/@yofix\s*/i, ''));
        return;
      }

      // Add immediate acknowledgment
      await this.commentEngine.reactToComment(comment.id, 'eyes');

      // Get preview URL for this PR
      const previewUrl = await this.getPreviewUrl(issue.number);

      // Execute command - bot activity handler will manage all updates
      const result = await this.commandHandler.execute(command, {
        prNumber: issue.number,
        repo: {
          owner: context.owner,
          repo: context.repo
        },
        comment: {
          id: comment.id,
          user: comment.user,
          body: comment.body
        },
        previewUrl
      });
      
      // Result is already posted by bot activity handler

    } catch (error) {
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.UNKNOWN,
        userAction: `Bot command: ${comment.body}`,
        metadata: {
          issueNumber: issue.number,
          commentId: comment.id
        }
      });
    }
  }

  // Comment handling is now done through centralized comment engine

  /**
   * Check if a comment is from the bot itself (to avoid loops)
   */
  private isBotComment(comment: any): boolean {
    return comment.user?.login?.includes('bot') || 
           comment.user?.type === 'Bot';
  }

  /**
   * Get preview URL for a PR
   */
  private async getPreviewUrl(prNumber: number): Promise<string | undefined> {
    const context = this.github.getContext();
    
    try {
      // First, check if there's a preview URL in the environment
      const envUrl = process.env.PREVIEW_URL || getConfiguration().getInput('preview-url');
      if (envUrl) {
        return envUrl;
      }
      
      // Try to find preview URL from PR comments
      const comments = await this.github.listComments(
        this.context.owner,
        this.context.repo,
        prNumber
      );
      
      // Look for Firebase preview URL in comments
      for (const comment of comments) {
        const urlMatch = comment.body.match(/https:\/\/[^.]+--pr-\d+[^.]+\.web\.app/);
        if (urlMatch) {
          return urlMatch[0];
        }
      }
      
      // Try to construct URL based on pattern
      const projectId = process.env.FIREBASE_PROJECT_ID || getConfiguration().getInput('firebase-project-id');
      if (projectId) {
        return `https://${projectId}--pr-${prNumber}.web.app`;
      }
      
    } catch (error) {
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.CONFIGURATION,
        userAction: 'Get preview URL',
        recoverable: true,
        skipGitHubPost: true,
        metadata: { prNumber }
      });
    }
    
    return undefined;
  }

  /**
   * Initialize bot for GitHub App
   */
  static async createApp(appId: string, privateKey: string): Promise<YoFixBot> {
    // This would be used for GitHub App installation
    // For now, we're using GitHub Actions token
    throw new Error('GitHub App mode not yet implemented');
  }
}