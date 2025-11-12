/**
 * Step 0.5: Handle Comment Command
 *
 * Detects and processes @yofix commands from GitHub PR comments.
 * Supports commands like:
 * - @yofix test "https://example.com/page"
 * - @yofix test https://example.com/page 360x700,1080x1200
 *
 * Outputs:
 * - commandContext: Information about the command being executed
 * - testUrl: URL to test (overrides route analysis)
 * - customViewports: Custom viewport configuration if specified
 */

import * as core from '@actions/core';
import { getStepDataManager, executeStep, StepData } from './shared/StepDataManager';
import { GitHubServiceFactory } from '../core/github/GitHubServiceFactory';
import { getGitHubCommentEngine } from '../core/github/GitHubCommentEngine';
import { getCommandRegistry } from '../core/github/commands/CommandRegistry';
import { CommandContext as CmdContext } from '../core/github/commands/BaseCommand';

export interface CommandContext {
  isCommentCommand: boolean;
  command?: any;
  commentId?: number;
  commentUrl?: string;
}

/**
 * React to a comment with emoji
 */
async function reactToComment(commentId: number, reaction: 'eyes' | '+1' | 'rocket'): Promise<void> {
  try {
    const commentEngine = getGitHubCommentEngine();
    await commentEngine.reactToComment(commentId, reaction);
  } catch (error) {
    core.warning(`Failed to react to comment: ${error}`);
  }
}

/**
 * Post error message as comment reply
 */
async function postErrorReply(commentId: number, errorMessage: string): Promise<void> {
  try {
    const commentEngine = getGitHubCommentEngine();
    await commentEngine.postComment(
      `❌ **Command Error**\n\n${errorMessage}`,
      { inReplyTo: commentId }
    );
  } catch (error) {
    core.warning(`Failed to post error reply: ${error}`);
  }
}

/**
 * Check if this is a comment command event and parse it
 */
export function detectCommentCommand(): CommandContext | null {
  const githubService = GitHubServiceFactory.getService();
  const context = githubService.getContext();

  // Check if this is an issue_comment event
  if (context.eventName !== 'issue_comment') {
    return null;
  }

  // Check if the comment is on a pull request
  if (!context.payload?.issue?.pull_request) {
    core.info('ℹ️ Comment is not on a pull request, skipping');
    return null;
  }

  // Get comment data from payload
  const comment = context.payload.comment;
  if (!comment) {
    core.warning('⚠️ No comment found in issue_comment event payload');
    return null;
  }

  core.info(`📝 Processing comment #${comment.id} from ${comment.user?.login}`);

  // Parse the comment using command registry
  const registry = getCommandRegistry();
  const result = registry.parseComment(comment.body);

  if (!result) {
    core.info('ℹ️ No @yofix command found in comment');
    return null;
  }

  core.info(`🎯 Detected @yofix ${result.command.name} command`);

  return {
    isCommentCommand: true,
    command: result,
    commentId: comment.id,
    commentUrl: `https://github.com/${context.owner}/${context.repo}/pull/${context.prNumber}#issuecomment-${comment.id}`,
  };
}

/**
 * Main step execution
 */
export async function handleCommentCommand(stepData: StepData): Promise<StepData> {
  return executeStep('Handle Comment Command', async () => {
    // Check if this is a comment command
    const commandContext = detectCommentCommand();

    // Not a comment command, continue with normal flow
    if (!commandContext) {
      core.info('ℹ️ Not a comment command event, skipping command handler');
      return {
        ...stepData,
        commandContext: {
          isCommentCommand: false,
        },
      };
    }

    // React with 👀 to indicate we're processing
    core.info('👀 Reacting to comment to indicate processing...');
    if (commandContext.commentId) {
      await reactToComment(commandContext.commentId, 'eyes');
    }

    const { command: cmdResult, commentId } = commandContext;

    if (!cmdResult) {
      throw new Error('Command result is missing');
    }

    const { command, parsed } = cmdResult;

    // Validate the command
    const validation = command.validate(parsed);
    if (!validation.valid) {
      core.error(`❌ Invalid command: ${validation.error}`);

      // Post error reply
      if (commentId) {
        await postErrorReply(commentId, validation.error!);
      }

      throw new Error(`Invalid @yofix command: ${validation.error}`);
    }

    // Execute the command
    const githubService = GitHubServiceFactory.getService();
    const context = githubService.getContext();
    const comment = context.payload?.comment;

    const execContext: CmdContext = {
      commentId: commentId!,
      commentUrl: commandContext.commentUrl!,
      commentBody: comment?.body || '',
      commentAuthor: comment?.user?.login || 'unknown',
    };

    core.info(`🚀 Executing ${command.name} command...`);
    const execResult = await command.execute(parsed, execContext, stepData);

    if (!execResult.success) {
      core.error(`❌ Command execution failed: ${execResult.error}`);

      // Post error reply
      if (commentId) {
        await postErrorReply(commentId, execResult.error!);
      }

      throw new Error(`Command execution failed: ${execResult.error}`);
    }

    // Merge command result into step data
    return {
      ...stepData,
      ...execResult.stepData,
      commandContext: {
        ...commandContext,
        isCommentCommand: true,
      },
    };
  });
}

/**
 * React to command completion
 */
export async function markCommandComplete(commentId: number): Promise<void> {
  try {
    core.info('✅ Command completed, adding green check reaction');
    await reactToComment(commentId, '+1');
  } catch (error) {
    core.warning(`Failed to mark command complete: ${error}`);
  }
}

/**
 * Entry point for standalone execution
 */
export async function main(): Promise<void> {
  try {
    const manager = getStepDataManager();
    const stepData = await manager.load();
    const updatedData = await handleCommentCommand(stepData);
    await manager.save(updatedData);

    core.info('✅ Step 0.5: Handle Comment Command completed successfully');
  } catch (error) {
    core.setFailed(`Step 0.5 failed: ${error}`);
    throw error;
  }
}
