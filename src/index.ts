import * as core from '@actions/core';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import * as github from '@actions/github';

import { TestGenerator } from './core/testing/TestGenerator';
import { VisualAnalyzer } from './core/analysis/VisualAnalyzer';
import { PRReporter } from './github/PRReporter';
import { ActionInputs, VerificationResult, FirebaseConfig, RouteAnalysisResult } from './types';
import { YoFixBot } from './bot/YoFixBot';
import { RouteImpactAnalyzer } from './core/analysis/RouteImpactAnalyzer';
import { StorageFactory } from './providers/storage/StorageFactory';
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
 * Handle bot commands from PR comments (enhanced with browser-agent)
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
 * Run visual testing using browser-agent
 */
async function runVisualTesting(): Promise<void> {
  const startTime = Date.now();
  let outputDir: string | null = null;

  try {
    core.info('🚀 YoFix - Browser Agent Powered Visual Testing');
    
    // Parse inputs
    const inputs = parseInputs();
    
    // Create temporary output directory
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yofix-'));
    
    // Create Firebase config from inputs
    const firebaseConfig: FirebaseConfig = {
      projectId: inputs.firebaseProjectId || 'default-project',
      target: inputs.firebaseTarget || 'default-target',
      buildSystem: inputs.buildSystem || 'vite',
      previewUrl: inputs.previewUrl,
      region: 'us-central1'
    };
    
    core.info(`📱 Testing preview URL: ${inputs.previewUrl}`);
    
    // Parse viewports
    const viewports = inputs.viewports.split(',').map(viewport => {
      const [width, height] = viewport.trim().split('x').map(Number);
      return { width, height, name: `${width}x${height}` };
    });
    
    const prNumber = parseInt(process.env.PR_NUMBER || github.context.payload.pull_request?.number?.toString() || '0');
    
    // Analyze route impact and get affected routes
    let affectedRoutes: string[] = ['/'];
    let impactTree: any = null;
    
    if (prNumber > 0) {
      try {
        // Create storage provider for route analyzer
        let storageProvider = null;
        try {
          const storageProviderName = core.getInput('storage-provider') || 'github';
          if (storageProviderName !== 'github') {
            storageProvider = await StorageFactory.createFromInputs();
          }
        } catch (error) {
          core.debug(`Storage provider initialization failed: ${error}`);
        }
        
        const impactAnalyzer = new RouteImpactAnalyzer(inputs.githubToken, storageProvider);
        impactTree = await impactAnalyzer.analyzePRImpact(prNumber);
        
        // Extract affected routes from the impact tree
        if (impactTree.affectedRoutes.length > 0) {
          affectedRoutes = impactTree.affectedRoutes.map((impact: any) => impact.route);
          core.info(`🎯 Found ${affectedRoutes.length} affected routes from PR changes`);
        } else {
          core.info('ℹ️ No routes affected by PR changes, testing homepage');
        }
        
        // Post route impact tree as a comment
        const impactMessage = impactAnalyzer.formatImpactTree(impactTree);
        const octokit = github.getOctokit(inputs.githubToken);
        await octokit.rest.issues.createComment({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          issue_number: prNumber,
          body: impactMessage
        });
        
        core.info('✅ Posted route impact tree to PR');
      } catch (error) {
        core.warning(`Failed to analyze route impact: ${error.message}`);
        core.warning('Falling back to testing homepage only');
      }
    }
    
    // Use the affected routes for testing
    const routes = affectedRoutes
    
    // Create route analysis result that matches expected interface
    const analysis: RouteAnalysisResult = {
      hasUIChanges: impactTree?.affectedRoutes.length > 0,
      changedPaths: routes,
      components: impactTree?.affectedRoutes.flatMap((r: any) => 
        [...r.directChanges, ...r.componentChanges].map((f: string) => 
          path.basename(f, path.extname(f))
        )
      ) || ['App'],
      routes: routes,
      testSuggestions: routes.map(r => `Test route ${r} for visual regressions`),
      riskLevel: impactTree?.sharedComponents.size > 0 ? 'high' : 'medium'
    };
    
    core.info(`🔍 Found ${analysis.routes.length} routes to test`);
    
    // Initialize browser-agent powered components
    const testRunner = new TestGenerator(firebaseConfig, viewports, inputs.claudeApiKey);
    const visualAnalyzer = new VisualAnalyzer(inputs.claudeApiKey, inputs.githubToken);
    
    // Run tests using browser-agent
    core.info('🤖 Running tests with Browser Agent...');
    const testResults = await testRunner.runTests(analysis);
    
    // Run visual analysis using browser-agent
    core.info('👁️ Running visual analysis with Browser Agent...');
    const scanResult = await visualAnalyzer.scan({
      prNumber: prNumber,
      routes: analysis.routes,
      viewports: viewports.map(v => `${v.width}x${v.height}`),
      options: {
        enableScreenshots: true,
        maxRetries: 3,
        timeout: 30000
      }
    });
    
    // Generate fixes for any issues found
    if (scanResult.issues && scanResult.issues.length > 0) {
      core.info(`🔧 Generating fixes for ${scanResult.issues.length} issues...`);
      const fixes = await visualAnalyzer.generateFixes(scanResult.issues);
      
      // Log fixes
      fixes.forEach(({ issue, fix }) => {
        core.info(`Fix for ${issue.type}: ${fix.substring(0, 100)}...`);
      });
    }
    
    // Create verification result
    const verificationResult: VerificationResult = {
      status: (testResults.every(r => r.success)) ? 'success' : 'failure',
      firebaseConfig,
      totalTests: testResults.length,
      passedTests: testResults.filter(r => r.success).length,
      failedTests: testResults.filter(r => !r.success).length,
      skippedTests: 0,
      duration: Date.now() - startTime,
      testResults: testResults.map(r => ({
        testId: `test-${r.route}`,
        testName: `Route Test: ${r.route}`,
        status: r.success ? 'passed' : 'failed',
        duration: r.duration,
        screenshots: r.screenshots.map((buf, i) => ({
          name: `screenshot-${i}.png`,
          path: `/tmp/screenshot-${i}.png`,
          viewport: viewports[0],
          timestamp: Date.now()
        })),
        videos: [],
        errors: r.error ? [r.error] : [],
        consoleMessages: []
      })),
      screenshotsUrl: 'https://storage.googleapis.com/yofix-screenshots/',
      summary: {
        componentsVerified: analysis.components,
        routesTested: analysis.routes,
        issuesFound: scanResult.issues?.map(i => i.description) || []
      }
    };
    
    // Report to PR
    const reporter = new PRReporter(inputs.githubToken);
    await reporter.postResults(verificationResult, prNumber.toString());
    
    // Set outputs
    core.setOutput('success', verificationResult.status === 'success');
    core.setOutput('issues-found', scanResult.issues?.length || 0);
    core.setOutput('critical-issues', scanResult.summary?.bySeverity?.critical || 0);
    core.setOutput('warning-issues', scanResult.summary?.bySeverity?.medium || 0);
    
    if (verificationResult.status === 'success') {
      core.info('✅ All visual tests passed!');
    } else {
      const criticalCount = scanResult.summary?.bySeverity?.critical || 0;
      const warningCount = scanResult.summary?.bySeverity?.medium || 0;
      
      if (criticalCount > 0) {
        core.setFailed(`❌ Found ${criticalCount} critical visual issues`);
      } else {
        core.warning(`⚠️ Found ${warningCount} visual warnings`);
      }
    }
    
    core.info(`⏱️ Total execution time: ${Date.now() - startTime}ms`);
    
  } catch (error) {
    core.error(`YoFix failed: ${error}`);
    core.setFailed(error instanceof Error ? error.message : String(error));
  } finally {
    // Cleanup
    if (outputDir) {
      try {
        await fs.rmdir(outputDir, { recursive: true });
      } catch (e) {
        core.warning(`Failed to cleanup ${outputDir}: ${e}`);
      }
    }
  }
}

