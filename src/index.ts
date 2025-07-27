import * as core from '@actions/core';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import { FirebaseUrlHandler } from './providers/firebase/FirebaseUrlHandler';
import { ClaudeRouteAnalyzer, RouteAnalysis } from './core/analysis/RouteAnalyzer';
import { TestGenerator } from './core/testing/TestGenerator';
import { VisualRunner } from './core/testing/VisualRunner';
import { FirebaseStorageManager } from './providers/storage/FirebaseStorageManager';
import { PRReporter } from './github/PRReporter';
import { ActionInputs, VerificationResult, FirebaseStorageConfig, TestAction, RouteAnalysisResult } from './types';
import * as github from '@actions/github';
import { YoFixBot } from './bot/YoFixBot';

/**
 * Main orchestrator for YoFix
 */
async function run(): Promise<void> {
  // Check if this is a bot command
  const eventName = github.context.eventName;
  
  if (eventName === 'issue_comment') {
    await handleBotCommand();
    return;
  }
  
  // Otherwise, run as GitHub Action
  await runVisualTesting();
}

/**
 * Handle bot commands from PR comments
 */
async function handleBotCommand(): Promise<void> {
  try {
    const inputs = parseInputs();
    const bot = new YoFixBot(inputs.githubToken, inputs.claudeApiKey);
    await bot.handleIssueComment(github.context);
  } catch (error) {
    core.setFailed(`Bot error: ${error}`);
  }
}

/**
 * Run visual testing as GitHub Action
 */
