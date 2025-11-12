/**
 * YoFix Visual Testing Action - Main Entry Point
 *
 * This is the single entry point for the GitHub Action.
 * It orchestrates all steps sequentially and handles errors globally.
 */

import * as core from '@actions/core';
import { initialize } from './steps/0-initialize.step';
import { handleCommentCommand, markCommandComplete } from './steps/0.5-handle-comment-command.step';
import { analyzeRoutes } from './steps/1-analyze-routes.step';
import { browseRoutes } from './steps/2-browse-routes.step';
import { compareWithBaselines } from './steps/2.5-compare-baselines.step';
import { uploadToStorage } from './steps/3-upload-storage.step';
import { postResults } from './steps/4-post-results.step';
import { updateBaselines } from './steps/5-update-baselines.step';
import { getStepDataManager } from './steps/shared/StepDataManager';
import { errorHandler, ErrorSeverity, ErrorCategory } from './core/error/CentralizedErrorHandler';

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const workflowStartTime = Date.now();
  const manager = getStepDataManager();

  try {
    core.info('━'.repeat(60));
    core.info('🚀 YoFix Visual Testing Action');
    core.info('━'.repeat(60));

    // Initialize step data directory
    await manager.initialize();

    // Step 0: Initialize
    core.startGroup('📋 Step 0: Initialize Workflow');
    let stepData = await initialize();
    await manager.save(stepData);
    core.endGroup();

    // Step 0.5: Handle Comment Command (if applicable)
    core.startGroup('💬 Step 0.5: Handle Comment Command');
    stepData = await handleCommentCommand(stepData);
    await manager.save(stepData);
    core.endGroup();

    const isCommentCommand = stepData.commandContext?.isCommentCommand || false;
    const hasTestUrl = !!stepData.testUrl;

    // Step 1: Analyze Routes (skip if comment command with explicit URL)
    if (!hasTestUrl) {
      core.startGroup('🔍 Step 1: Analyze Routes');
      stepData = await analyzeRoutes(stepData);
      await manager.save(stepData);
      core.endGroup();

      // Check if we have routes to test
      if (!stepData.routes || stepData.routes.affectedRoutes.length === 0) {
        core.warning('⚠️  No routes to test. Skipping screenshot capture and comparison.');
        core.info('\n✅ YoFix workflow completed (no routes to test)');
        return;
      }
    } else {
      core.info('ℹ️ Skipping route analysis - using explicit test URL from comment command');
      // Create a synthetic route for the test URL
      stepData.routes = {
        affectedRoutes: [stepData.testUrl],
        impactTree: null,
        routesToTest: null,
        components: [],
        metadata: {
          totalRoutes: 1,
          source: 'comment-command',
        },
      };
    }

    // Step 2: Browse Routes & Capture Screenshots
    core.startGroup('📸 Step 2: Browse Routes & Capture Screenshots');
    stepData = await browseRoutes(stepData);
    await manager.save(stepData);
    core.endGroup();

    // Step 2.5: Compare with Baselines
    core.startGroup('🔍 Step 2.5: Compare Screenshots with Baselines');
    stepData = await compareWithBaselines(stepData);
    await manager.save(stepData);
    core.endGroup();

    // Step 3: Upload Screenshots to Storage
    core.startGroup('☁️  Step 3: Upload Screenshots to Storage');
    stepData = await uploadToStorage(stepData);
    await manager.save(stepData);
    core.endGroup();

    // Step 4: Post Results to GitHub PR
    core.startGroup('💬 Step 4: Post Results to GitHub PR');
    stepData = await postResults(stepData);
    await manager.save(stepData);
    core.endGroup();

    // Step 5: Update Baselines (if configured)
    core.startGroup('🔄 Step 5: Update Baselines (Post-Merge)');
    stepData = await updateBaselines(stepData);
    await manager.save(stepData);
    core.endGroup();

    // Mark comment command as complete (if applicable)
    if (isCommentCommand && stepData.commandContext?.commentId) {
      await markCommandComplete(stepData.commandContext.commentId);
    }

    // Print summary
    const workflowDuration = Date.now() - workflowStartTime;
    core.info('\n' + '━'.repeat(60));
    core.info('✅ YoFix Visual Testing Completed Successfully');
    core.info(`⏱️  Total Duration: ${(workflowDuration / 1000).toFixed(2)}s`);
    core.info('━'.repeat(60));

    // Print step timings
    const timingSummary = await manager.getTimingSummary();
    if (timingSummary) {
      core.info('\n' + timingSummary);
    }

  } catch (error) {
    const workflowDuration = Date.now() - workflowStartTime;

    core.error('━'.repeat(60));
    core.error('❌ YoFix Visual Testing Failed');
    core.error(`⏱️  Duration before failure: ${(workflowDuration / 1000).toFixed(2)}s`);
    core.error('━'.repeat(60));

    // Handle error with centralized error handler
    errorHandler.handleError(error as Error, {
      severity: ErrorSeverity.CRITICAL,
      category: ErrorCategory.ORCHESTRATION,
      userAction: 'Review the error message and check your configuration',
      metadata: {
        workflowDuration,
        step: 'unknown'
      }
    });

    // Set GitHub Action as failed
    core.setFailed(`YoFix workflow failed: ${error instanceof Error ? error.message : String(error)}`);

    // Re-throw to ensure proper exit code
    throw error;
  }
}

// Execute main function
main().catch((error) => {
  // Final safety net
  console.error('Fatal error in YoFix workflow:', error);
  process.exit(1);
});