/**
 * Parse GitHub Action inputs
 */
function parseInputs(): ActionInputs {
  const viewportsInput = core.getInput('viewports') || '1920x1080,768x1024,375x667';

  return {
    previewUrl: core.getInput('preview-url', { required: true }),
    firebaseCredentials: core.getInput('firebase-credentials'),
    storageBucket: core.getInput('firebase-storage-bucket'),
    githubToken: core.getInput('github-token', { required: true }),
    claudeApiKey: core.getInput('claude-api-key', { required: true }),
    firebaseProjectId: core.getInput('firebase-project-id'),
    firebaseTarget: core.getInput('firebase-target'),
    buildSystem: (core.getInput('build-system') as 'vite' | 'react') || 'vite',
    testTimeout: core.getInput('test-timeout') || '30000',
    cleanupDays: core.getInput('cleanup-days') || '7',
    viewports: viewportsInput,
    maxRoutes: core.getInput('max-routes') || '10',
    authEmail: core.getInput('auth-email'),
    authPassword: core.getInput('auth-password'),
    authLoginUrl: core.getInput('auth-login-url'),
    enableSmartAuth: core.getBooleanInput('enable-smart-auth'),
    mcpProvider: core.getInput('mcp-provider'),
    mcpOptions: core.getInput('mcp-options'),
    enableAINavigation: core.getBooleanInput('enable-ai-navigation'),
    enableAITestGeneration: core.getBooleanInput('enable-ai-test-generation'),
    testRoutes: core.getInput('test-routes')
  };
}

// Export for external usage
export { run };

// Main execution
if (require.main === module) {
  run().catch(error => {
    core.setFailed(error.message);
  });
}