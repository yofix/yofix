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
import { 
  initializeCoreServices, 
  finalizeCoreServices, 
  errorHandler, 
  ErrorCategory, 
  ErrorSeverity,
  config,
  getRequiredConfig,
  getBooleanConfig,
  getNumberConfig,
  Validators,
  deleteFile,
  parseTimeout
} from './core';
async function run(): Promise<void> {
  try {
    // Initialize core services first
    const githubToken = getRequiredConfig('github-token');
    initializeCoreServices(githubToken);
    
    // Check if this is a bot command
    const eventName = github.context.eventName;
    
    if (eventName === 'issue_comment') {
      await handleBotCommand();
    } else {
      // Otherwise, run as GitHub Action
      await runVisualTesting();
    }
  } catch (error) {
    await errorHandler.handleError(error as Error, {
      severity: ErrorSeverity.CRITICAL,
      category: ErrorCategory.UNKNOWN,
      location: 'main run function'
    });
    throw error;
  } finally {
    // Finalize and post summaries
    await finalizeCoreServices();
  }
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
    await errorHandler.handleError(error as Error, {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.UNKNOWN,
      userAction: 'Bot command execution',
      metadata: { eventName: github.context.eventName }
    });
    core.setFailed(`Bot error: ${error}`);
  }
}

/**
 * Run visual testing using browser-agent
 */
