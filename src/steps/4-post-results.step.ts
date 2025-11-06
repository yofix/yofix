/**
 * Step 4: Post Results
 *
 * Creates verification result summary and posts to GitHub PR.
 * Includes screenshots, timing data, and test results.
 *
 * Outputs:
 * - GitHub Action outputs (success, issues-found, etc.)
 * - PR comment with detailed results
 */

import * as core from '@actions/core';
import path from 'path';
import { PRReporter } from '../github/PRReporter';
import { getStepDataManager, executeStep, StepData } from './shared/StepDataManager';
import { VerificationResult, RouteAnalysisResult } from '../types';
import { ErrorSeverity, ErrorCategory, errorHandler, config } from '../core';
import { GitHubServiceFactory } from '../core/github/GitHubServiceFactory';

/**
 * Main step execution
 */
export async function postResults(stepData: StepData): Promise<StepData> {
  return executeStep('Post Results to PR', async () => {
    const { prNumber, previewUrl, routes, screenshots, firebaseConfig, metadata } = stepData;
    const internal = (stepData as any)._internal;

    if (!routes || !screenshots) {
      throw new Error('Missing routes or screenshots data. Run previous steps first.');
    }

    // Configure GitHub service with token (each step is a separate process)
    const githubToken = config.get('github-token');
    const github = GitHubServiceFactory.getService();
    if (githubToken) {
      await github.configure({ token: githubToken });
    }

    core.info(`📝 Preparing results for PR #${prNumber}`);

    // Create route analysis result
    const analysis: RouteAnalysisResult = {
      hasUIChanges: routes.affectedRoutes.length > 0,
      changedPaths: routes.affectedRoutes,
      components: routes.components,
      routes: routes.affectedRoutes,
      testSuggestions: routes.affectedRoutes.map(r => `Test route ${r} for visual regressions`),
      riskLevel: (routes.routesToTest?.sharedComponents?.size || 0) > 0 ? 'high' : 'medium'
    };

    // Extract screenshot result and metadata
    const screenshotResult = internal?.screenshotResult;
    const uploadedFiles = internal?.uploadedFiles || [];
    const storageUrl = internal?.storageUrl || '';
    // Handle screenshotMetadataMap as object (JSON deserialized)
    const screenshotMetadataMap = internal?.screenshotMetadataMap || {};

    if (!screenshotResult) {
      throw new Error('Screenshot result not found in step data');
    }

    // Calculate total duration
    const totalDuration = Date.now() - metadata.startTime;

    // Create verification result
    const verificationResult: VerificationResult = {
      status: screenshotResult.success ? 'success' : 'failure',
      firebaseConfig: {
        projectId: firebaseConfig.projectId,
        target: firebaseConfig.target,
        buildSystem: firebaseConfig.buildSystem as 'vite' | 'react',
        previewUrl,
        region: firebaseConfig.region
      },
      totalTests: screenshotResult.screenshots.length,
      passedTests: screenshotResult.screenshots.filter((r: any) => r.success !== false).length,
      failedTests: screenshotResult.screenshots.filter((r: any) => r.success === false).length,
      skippedTests: 0,
      duration: totalDuration,
      testResults: screenshotResult.screenshots.map((r: any) => {
        // Extract pathname from full URL for matching
        let routePath = r.route;
        if (routePath.startsWith('http://') || routePath.startsWith('https://')) {
          try {
            const url = new URL(routePath);
            routePath = url.pathname;
          } catch (error) {
            core.debug(`Failed to parse route URL: ${routePath}`);
          }
        }

        // Convert route path to sanitized filename format
        const sanitizedRoute = routePath
          .replace(/^\//, '')
          .replace(/\//g, '-')
          .toLowerCase();

        return {
          testId: `test-${r.route}`,
          testName: `Route Test: ${r.route}`,
          status: r.success !== false ? 'passed' : 'failed',
          duration: screenshotResult.totalDuration,
          screenshots: uploadedFiles
            .filter((f: any) => f.remotePath && f.remotePath.includes(sanitizedRoute))
            .map((f: any) => {
              // Retrieve original metadata (screenshotMetadataMap is an object, not a Map)
              const metadata = screenshotMetadataMap[f.localPath];
              const viewport = metadata?.viewport || { width: 0, height: 0, name: '' };

              return {
                name: `${routePath}-${viewport.width}x${viewport.height}.png`,
                path: f.localPath,
                viewport: viewport,
                timestamp: Date.now(),
                firebaseUrl: f.url || '',
                route: routePath
              };
            }),
          videos: [],
          errors: r.error ? [r.error] : [],
          consoleMessages: []
        };
      }),
      screenshotsUrl: storageUrl,
      summary: {
        componentsVerified: analysis.components,
        routesTested: analysis.routes,
        issuesFound: screenshotResult.errors?.map((e: any) => e.message) || []
      }
    };

    core.info(`📊 Verification Summary:`);
    core.info(`  Total tests: ${verificationResult.totalTests}`);
    core.info(`  Passed: ${verificationResult.passedTests}`);
    core.info(`  Failed: ${verificationResult.failedTests}`);
    core.info(`  Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    // Add timing summary to step data
    const timingSummary = await getStepDataManager().getTimingSummary();
    if (timingSummary) {
      core.info(`\n${timingSummary}`);
    }

    // Post to PR with timeout
    core.info('📤 Posting results to PR...');
    const reporter = new PRReporter();

    try {
      await Promise.race([
        reporter.postResults(verificationResult, prNumber.toString()),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('PR report posting timeout')), 30000)
        )
      ]);
      core.info(`✅ PR report posted successfully`);
    } catch (error) {
      core.warning(`Failed to post PR report: ${error}`);

      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.GITHUB,
        location: 'pr-reporter',
        recoverable: true
      });
    }

    // Set GitHub Action outputs
    core.setOutput('success', verificationResult.status === 'success');
    core.setOutput('issues-found', screenshotResult.errors?.length || 0);
    core.setOutput('critical-issues', 0);
    core.setOutput('warning-issues', 0);
    core.setOutput('total-tests', verificationResult.totalTests);
    core.setOutput('passed-tests', verificationResult.passedTests);
    core.setOutput('failed-tests', verificationResult.failedTests);
    core.setOutput('duration-ms', totalDuration);
    core.setOutput('duration-seconds', (totalDuration / 1000).toFixed(2));

    // Log final status
    if (verificationResult.status === 'success') {
      core.info('\n✅ All visual tests completed successfully!');
    } else {
      core.error('\n❌ Visual tests completed with errors');
    }

    core.info(`⏱️ Total execution time: ${(totalDuration / 1000).toFixed(2)}s`);

    return stepData;
  });
}

/**
 * Entry point for standalone execution
 */
export async function main(): Promise<void> {
  let hadError = false;
  let mainError: any = null;

  try {
    const manager = getStepDataManager();
    const stepData = await manager.load();
    await postResults(stepData);

    core.info('✅ Step 4: Post Results completed successfully');
  } catch (error) {
    hadError = true;
    mainError = error;
    core.error(`❌ Step 4 failed: ${error}`);

    // Add to error handler
    await errorHandler.handleError(error as Error, {
      severity: ErrorSeverity.CRITICAL,
      category: ErrorCategory.ORCHESTRATION,
      location: 'post-results',
      recoverable: false
    }).catch(() => {}); // Ignore if handleError throws
  } finally {
    // ALWAYS post error summary, regardless of success or failure
    core.info('📊 Posting error summary...');
    await errorHandler.postErrorSummary().catch((summaryError) => {
      core.warning(`Failed to post error summary: ${summaryError}`);
    });
  }

  // Fail the step if there was an error
  if (hadError) {
    core.setFailed(`Step 4 failed: ${mainError}`);
    throw mainError;
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
