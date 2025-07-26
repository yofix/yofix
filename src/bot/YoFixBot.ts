import * as core from '@actions/core';
import * as github from '@actions/github';
import { CommandParser } from './CommandParser';
import { CommandHandler } from './CommandHandler';
import { BotResponse } from './types';
import { CodebaseAnalyzer } from '../context/CodebaseAnalyzer';
import { CodebaseContext } from '../context/types';

/**
 * YoFix Bot - Main controller for handling GitHub comments and commands
 */
export class YoFixBot {
  private octokit: ReturnType<typeof github.getOctokit>;
  private commandParser: CommandParser;
  private commandHandler: CommandHandler;
  private botUsername = 'yofix';
  private codebaseContext: CodebaseContext | null = null;

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
      const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
      const claudeApiKey = process.env.CLAUDE_API_KEY || core.getInput('claude-api-key') || '';
      this.commandHandler = new CommandHandler(githubToken, claudeApiKey, this.codebaseContext);
      
      core.info('✅ Codebase context initialized successfully');
    } catch (error) {
      core.warning(`Failed to initialize codebase context: ${error.message}`);
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
        await this.postComment(issue.number, this.getHelpMessage());
        return;
      }

      // Post acknowledgment
      await this.postComment(
        issue.number,
        `🔧 YoFix is ${command.action}ing... This may take a moment.`
      );

      // Get preview URL for this PR
      const previewUrl = await this.getPreviewUrl(issue.number);
      
      // Execute command
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

      // Post result
      await this.postComment(issue.number, result.message);

    } catch (error) {
      core.error(`Bot error: ${error}`);
      await this.postComment(
        issue.number,
        `❌ YoFix encountered an error: ${error.message}\n\nTry \`@yofix help\` for available commands.`
      );
    }
  }

  /**
   * Post a comment to the PR
   */
  private async postComment(issueNumber: number, body: string): Promise<void> {
    const context = github.context;
    
    await this.octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNumber,
      body
    });
  }

  /**
   * Get help message with available commands
   */
  private getHelpMessage(): string {
    return `## 🔧 YoFix Bot Commands

I can help you detect and fix visual issues in your PR. Here are my commands:

### 🔍 Scanning Commands
- \`@yofix scan\` - Scan all routes for visual issues
- \`@yofix scan /specific-route\` - Scan a specific route
- \`@yofix scan --viewport mobile\` - Scan with specific viewport

### 🔧 Fix Commands
- \`@yofix fix\` - Generate fixes for all detected issues
- \`@yofix fix #3\` - Generate fix for specific issue
- \`@yofix apply\` - Apply all suggested fixes
- \`@yofix apply #2\` - Apply specific fix

### 📊 Analysis Commands
- \`@yofix explain #1\` - Get detailed explanation of an issue
- \`@yofix compare production\` - Compare with production baseline
- \`@yofix report\` - Generate full analysis report

### 🎯 Other Commands
- \`@yofix baseline update\` - Update visual baseline with current state
- \`@yofix preview\` - Preview fixes before applying
- \`@yofix ignore\` - Skip visual testing for this PR
- \`@yofix help\` - Show this help message

### 💡 Examples
\`\`\`
@yofix scan /dashboard --viewport tablet
@yofix fix #1
@yofix apply
\`\`\`

Need more help? Check our [documentation](https://yofix.dev/docs).`;
  }

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
      core.warning(`Failed to get preview URL: ${error.message}`);
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