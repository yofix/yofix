import * as core from '@actions/core';
import { GitHubCommentEngine, getGitHubCommentEngine } from '../github/GitHubCommentEngine';
import { errorHandler, ErrorSeverity, ErrorCategory } from '../error/CentralizedErrorHandler';

export interface BotActivity {
  id: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  result?: any;
  error?: Error;
  steps: BotActivityStep[];
}

export interface BotActivityStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  message?: string;
  timestamp: Date;
  duration?: number;
}

export class BotActivityHandler {
  private commentEngine: GitHubCommentEngine;
  private activities: Map<string, BotActivity> = new Map();
  private currentActivity: BotActivity | null = null;

  constructor() {
    this.commentEngine = getGitHubCommentEngine();
  }

  /**
   * Start a new bot activity
   */
  async startActivity(id: string, command: string, initialMessage?: string): Promise<void> {
    const activity: BotActivity = {
      id,
      command,
      status: 'pending',
      startTime: new Date(),
      steps: []
    };
    
    this.activities.set(id, activity);
    this.currentActivity = activity;
    
    // Post initial message
    const message = initialMessage || `🤖 **Processing \`${command}\`**\n\n⏳ Initializing...`;
    
    await this.commentEngine.startThread(id, message, {
      reactions: ['eyes']
    });
    
    activity.status = 'running';
  }

  /**
   * Add a step to current activity
   */
  async addStep(stepName: string, status: BotActivityStep['status'] = 'pending', message?: string): Promise<void> {
    if (!this.currentActivity) {
      core.warning('No active bot activity');
      return;
    }
    
    const step: BotActivityStep = {
      name: stepName,
      status,
      message,
      timestamp: new Date()
    };
    
    this.currentActivity.steps.push(step);
    
    // Update progress
    await this.updateProgress();
  }

  /**
   * Update step status
   */
  async updateStep(stepName: string, status: BotActivityStep['status'], message?: string): Promise<void> {
    if (!this.currentActivity) return;
    
    const step = this.currentActivity.steps.find(s => s.name === stepName);
    if (!step) {
      core.warning(`Step ${stepName} not found`);
      return;
    }
    
    const previousStatus = step.status;
    step.status = status;
    if (message) step.message = message;
    
    // Calculate duration if completed
    if (status === 'completed' || status === 'failed') {
      step.duration = Date.now() - step.timestamp.getTime();
    }
    
    // Update progress
    await this.updateProgress();
  }

  /**
   * Complete current activity
   */
  async completeActivity(result?: any, finalMessage?: string): Promise<void> {
    if (!this.currentActivity) return;
    
    this.currentActivity.status = 'completed';
    this.currentActivity.endTime = new Date();
    this.currentActivity.result = result;
    
    // Generate final message
    const duration = this.currentActivity.endTime.getTime() - this.currentActivity.startTime.getTime();
    const durationStr = this.formatDuration(duration);
    
    let message = `✅ **Completed \`${this.currentActivity.command}\`**\n\n`;
    
    if (finalMessage) {
      message += finalMessage + '\n\n';
    }
    
    message += this.generateStepsSummary();
    message += `\n⏱️ Total time: ${durationStr}`;
    
    await this.commentEngine.updateThread(this.currentActivity.id, message, {
      reactions: ['+1', 'rocket']
    });
    
    this.currentActivity = null;
  }

  /**
   * Fail current activity
   */
  async failActivity(error: Error | string, context?: any): Promise<void> {
    if (!this.currentActivity) return;
    
    this.currentActivity.status = 'failed';
    this.currentActivity.endTime = new Date();
    this.currentActivity.error = error instanceof Error ? error : new Error(error);
    
    // Handle error through centralized handler
    await errorHandler.handleError(this.currentActivity.error, {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      userAction: `Bot command: ${this.currentActivity.command}`,
      metadata: context,
      skipGitHubPost: true // We'll post our own formatted message
    });
    
    // Generate failure message
    let message = `❌ **Failed \`${this.currentActivity.command}\`**\n\n`;
    message += `**Error**: ${this.currentActivity.error.message}\n\n`;
    message += this.generateStepsSummary();
    
    // Add troubleshooting for common bot commands
    const tips = this.getBotCommandTips(this.currentActivity.command, this.currentActivity.error.message);
    if (tips.length > 0) {
      message += '\n### 💡 Suggestions:\n';
      message += tips.map(tip => `- ${tip}`).join('\n');
    }
    
    await this.commentEngine.updateThread(this.currentActivity.id, message, {
      reactions: ['confused', '-1']
    });
    
    this.currentActivity = null;
  }

  /**
   * Post a simple bot response (for quick commands)
   */
  async postBotResponse(message: string, options?: {
    success?: boolean;
    reactions?: Array<'+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'>;
    threadId?: string;
  }): Promise<void> {
    const formattedMessage = options?.success !== false 
      ? `✅ ${message}`
      : `❌ ${message}`;
    
    if (options?.threadId) {
      await this.commentEngine.replyToThread(options.threadId, formattedMessage, {
        reactions: options.reactions
      });
    } else {
      await this.commentEngine.postComment(formattedMessage, {
        reactions: options.reactions
      });
    }
  }