async function runVisualTesting(): Promise<void> {
  const startTime = Date.now();
  let outputDir: string | null = null;
  let reporter: PRReporter | null = null;

  try {
    core.info('🚀 Starting Runtime PR Verification for React Firebase Apps');
    
    // Parse and validate inputs
    const inputs = parseInputs();
    core.info(`Inputs parsed - Preview URL: ${inputs.previewUrl}`);
    
    // Initialize PR reporter for status updates
    reporter = new PRReporter(inputs.githubToken);
    await reporter.postStatusUpdate('running', 'Initializing Firebase and React SPA verification...');
    
    // Create temporary working directory
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yofix-'));
    core.info(`Working directory: ${outputDir}`);

    // 1. Parse Firebase URL and wait for deployment
    core.info('📋 Step 1: Analyzing Firebase deployment...');
    const firebaseConfig = await FirebaseUrlHandler.createFirebaseConfig(
      inputs.previewUrl,
      inputs.githubToken,
      inputs.firebaseProjectId,
      inputs.firebaseTarget,
      inputs.buildSystem
    );
    
    core.setOutput('firebase-project', firebaseConfig.projectId);
    core.setOutput('firebase-target', firebaseConfig.target);
    core.setOutput('build-system', firebaseConfig.buildSystem);

    // 2. Analyze PR with Claude AI
    core.info('🧠 Step 2: Analyzing PR with Claude AI...');
    const claudeAnalyzer = new ClaudeRouteAnalyzer(inputs.claudeApiKey, inputs.githubToken);
    
    let routeAnalysis: RouteAnalysis | undefined;
    let analysis: RouteAnalysisResult;
    
    try {
      const { context } = github;
      const prNumber = context.payload.pull_request?.number;
      if (!prNumber) {
        throw new Error('No PR number found in context');
      }
      
      routeAnalysis = await claudeAnalyzer.analyzeRoutes(prNumber);
      core.info(`Claude identified ${routeAnalysis.routes.length} routes with ${routeAnalysis.confidence} confidence`);
      core.info(`Reasoning: ${routeAnalysis.reasoning}`);
      
      // Convert Claude analysis to our legacy format
      analysis = {
        hasUIChanges: true,
        changedPaths: [], // This will be populated by Claude analysis
        components: [],
        routes: routeAnalysis.routes,
        testSuggestions: [`Visual testing for ${routeAnalysis.changeType} changes`],
        riskLevel: routeAnalysis.confidence === 'high' ? 'low' : routeAnalysis.confidence === 'medium' ? 'medium' : 'high'
      };
    } catch (error) {
      core.warning(`Claude analysis failed: ${error}. Proceeding with basic testing...`);
      
      // Fallback to basic analysis
      analysis = {
        hasUIChanges: true,
        changedPaths: [],
        components: [],
        routes: ['/'],
        testSuggestions: ['Basic React SPA verification'],
        riskLevel: 'medium'
      };
    }

    // Early exit if no UI changes detected
    if (!analysis.hasUIChanges && analysis.components.length === 0 && analysis.routes.length === 0) {
      core.info('No UI changes detected, skipping visual verification');
      await reporter.postStatusUpdate('skipped', 'No UI changes detected in this PR. Visual verification skipped.');
      core.setOutput('status', 'skipped');
      return;
    }

    // 3. Generate tests based on analysis
    core.info('🧪 Step 3: Generating React SPA tests...');
    const viewports = TestGenerator.parseViewports(inputs.viewports);
    const testGenerator = new TestGenerator(
      firebaseConfig, 
      viewports, 
      inputs.claudeApiKey,
      inputs.enableAITestGeneration
    );
    const tests = await testGenerator.generateTests(analysis);
    
    if (tests.length === 0) {
      throw new Error('No tests generated from route analysis');
    }
    
    core.info(`Generated ${tests.length} tests for React SPA verification`);

    // 4. Run visual tests
    core.info('🎭 Step 4: Running visual tests...');
    const testTimeoutMs = parseTimeout(inputs.testTimeout);
    const runner = new VisualRunner(firebaseConfig, outputDir, testTimeoutMs);
    
    // Set up authentication if credentials provided
    if (inputs.authEmail && inputs.authPassword) {
      core.info('🔐 Authentication credentials provided, enabling login support');
      const { AuthHandler } = await import('./github/AuthHandler');
      const authHandler = new AuthHandler({
        loginUrl: inputs.authLoginUrl || '/login/password',
        email: inputs.authEmail,
        password: inputs.authPassword
      }, {
        claudeApiKey: inputs.claudeApiKey,
        forceSmartMode: inputs.enableSmartAuth || process.env.YOFIX_SMART_AUTH === 'true'
      });
      runner.setAuthHandler(authHandler);
    }
    
    await runner.initialize();
    const testResults = await runner.runTests(tests);
    await runner.cleanup();

    // 5. Upload results to Firebase Storage
    core.info('☁️ Step 5: Uploading results to Firebase Storage...');
    const storageConfig = FirebaseStorageManager.createDefaultConfig(inputs.storageBucket);
    const storageManager = new FirebaseStorageManager(
      firebaseConfig,
      storageConfig,
      inputs.firebaseCredentials
    );

    // Upload screenshots and videos
    const screenshots = testResults.flatMap(r => r.screenshots);
    const videos = testResults.flatMap(r => r.videos);
    
    const uploadedScreenshots = await storageManager.uploadScreenshots(screenshots);
    const uploadedVideos = await storageManager.uploadVideos(videos);
    
    // Debug: Log screenshot upload results
    core.info(`Uploaded ${uploadedScreenshots.length} screenshots`);
    const screenshotsWithUrls = uploadedScreenshots.filter(s => s.firebaseUrl);
    core.info(`Screenshots with Firebase URLs: ${screenshotsWithUrls.length}`);
    
    // Update test results with uploaded screenshots that have Firebase URLs
    const updatedTestResults = testResults.map(testResult => {
      const updatedScreenshots = testResult.screenshots.map(screenshot => {
        const uploaded = uploadedScreenshots.find(s => s.path === screenshot.path);
        return uploaded || screenshot;
      });
      
      const updatedVideos = testResult.videos.map(video => {
        const uploaded = uploadedVideos.find(v => v.path === video.path);
        return uploaded || video;
      });
      
      return {
        ...testResult,
        screenshots: updatedScreenshots,
        videos: updatedVideos
      };
    });
    
    // Upload summary
    const summaryUrl = await storageManager.uploadSummary(
      uploadedScreenshots, 
      uploadedVideos, 
      updatedTestResults
    );

    // Start cleanup of old artifacts (non-blocking)
    const cleanupDays = parseInt(inputs.cleanupDays, 10);
    storageManager.cleanupOldArtifacts(cleanupDays).catch(error => 
      core.warning(`Background cleanup failed: ${error}`)
    );

    // 6. Generate verification result
    const passedTests = updatedTestResults.filter(r => r.status === 'passed').length;
    const failedTests = updatedTestResults.filter(r => r.status === 'failed').length;
    const skippedTests = updatedTestResults.filter(r => r.status === 'skipped').length;
    
    const verificationResult: VerificationResult = {
      status: failedTests === 0 ? 'success' : (passedTests > 0 ? 'partial' : 'failure'),
      firebaseConfig,
      totalTests: updatedTestResults.length,
      passedTests,
      failedTests,
      skippedTests,
      duration: Date.now() - startTime,
      testResults: updatedTestResults,
      screenshotsUrl: summaryUrl || storageManager.generateStorageConsoleUrl(),
      summary: {
        componentsVerified: analysis.components,
        routesTested: analysis.routes,
        issuesFound: updatedTestResults.flatMap(r => r.errors).slice(0, 10)
      }
    };

    // 7. Report results to PR
    core.info('📝 Step 6: Posting results to PR...');
    const storageConsoleUrl = storageManager.generateStorageConsoleUrl();
    await reporter.postResults(verificationResult, storageConsoleUrl);

    // 8. Generate auth feedback if applicable
    if (inputs.authEmail && inputs.authPassword) {
      const { authMonitor } = await import('./monitoring/AuthMetrics');
      const metrics = authMonitor.getMetrics();
      
      if (metrics.totalAttempts > 0) {
        core.info('📊 Step 7: Authentication metrics...');
        const feedbackReport = authMonitor.generateFeedbackReport();
        core.info(feedbackReport);
        
        // Add metrics to outputs
        core.setOutput('auth-success-rate', metrics.successRate);
        core.setOutput('auth-method-used', metrics.methodBreakdown.smart.attempts > 0 ? 'smart' : 'selector');
      }
    }

    // Set outputs
    core.setOutput('status', verificationResult.status);
    core.setOutput('screenshots-url', verificationResult.screenshotsUrl);
    core.setOutput('test-results', JSON.stringify({
      total: testResults.length,
      passed: passedTests,
      failed: failedTests,
      skipped: skippedTests,
      duration: verificationResult.duration
    }));

    // Final status
    const statusMessage = `✅ Verification completed: ${passedTests}/${testResults.length} tests passed`;
    core.info(statusMessage);
    
    if (verificationResult.status === 'failure') {
      core.setFailed(`Visual verification failed: ${failedTests} tests failed`);
    } else if (verificationResult.status === 'partial') {
      core.warning(`Partial success: ${failedTests} tests failed, ${passedTests} passed`);
    }

  } catch (error) {
    const errorMessage = `Runtime PR Verification failed: ${error}`;
    core.error(errorMessage);
    
    // Try to post error status to PR
    if (reporter) {
      try {
        await reporter.postStatusUpdate('failed', errorMessage);
      } catch (reportError) {
        core.warning(`Failed to post error status: ${reportError}`);
      }
    }
    
    core.setOutput('status', 'failure');
    core.setFailed(errorMessage);
  } finally {
    // Cleanup temporary directory
    if (outputDir) {
      try {
        await fs.rm(outputDir, { recursive: true, force: true });
        core.info('Temporary directory cleaned up');
      } catch (cleanupError) {
        core.warning(`Failed to cleanup temporary directory: ${cleanupError}`);
      }
    }
  }
}

