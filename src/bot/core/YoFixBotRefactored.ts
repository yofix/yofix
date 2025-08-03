import * as core from '@actions/core';
// import * as github from '@actions/github'; // Removed - now using GitHubServiceFactory
import { BotCommand, BotContext } from '../types';
import { CommandRegistry } from './CommandRegistry';
import { ProgressReporter, ProgressReporterFactory } from './ProgressReporter';
import { CommandParser } from '../CommandParser';
import { GitHubServiceFactory, GitHubService } from '../../core/github/GitHubServiceFactory';

/**
 * Bot interface - follows Interface Segregation Principle
 */
export interface Bot {
  handleIssueComment(context: ReturnType<GitHubService['getContext']>): Promise<void>;
}

/**
 * GitHub interactor abstraction
 */
export interface GitHubInteractor {
  addReaction(params: {
    owner: string;
    repo: string;
    comment_id: number;
    content: string;
  }): Promise<void>;
  
  createComment(params: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }): Promise<{ data: { id: number } }>;
  
  updateComment(params: {
    owner: string;
    repo: string;
    comment_id: number;
    body: string;
  }): Promise<void>;
}

/**
 * Default GitHub interactor implementation
 */
export class DefaultGitHubInteractor implements GitHubInteractor {
  private github: GitHubService;
  private context: ReturnType<GitHubService['getContext']>;

  constructor() {
    this.github = GitHubServiceFactory.getService();
    this.context = this.github.getContext();
  }

  async addReaction(params: Parameters<GitHubInteractor['addReaction']>[0]): Promise<void> {
    await this.github.addReaction(
      params.owner,
      params.repo,
      params.comment_id,
      params.content as any
    );
  }

  async createComment(params: Parameters<GitHubInteractor['createComment']>[0]) {
    const result = await this.github.createComment(
      params.owner,
      params.repo,
      params.issue_number,
      params.body
    );
    return { data: { id: result.id } };
  }

  async updateComment(params: Parameters<GitHubInteractor['updateComment']>[0]): Promise<void> {
    await this.github.updateComment(
      params.owner,
      params.repo,
      params.comment_id,
      params.body
    );
  }
}

/**
 * Refactored YoFix Bot - follows SOLID principles
 */
export class YoFixBotRefactored implements Bot {
  private readonly commandParser: CommandParser;

  constructor(
    private readonly githubInteractor: GitHubInteractor,
    private readonly commandRegistry: CommandRegistry,
    private readonly botUsername: string = 'yofix'
  ) {
    this.commandParser = new CommandParser();
  }

  async handleIssueComment(context: ReturnType<GitHubService['getContext']>): Promise<void> {
    const { issue, comment } = context.payload;
    
    if (!issue?.pull_request || !comment) {
      return;
    }

    if (!this.isBotMentioned(comment.body)) {
      return;
    }

    core.info(`YoFix bot mentioned in PR #${issue.number}`);

    try {
      const command = this.parseCommand(comment.body);
      if (!command) {
        await this.handleInvalidCommand(context, comment);
        return;
      }

      await this.executeCommand(command, context, comment);
    } catch (error: any) {
      await this.handleError(error, context, comment);
    }
  }

  private isBotMentioned(body: string): boolean {
    return body.toLowerCase().includes(`@${this.botUsername}`);
  }

  private parseCommand(body: string): BotCommand | null {
    return this.commandParser.parse(body);
  }

  private async executeCommand(
    command: BotCommand,
    context: ReturnType<GitHubService['getContext']>,
    comment: any
  ): Promise<void> {
    // Add acknowledgment
    await this.acknowledge(context, comment);

    // Get handler
    const handler = this.commandRegistry.getHandler(command);
    if (!handler) {
      await this.handleUnknownCommand(context, comment, command);
      return;
    }

    // Create progress comment
    const progressComment = await this.createProgressComment(
      context,
      comment,
      `🔄 **Processing \`@yofix ${command.action}\`**\n\n⏳ Initializing...`
    );

    // Create progress reporter
    const progressReporter = this.createProgressReporter(
      context,
      progressComment.data.id
    );

    // Build context
    const botContext: BotContext = {
      prNumber: context.payload.issue.number,
      repo: {
        owner: context.owner,
        repo: context.repo
      },
      comment: {
        id: comment.id,
        user: comment.user,
        body: comment.body
      },
      previewUrl: await this.getPreviewUrl(context.payload.issue.number)
    };

    // Execute command
    try {
      const result = await handler.execute(command, botContext);
      await progressReporter.report(result.message);
    } catch (error: any) {
      await progressReporter.report(
        `❌ Error: ${error.message}\n\nTry \`@yofix help\` for available commands.`
      );
      throw error;
    }
  }

  private async acknowledge(
    context: ReturnType<GitHubService['getContext']>,
    comment: any
  ): Promise<void> {
    await this.githubInteractor.addReaction({
      owner: context.owner,
      repo: context.repo,
      comment_id: comment.id,
      content: 'eyes'
    });
  }

  private async createProgressComment(
    context: ReturnType<GitHubService['getContext']>,
    originalComment: any,
    initialMessage: string
  ) {
    const body = `> In reply to [this comment](${originalComment.html_url})\n\n${initialMessage}`;
    
    return await this.githubInteractor.createComment({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.payload.issue.number,
      body
    });
  }

  private createProgressReporter(
    context: ReturnType<GitHubService['getContext']>,
    commentId: number
  ): ProgressReporter {
    const updateComment = async (id: number, body: string) => {
      await this.githubInteractor.updateComment({
        owner: context.owner,
        repo: context.repo,
        comment_id: id,
        body
      });
    };

    return ProgressReporterFactory.createForGitHubComment(updateComment, commentId);
  }

  private async handleInvalidCommand(
    context: ReturnType<GitHubService['getContext']>,
    comment: any
  ): Promise<void> {
    const helpMessage = this.commandRegistry.getAllHandlers()
      .map(handler => handler.getHelpText())
      .join('\n');

    await this.githubInteractor.createComment({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.payload.issue.number,
      body: `## 🔧 YoFix Bot Commands\n\n${helpMessage}`
    });
  }

  private async handleUnknownCommand(
    context: ReturnType<GitHubService['getContext']>,
    comment: any,
    command: BotCommand
  ): Promise<void> {
    await this.githubInteractor.createComment({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.payload.issue.number,
      body: `❓ Unknown command: \`${command.action}\`\n\nTry \`@yofix help\` for available commands.`
    });
  }

  private async handleError(
    error: Error,
    context: ReturnType<GitHubService['getContext']>,
    comment: any
  ): Promise<void> {
    core.error(`Bot error: ${error}`);
    
    await this.githubInteractor.createComment({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.payload.issue.number,
      body: `❌ YoFix encountered an error: ${error.message}\n\nTry \`@yofix help\` for available commands.`
    });
  }

  private async getPreviewUrl(prNumber: number): Promise<string | undefined> {
    // This could be extracted to a separate service
    const envUrl = process.env.PREVIEW_URL || core.getInput('preview-url');
    if (envUrl) {
      return envUrl;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || core.getInput('firebase-project-id');
    if (projectId) {
      return `https://${projectId}--pr-${prNumber}.web.app`;
    }

    return undefined;
  }
}

/**
 * Factory for creating the bot with all dependencies
 */
export class BotFactory {
  static create(
    commandRegistry: CommandRegistry
  ): Bot {
    const githubInteractor = new DefaultGitHubInteractor();
    
    return new YoFixBotRefactored(
      githubInteractor,
      commandRegistry
    );
  }
}