  /**
   * Post help message
   */
  async postHelpMessage(commands: Array<{ command: string; description: string; examples?: string[] }>): Promise<void> {
    let message = '## 🔧 YoFix Bot Commands\n\n';
    
    for (const cmd of commands) {
      message += `### \`${cmd.command}\`\n`;
      message += `${cmd.description}\n`;
      
      if (cmd.examples && cmd.examples.length > 0) {
        message += '\n**Examples:**\n';
        message += cmd.examples.map(ex => `- \`${ex}\``).join('\n');
        message += '\n';
      }
      
      message += '\n';
    }
    
    message += '---\n';
    message += '💡 **Tips:**\n';
    message += '- All commands start with `@yofix`\n';
    message += '- Use `--help` with any command for more info\n';
    message += '- Commands can be chained with `&&`\n';
    
    await this.commentEngine.postComment(message, {
      reactions: ['heart']
    });
  }

  /**
   * Track an activity with automatic handling
   */
  async trackActivity<T>(
    operation: string,
    handler: () => Promise<T>
  ): Promise<T> {
    const activityId = `activity-${Date.now()}`;
    
    try {
      await this.startActivity(activityId, operation);
      const result = await handler();
      await this.completeActivity(result);
      return result;
    } catch (error) {
      await this.failActivity(error as Error);
      throw error;
    }
  }

  /**
   * Handle unknown command
   */
  async handleUnknownCommand(command: string, suggestions?: string[]): Promise<void> {
    let message = `❓ **Unknown command: \`${command}\`**\n\n`;
    
    if (suggestions && suggestions.length > 0) {
      message += 'Did you mean:\n';
      message += suggestions.map(s => `- \`@yofix ${s}\``).join('\n');
      message += '\n\n';
    }
    
    message += 'Use `@yofix help` to see available commands.';
    
    await this.commentEngine.postComment(message, {
      reactions: ['confused']
    });
  }

  // Private methods

  private async updateProgress(): Promise<void> {
    if (!this.currentActivity) return;
    
    const message = this.generateProgressMessage();
    await this.commentEngine.updateThread(this.currentActivity.id, message);
  }

  private generateProgressMessage(): string {
    if (!this.currentActivity) return '';
    
    let message = `🔄 **Processing \`${this.currentActivity.command}\`**\n\n`;
    
    // Add steps
    for (const step of this.currentActivity.steps) {
      const icon = this.getStepIcon(step.status);
      const duration = step.duration ? ` (${this.formatDuration(step.duration)})` : '';
      
      message += `${icon} ${step.name}${duration}\n`;
      
      if (step.message) {
        message += `   ${step.message}\n`;
      }
    }
    
    // Add elapsed time
    const elapsed = Date.now() - this.currentActivity.startTime.getTime();
    message += `\n⏱️ Elapsed: ${this.formatDuration(elapsed)}`;
    
    return message;
  }

  private generateStepsSummary(): string {
    if (!this.currentActivity) return '';
    
    let summary = '### Steps Summary\n';
    
    const completed = this.currentActivity.steps.filter(s => s.status === 'completed').length;
    const failed = this.currentActivity.steps.filter(s => s.status === 'failed').length;
    const skipped = this.currentActivity.steps.filter(s => s.status === 'skipped').length;
    const total = this.currentActivity.steps.length;
    
    summary += `- ✅ Completed: ${completed}/${total}\n`;
    if (failed > 0) summary += `- ❌ Failed: ${failed}\n`;
    if (skipped > 0) summary += `- ⏭️ Skipped: ${skipped}\n`;
    
    return summary + '\n';
  }

  private getStepIcon(status: BotActivityStep['status']): string {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'skipped': return '⏭️';
      default: return '❓';
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  private getBotCommandTips(command: string, error: string): string[] {
    const tips: string[] = [];
    
    // Command-specific tips
    if (command.includes('scan')) {
      tips.push('Ensure the preview URL is accessible');
      tips.push('Check if authentication is required');
      tips.push('Try specifying a specific route: `@yofix scan /dashboard`');
    }
    
    if (command.includes('fix')) {
      tips.push('Run `@yofix scan` first to detect issues');
      tips.push('Specify an issue number: `@yofix fix #3`');
    }
    
    if (command.includes('test')) {
      tips.push('Ensure test credentials are configured');
      tips.push('Check the login URL is correct');
      tips.push('Try a different auth mode');
    }
    
    // Error-specific tips
    if (error.includes('timeout')) {
      tips.push('The operation took too long - try again');
      tips.push('Check if the site is responding slowly');
    }
    
    if (error.includes('not found')) {
      tips.push('Check the spelling of your command');
      tips.push('Use `@yofix help` to see available options');
    }
    
    return tips;
  }
}

// Export singleton instance
export const botActivity = new BotActivityHandler();