/**
 * Parse and validate action inputs
 */
function parseInputs(): ActionInputs {
  const inputs: ActionInputs = {
    previewUrl: core.getInput('preview-url', { required: true }),
    firebaseCredentials: core.getInput('firebase-credentials', { required: true }),
    storageBucket: core.getInput('storage-bucket', { required: true }),
    githubToken: core.getInput('github-token', { required: true }),
    claudeApiKey: core.getInput('claude-api-key', { required: true }),
    firebaseProjectId: core.getInput('firebase-project-id') || undefined,
    firebaseTarget: core.getInput('firebase-target') || undefined,
    buildSystem: (core.getInput('build-system') as 'vite' | 'react') || undefined,
    testTimeout: core.getInput('test-timeout') || '5m',
    cleanupDays: core.getInput('cleanup-days') || '30',
    viewports: core.getInput('viewports') || '1920x1080,768x1024,375x667',
    maxRoutes: core.getInput('max-routes') || '10',
    authEmail: core.getInput('auth-email') || undefined,
    authPassword: core.getInput('auth-password') || undefined,
    authLoginUrl: core.getInput('auth-login-url') || '/login/password',
    enableSmartAuth: core.getInput('enable-smart-auth') === 'true',
    mcpProvider: core.getInput('mcp-provider') || 'built-in',
    mcpOptions: core.getInput('mcp-options') || '{}',
    enableAINavigation: core.getInput('enable-ai-navigation') === 'true',
    enableAITestGeneration: core.getInput('enable-ai-test-generation') === 'true',
    testRoutes: core.getInput('test-routes') || ''
  };

  // Validate required inputs
  if (!inputs.previewUrl.startsWith('https://')) {
    throw new Error(`Invalid preview URL: ${inputs.previewUrl}`);
  }

  if (!inputs.storageBucket) {
    throw new Error('Firebase Storage bucket name is required');
  }

  // Validate Firebase credentials
  try {
    const decoded = Buffer.from(inputs.firebaseCredentials, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(decoded);
    if (!serviceAccount.project_id || !serviceAccount.private_key) {
      throw new Error('Invalid service account format');
    }
  } catch (error) {
    throw new Error(`Invalid Firebase credentials: ${error}`);
  }

  return inputs;
}

/**
 * Parse timeout string to milliseconds
 */
function parseTimeout(timeoutStr: string): number {
  const match = timeoutStr.match(/^(\d+)([smh]?)$/);
  if (!match) {
    core.warning(`Invalid timeout format: ${timeoutStr}. Using default 5 minutes.`);
    return 5 * 60 * 1000;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2] || 's';

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      return value * 1000;
  }
}

// Run the action
if (require.main === module) {
  run().catch(error => {
    core.setFailed(`Unhandled error: ${error}`);
    process.exit(1);
  });
}

export { run };