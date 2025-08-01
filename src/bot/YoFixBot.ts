import * as core from '@actions/core';
import * as github from '@actions/github';
import { CommandParser } from './CommandParser';
import { CommandHandler } from './CommandHandler';
import { BotResponse } from './types';
import { CodebaseAnalyzer } from '../context/CodebaseAnalyzer';
import { CodebaseContext } from '../context/types';
import { getGitHubCommentEngine, botActivity, errorHandler, ErrorCategory, ErrorSeverity } from '../core';

/**
 * YoFix Bot - Main controller for handling GitHub comments and commands
 */
export class YoFixBot {
  private octokit: ReturnType<typeof github.getOctokit>;
  private commandParser: CommandParser;
  private commandHandler: CommandHandler;
  private botUsername = 'yofix';
  private codebaseContext: CodebaseContext | null = null;
  private commentEngine = getGitHubCommentEngine();

  constructor(githubToken: string, claudeApiKey: string) {
    this.octokit = github.getOctokit(githubToken);
    this.commandParser = new CommandParser();
    this.commandHandler = new CommandHandler(githubToken, claudeApiKey);
    
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
      const githubToken = config.get('github-token', { 
        defaultValue: process.env.YOFIX_GITHUB_TOKEN 
      });
      const claudeApiKey = config.getSecret('claude-api-key');
      this.commandHandler = new CommandHandler(githubToken, claudeApiKey, this.codebaseContext);
      
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
  async handleIssueComment(context: typeof github.context): Promise<void> {
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
        repo: context.repo,
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
    const context = github.context;
    
    try {
      // First, check if there's a preview URL in the environment
      const envUrl = process.env.PREVIEW_URL || core.getInput('preview-url');
      if (envUrl) {
        return envUrl;
      }
      
      // Try to find preview URL from PR comments
      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber
      });
      
      // Look for Firebase preview URL in comments
      for (const comment of comments) {
        const urlMatch = comment.body.match(/https:\/\/[^.]+--pr-\d+[^.]+\.web\.app/);
        if (urlMatch) {
          return urlMatch[0];
        }
      }
      
      // Try to construct URL based on pattern
      const projectId = process.env.FIREBASE_PROJECT_ID || core.getInput('firebase-project-id');
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