async function runVisualTesting(): Promise<void> {
  const startTime = Date.now();
  let outputDir: string | null = null;
  let prNumber = 0;
  let inputs: ActionInputs | null = null;

  try {
    core.info('🚀 YoFix - Browser Agent Powered Visual Testing');
    
    // Parse inputs
    inputs = parseInputs();
    
    // Validate critical inputs early
    const validationError = validateInputs(inputs);
    if (validationError) {
      throw new Error(validationError);
    }
    
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
    
    prNumber = parseInt(process.env.PR_NUMBER || github.context.payload.pull_request?.number?.toString() || '0');
    
    // Analyze route impact and get affected routes
    let affectedRoutes: string[] = ['/'];
    let impactTree: any = null;
    
    if (prNumber > 0) {
      try {
        // Create storage provider for route analyzer
        let storageProvider = null;
        try {
          const storageProviderName = config.get('storage-provider', { defaultValue: 'github' });
          if (storageProviderName !== 'github') {
            storageProvider = await StorageFactory.createFromInputs();
          }
        } catch (error) {
          core.debug(`Storage provider initialization failed: ${error}`);
        }
        
        const impactAnalyzer = new RouteImpactAnalyzer(inputs.githubToken, storageProvider);
        impactTree = await impactAnalyzer.analyzePRImpact(prNumber);
        
        // FIXED: Extract routes from component mappings FIRST
        // This is the primary source of truth for component changes
        if (impactTree.componentRouteMapping && impactTree.componentRouteMapping.size > 0) {
          const componentRoutes = new Set<string>();
          
          // Log component mappings for debugging
          core.info(`🎯 Component mappings found:`);
          for (const [component, routes] of impactTree.componentRouteMapping) {
            core.info(`  ${component} affects ${routes.length} routes:`);
            for (const route of routes) {
              // Use the actual route path from the mapping
              if (route.routePath) {
                core.info(`    - ${route.routePath} (in ${route.routeFile || 'unknown'})`);
                componentRoutes.add(route.routePath);
              }
            }
          }
          
          affectedRoutes = Array.from(componentRoutes);
          core.info(`📍 Found ${affectedRoutes.length} routes from component mappings`);
        }
        
        // [Temporarily disabled] Then add any directly affected routes (route file changes)
        // if (impactTree.affectedRoutes && impactTree.affectedRoutes.length > 0) {
        //   const directRoutes = impactTree.affectedRoutes
        //     .filter((impact: any) => impact.route && !affectedRoutes.includes(impact.route))
        //     .map((impact: any) => impact.route);
          
        //   if (directRoutes.length > 0) {
        //     affectedRoutes = [...affectedRoutes, ...directRoutes];
        //     core.info(`🎯 Found ${directRoutes.length} additional routes from direct changes`);
        //   }
        // }
        
        core.info(`📍 Total unique routes to test: ${affectedRoutes.length}`);
        
        if (affectedRoutes.length === 0) {
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
        await errorHandler.handleError(error as Error, {
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.ANALYSIS,
          userAction: 'Route impact analysis',
          recoverable: true,
          metadata: { prNumber }
        });
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
    // Use centralized error handler
    await errorHandler.handleError(error as Error, {
      severity: ErrorSeverity.CRITICAL,
      category: ErrorCategory.UNKNOWN,
      userAction: 'Visual testing workflow',
      metadata: {
        prNumber,
        previewUrl: inputs?.previewUrl,
        authMode: inputs?.authMode
      },
      tips: getErrorTips(error instanceof Error ? error.message : String(error))
    });
    
    core.setFailed(error instanceof Error ? error.message : String(error));
  } finally {
    // Cleanup using centralized file system
    if (outputDir) {
      const deleted = await deleteFile(outputDir);
      if (!deleted) {
        core.warning(`Failed to cleanup ${outputDir}`);
      }
    }
  }
}

/**
 * Parse GitHub Action inputs using centralized config
 */
function parseInputs(): ActionInputs {
  return {
    previewUrl: getRequiredConfig('preview-url'),
    firebaseCredentials: config.get('firebase-credentials'),
    storageBucket: config.get('firebase-storage-bucket'),
    githubToken: getRequiredConfig('github-token'),
    claudeApiKey: config.getSecret('claude-api-key'),
    firebaseProjectId: config.get('firebase-project-id'),
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
    enableAITestGeneration: getBooleanConfig('enable-ai-test-generation'),
    testRoutes: config.get('test-routes')
  };
}

/**
 * Validate inputs and provide helpful error messages
 */
function validateInputs(inputs: ActionInputs): string | null {
  // Check if authentication is configured but incomplete
  if ((inputs.authEmail && !inputs.authPassword) || (!inputs.authEmail && inputs.authPassword)) {
    return 'Authentication configuration incomplete: Both auth-email and auth-password must be provided together';
  }
  
  // Check storage configuration
  const storageProvider = config.get('storage-provider', { defaultValue: 'firebase' });
  if (storageProvider === 'firebase') {
    if (!inputs.firebaseCredentials && !config.get('s3-bucket')) {
      core.warning('No storage provider configured. Screenshots will not be persisted. Configure firebase-credentials or use S3 storage.');
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
  if (inputs.authMode && !['llm', 'selectors', 'smart'].includes(inputs.authMode)) {
    return `Invalid auth-mode: "${inputs.authMode}". Must be one of: llm, selectors, smart`;
  }
  
  // Validate timeout format using centralized validator
  const timeoutResult = Validators.isTimeout(inputs.testTimeout);
  if (!timeoutResult.valid) {
    return `Invalid test-timeout: ${timeoutResult.error}`;
  }
  
  return null;
}

/**
 * Get helpful tips based on error message
 */
function getErrorTips(errorMessage: string): string[] {
  const tips: string[] = [];
  
  if (errorMessage.includes('Claude API') || errorMessage.includes('authentication_error')) {
    tips.push('🔑 **API Key Issue**: Verify your Claude API key is valid and has sufficient credits');
    tips.push('📋 Set `CLAUDE_API_KEY` secret in your repository settings');
  }
  
  if (errorMessage.includes('Firebase') || errorMessage.includes('storage')) {
    tips.push('🔥 **Firebase Issue**: Check your Firebase credentials and storage bucket');
    tips.push('📋 Ensure `firebase-credentials` is base64 encoded correctly');
    tips.push('💡 Alternative: Use `storage-provider: s3` for AWS S3 storage');
  }
  
  if (errorMessage.includes('preview-url') || errorMessage.includes('accessible')) {
    tips.push('🌐 **Preview URL Issue**: The preview URL might not be accessible');
    tips.push('⏳ Wait for deployment to complete before running YoFix');
    tips.push('🔒 Check if the URL requires authentication');
  }
  
  if (errorMessage.includes('auth') || errorMessage.includes('login')) {
    tips.push('🔐 **Authentication Issue**: Check your test credentials');
    tips.push('🤖 Try `auth-mode: smart` if LLM auth fails');
    tips.push('📍 Verify `auth-login-url` points to the correct login page');
  }
  
  if (tips.length === 0) {
    tips.push('📖 Check the [documentation](https://github.com/yofix/yofix#configuration)');
    tips.push('🐛 [Report an issue](https://github.com/yofix/yofix/issues) if the problem persists');
  }
  
  return tips;
}

// Export for external usage
export { run };

// Main execution
if (require.main === module) {
  run().catch(error => {
    core.setFailed(error.message);
  });
}