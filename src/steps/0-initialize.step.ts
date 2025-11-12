/**
 * Step 0: Initialize
 *
 * Initializes the step data structure with configuration and context.
 * This must run before any other steps.
 *
 * Outputs:
 * - Initial StepData with all configuration loaded
 */

import * as core from '@actions/core';
import { GitHubServiceFactory } from '../core/github/GitHubServiceFactory';
import { getStepDataManager, executeStep, StepData } from './shared/StepDataManager';
import {
  initializeCoreServices,
  config,
  getRequiredConfig,
  getBooleanConfig,
  Validators
} from '../core';
import { ActionInputs, FirebaseConfig } from '../types';

/**
 * Parse GitHub Action inputs
 */
function parseInputs(): ActionInputs {
  return {
    previewUrl: getRequiredConfig('preview-url'),
    firebaseCredentials: config.get('firebase-credentials'),
    storageBucket: config.get('storage-bucket'),
    claudeApiKey: config.getSecret('claude-api-key'),
    claudeModel: getRequiredConfig('claude-model'),
    productionUrl: config.get('production-url'),
    firebaseTarget: config.get('firebase-target'),
    buildSystem: config.get('build-system', { defaultValue: 'vite' }) as 'vite' | 'react',
    testTimeout: config.get('test-timeout', { defaultValue: '30000' }),
    cleanupDays: config.get('cleanup-days', { defaultValue: '7' }),
    viewports: config.get('viewports', { defaultValue: '1920x1080,768x1024,375x667' }),
    maxRoutes: config.get('max-routes', { defaultValue: '10' }),
    authEmail: config.get('auth-email'),
    authPassword: config.get('auth-password'),
    authLoginUrl: config.get('auth-login-url'),
    authMode: config.get('auth-mode', { defaultValue: 'llm' }),
    enableSmartAuth: getBooleanConfig('enable-smart-auth'),
    mcpProvider: config.get('mcp-provider'),
    mcpOptions: config.get('mcp-options'),
    enableAINavigation: getBooleanConfig('enable-ai-navigation'),
    enableAITestGeneration: getBooleanConfig('enable-ai-test-generation')
  };
}

/**
 * Validate inputs
 */
function validateInputs(inputs: ActionInputs): string | null {
  // Check authentication configuration
  if ((inputs.authEmail && !inputs.authPassword) || (!inputs.authEmail && inputs.authPassword)) {
    return 'Authentication configuration incomplete: Both auth-email and auth-password must be provided together';
  }

  // Check storage configuration
  const storageProvider = config.get('storage-provider', { defaultValue: 'firebase' });
  if (storageProvider === 'firebase') {
    if (!inputs.firebaseCredentials && !config.get('s3-bucket')) {
      core.warning('No storage provider configured. Screenshots will not be persisted.');
    }
  }

  // Validate viewports format
  const viewportParts = inputs.viewports.split(',');
  for (const viewport of viewportParts) {
    if (!viewport.match(/^\d+x\d+$/)) {
      return `Invalid viewport format: "${viewport}". Expected format: "widthxheight" (e.g., "1920x1080")`;
    }
  }

  // Validate auth mode
  if (inputs.authMode && !['llm', 'selectors', 'smart', 'baseline'].includes(inputs.authMode)) {
    return `Invalid auth-mode: "${inputs.authMode}". Must be one of: llm, selectors, smart, baseline`;
  }

  // Validate timeout format
  const timeoutResult = Validators.isTimeout(inputs.testTimeout);
  if (!timeoutResult.valid) {
    return `Invalid test-timeout: ${timeoutResult.error}`;
  }

  return null;
}

/**
 * Main step execution
 */
export async function initialize(): Promise<StepData> {
  return executeStep('Initialize YoFix', async () => {
    // Initialize core services
    initializeCoreServices();

    // Parse and validate inputs
    const inputs = parseInputs();
    const validationError = validateInputs(inputs);
    if (validationError) {
      throw new Error(validationError);
    }

    core.info('🚀 YoFix - Step-based Visual Testing');

    // Configure GitHub service
    const githubToken = config.get('github-token');
    if (githubToken) {
      await GitHubServiceFactory.getService().configure({ token: githubToken });
    }

    // Get GitHub context
    const githubService = GitHubServiceFactory.getService();
    const context = githubService.getContext();
    const prNumber = githubService.getPRNumber();

    core.info('📋 GitHub Context:');
    core.info(`  Event Name: ${context.eventName}`);
    core.info(`  Repository: ${context.owner}/${context.repo}`);
    core.info(`  SHA: ${context.sha}`);
    core.info(`  Actor: ${context.actor}`);
    core.info(`  PR Number: ${prNumber || 'N/A'}`);

    // Validate PR context for pull_request events
    if (context.eventName === 'pull_request' && !prNumber) {
      throw new Error('Pull request event detected but no PR number found. This action requires a valid pull_request event.');
    }

    // Create Firebase config (matches StepData structure)
    const firebaseConfig = {
      projectId: 'auto-detect',
      target: inputs.firebaseTarget || 'default-target',
      buildSystem: inputs.buildSystem || 'vite',
      region: 'us-central1'
    };

    // Set production URL for baseline creation if provided
    if (inputs.productionUrl) {
      process.env.PRODUCTION_URL = inputs.productionUrl;
      core.info(`📍 Production URL set for baseline creation: ${inputs.productionUrl}`);
    }

    core.info(`📱 Testing preview URL: ${inputs.previewUrl}`);

    // Create initial step data
    const stepData: StepData = {
      previewUrl: inputs.previewUrl,
      productionUrl: inputs.productionUrl,
      prNumber: prNumber || 0,
      outputDir: '',
      githubContext: {
        owner: context.owner,
        repo: context.repo,
        sha: context.sha,
        eventName: context.eventName,
        actor: context.actor
      },
      firebaseConfig,
      metadata: {
        startTime: Date.now(),
        stepTimings: {}
      }
    };

    core.info('✅ Initialization complete');
    return stepData;
  });
}

/**
 * Entry point for standalone execution
 */
export async function main(): Promise<void> {
  try {
    const manager = getStepDataManager();
    await manager.initialize();

    const stepData = await initialize();
    await manager.save(stepData);

    core.info('✅ Step 0: Initialize completed successfully');
  } catch (error) {
    core.setFailed(`Step 0 failed: ${error}`);
    throw error;
  }
}
