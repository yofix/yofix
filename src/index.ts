import * as core from '@actions/core';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
// import * as github from '@actions/github'; // Removed - now using GitHubServiceFactory

import { TestGenerator } from './core/testing/TestGenerator';
import { DeterministicVisualAnalyzer } from './core/deterministic/visual/DeterministicVisualAnalyzer';
import { ActionInputs, VerificationResult, FirebaseConfig, RouteAnalysisResult } from './types';
import { YoFixBot } from './bot/YoFixBot';
import { RouteImpactAnalyzer } from './core/analysis/RouteImpactAnalyzer';
import { StorageFactory } from './providers/storage/StorageFactory';
import { GitHubServiceFactory } from './core/github/GitHubServiceFactory';
import { 
  initializeCoreServices, 
  finalizeCoreServices, 
  errorHandler, 
  ErrorCategory, 
  ErrorSeverity,
  config,
  getRequiredConfig,
  getBooleanConfig,
  Validators,
  deleteFile,
  getGitHubCommentEngine
} from './core';
import { defaultConfig } from './config/default.config';
import { GitHubCacheManager } from './github/GitHubCacheManager';
import { ParallelTestExecutor } from './core/parallel/ParallelTestExecutor';

async function run(): Promise<void> {
  // Add global unhandled promise rejection handler
  process.on('unhandledRejection', (reason, promise) => {
    core.error(`Unhandled Promise Rejection at: ${promise}, reason: ${reason}`);
    // Log additional context if available
    if (reason instanceof Error) {
      core.error(`Error stack: ${reason.stack}`);
      
      // Check if it's a known file not found error we can safely ignore
      const message = reason.message || '';
      if (message.includes('File not found:') && message.includes('baselines/')) {
        core.info('ℹ️ Baseline file not found - this is expected for new routes or first-time runs');
        return; // Don't exit the process for missing baseline files
      }
    }
    
    // For other unhandled rejections, set failed status
    process.exitCode = 1;
  });
  
  try {
    // Initialize core services first
    initializeCoreServices();
    
    // Configure GitHub service with token
    const githubToken = config.get('github-token');
    if (githubToken) {
      await GitHubServiceFactory.getService().configure({ token: githubToken });
    }
    
    // Check if this is a bot command
    const eventName = GitHubServiceFactory.getService().getContext().eventName;
    
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
    core.info('📊 Finalizing core services...');
    const finalizeStartTime = Date.now();
    await finalizeCoreServices();
    core.info(`✅ Core services finalized in ${Date.now() - finalizeStartTime}ms`);
  }
}

/**
 * Handle bot commands from PR comments (enhanced with browser-agent)
 */
async function handleBotCommand(): Promise<void> {
  try {
    const inputs = parseInputs();
    const bot = new YoFixBot(inputs.claudeApiKey);
    await bot.handleIssueComment(GitHubServiceFactory.getService().getContext());
  } catch (error) {
    await errorHandler.handleError(error as Error, {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.UNKNOWN,
      userAction: 'Bot command execution',
      metadata: { eventName: GitHubServiceFactory.getService().getContext().eventName }
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
    
    // Check execution mode
    const mode = config.get('mode', { defaultValue: 'test' });
    
    // Handle route discovery mode
    if (mode === 'discover-routes') {
      await handleRouteDiscovery(inputs);
      return;
    }
    
    // Handle baseline generation mode
    if (mode === 'baseline-generation') {
      await handleBaselineGeneration(inputs);
      return;
    }
    
    // Set environment variables for baseline creation
    if (inputs.productionUrl) {
      process.env.PRODUCTION_URL = inputs.productionUrl;
      core.info(`📍 Production URL set for baseline creation: ${inputs.productionUrl}`);
    }
    
    // Validate critical inputs early
    const validationError = validateInputs(inputs);
    if (validationError) {
      throw new Error(validationError);
    }
    
    // Create temporary output directory
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yofix-'));
    
    // Create Firebase config from inputs (project ID will be auto-detected from credentials)
    const firebaseConfig: FirebaseConfig = {
      projectId: 'auto-detect', // Will be replaced by FirebaseStorageManager
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
    
    // Get PR number from GitHub context
    const githubService = GitHubServiceFactory.getService();
    console.log(`Using GitHub service: ${githubService.constructor.name}`);
    const context = githubService.getContext();
    prNumber = githubService.getPRNumber();
    
    // Log GitHub context for debugging
    core.info('📋 GitHub Context:');
    core.info(`  Event Name: ${context.eventName}`);
    core.info(`  Repository: ${context.owner}/${context.repo}`);
    core.info(`  SHA: ${context.sha}`);
    core.info(`  Actor: ${context.actor}`);
    core.info(`  PR Number: ${prNumber}`);
    
    // Fail if not in a PR context when it's expected
    if (!prNumber && context.eventName === 'pull_request') {
      throw new Error('❌ No PR number found in pull_request event. Check GitHub event payload.');
    }
    
    // For pull_request events, we must have a PR number
    if (context.eventName === 'pull_request' && !prNumber) {
      throw new Error('❌ Pull request event detected but no PR number found. This action requires a valid pull_request event.');
    }
    
    if (prNumber > 0) {
      core.info(`✅ PR Number detected: ${prNumber}`);
      
      // Store preview URL in cache for bot to access later
      const cache = GitHubCacheManager.getInstance();
      
      await cache.setPRPreviewUrl(context.owner, context.repo, prNumber, inputs.previewUrl);
      core.info(`Cached preview URL for PR #${prNumber}: ${inputs.previewUrl}`);
    } else {
      core.warning('⚠️ No PR number detected. Running in non-PR mode. Route analysis will be skipped.');
    }
    
    // Analyze route impact and get affected routes
    let affectedRoutes: string[] = [];
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
        
        const impactAnalyzer = new RouteImpactAnalyzer(storageProvider, inputs.previewUrl);
        
        // Add timeout to route analysis to prevent hanging
        core.info('⏱️ Starting route analysis with 60s timeout...');
        const routeAnalysisStartTime = Date.now();
        
        impactTree = await Promise.race([
          impactAnalyzer.analyzePRImpact(prNumber),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Route analysis timeout')), 60000)
          )
        ]);
        
        core.info(`✅ Route analysis completed in ${Date.now() - routeAnalysisStartTime}ms`);
        
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
        if (impactTree.affectedRoutes && impactTree.affectedRoutes.length > 0) {
          const directRoutes = impactTree.affectedRoutes
            .filter((impact: any) => impact.route && !affectedRoutes.includes(impact.route))
            .map((impact: any) => impact.route); // Add unique routes
          
          if (directRoutes.length > 0) {
            affectedRoutes = [...affectedRoutes, ...directRoutes]; 
            core.info(`🎯 Found ${directRoutes.length} additional routes from direct changes`);
          }
        }
        
        core.info(`📍 Total unique routes to test: ${affectedRoutes.length}`);
        core.info(`📍 Affected routes: ${affectedRoutes.join(', ')}`);
        
        if (affectedRoutes.length === 0) {
          core.info('ℹ️ No routes affected by PR changes, testing homepage');
          affectedRoutes = ['/'];
        }
        
        // Post route impact tree as a comment with timeout
        const impactMessage = impactAnalyzer.formatImpactTree(impactTree);
        const githubService = GitHubServiceFactory.getService();
        
        try {
          await Promise.race([
            githubService.createComment(impactMessage),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('GitHub comment timeout')), 15000)
            )
          ]);
          core.info('✅ Posted route impact tree to PR');
        } catch (error) {
          core.warning(`Failed to post impact tree to PR: ${error}`);
          // Continue execution
        }
      } catch (error) {
        await errorHandler.handleError(error as Error, {
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.ANALYSIS,
          userAction: 'Route impact analysis',
          recoverable: true,
          metadata: { prNumber }
        });
        core.warning('Falling back to testing homepage only');
        affectedRoutes = ['/'];
      }
    }
    
    // If no PR number or no routes found, default to homepage
    if (affectedRoutes.length === 0) {
      core.info('ℹ️ No specific routes identified, defaulting to homepage');
      affectedRoutes = ['/'];
    }
    
    // Use the affected routes for testing
    const routes = affectedRoutes
    
    // Check if parallel execution is enabled
    const parallelExecution = getBooleanConfig('parallel-execution');
    const parallelChunksStr = config.get('parallel-chunks', { defaultValue: '' });
    
    if (parallelExecution && parallelChunksStr) {
      await runParallelTests(inputs, firebaseConfig, viewports, routes, parallelChunksStr);
      return;
    }
    
    // Extract unique components from impact tree
    let components: string[] = ['App']; // Default fallback
    
    if (impactTree) {
      const allComponents = new Set<string>();
      
      // Get components from affected routes
      if (impactTree.affectedRoutes && impactTree.affectedRoutes.length > 0) {
        for (const route of impactTree.affectedRoutes) {
          // Add direct changes (files that define routes)
          if (route.directChanges) {
            route.directChanges.forEach((file: string) => {
              const componentName = path.basename(file, path.extname(file));
              if (componentName && componentName !== 'index') {
                allComponents.add(componentName);
              }
            });
          }
          
          // Add component changes (files that affect routes)
          if (route.componentChanges) {
            route.componentChanges.forEach((file: string) => {
              const componentName = path.basename(file, path.extname(file));
              if (componentName && componentName !== 'index') {
                allComponents.add(componentName);
              }
            });
          }
        }
      }
      
      // Get components from component route mapping
      if (impactTree.componentRouteMapping && impactTree.componentRouteMapping.size > 0) {
        for (const [componentFile] of impactTree.componentRouteMapping) {
          const componentName = path.basename(componentFile, path.extname(componentFile));
          if (componentName && componentName !== 'index') {
            allComponents.add(componentName);
          }
        }
      }
      
      if (allComponents.size > 0) {
        components = Array.from(allComponents).slice(0, 10); // Limit to avoid spam
      }
    }
    
    core.info(`📦 Found ${components.length} components: ${components.join(', ')}`);
    
    // Create route analysis result that matches expected interface
    const analysis: RouteAnalysisResult = {
      hasUIChanges: (impactTree?.affectedRoutes?.length || 0) > 0 || (impactTree?.componentRouteMapping?.size || 0) > 0,
      changedPaths: routes,
      components: components,
      routes: routes,
      testSuggestions: routes.map(r => `Test route ${r} for visual regressions`),
      riskLevel: (impactTree?.sharedComponents?.size || 0) > 0 ? 'high' : 'medium'
    };
    
    core.info(`🔍 Found ${analysis.routes.length} routes to test`);
    
    // Initialize test runner (uses hybrid approach: LLM auth + deterministic testing)
    const testRunner = new TestGenerator(firebaseConfig, viewports, inputs.claudeApiKey);
    
    // Run tests using browser-agent
    core.info('🤖 Running tests with Browser Agent...');
    const testResults = await testRunner.runTests(analysis);
    
    // Get shared browser context if available
    const sharedBrowserContext = testRunner.getSharedBrowserContext();
    core.info(`Shared browser context available: ${!!sharedBrowserContext}`);
    
    // Initialize scan result from test results (avoid duplicate scanning)
    let scanResult: any = {
      issues: [],
      summary: {
        totalIssues: 0,
        byType: {},
        bySeverity: { critical: 0, medium: 0, low: 0 }
      }
    };
    
    // Check if we actually have screenshots from the test results
    const hasScreenshots = testResults.some(r => r.screenshots && r.screenshots.length > 0);
    core.info(`Test results contain screenshots: ${hasScreenshots}`);
    
    // Only run separate visual analysis if we don't have screenshots from tests
    // (i.e., when tests failed or didn't capture screenshots)
    if (!hasScreenshots) {
      core.info('👁️ Running separate deterministic visual analysis...');
      const useLLMAnalysis = getBooleanConfig('enable-llm-visual-analysis');
      
      // Create deterministic analyzer
      const deterministicAnalyzer = new DeterministicVisualAnalyzer(
        inputs.previewUrl,
        useLLMAnalysis ? inputs.claudeApiKey : undefined,
      );
      
      scanResult = await deterministicAnalyzer.scan({
        prNumber: prNumber,
        routes: analysis.routes,
        viewports: viewports.map(v => `${v.width}x${v.height}`),
        useLLMAnalysis: useLLMAnalysis
      });
    } else {
      core.info('✅ Visual analysis already performed during route testing');
      // Extract issues from test results
      for (const result of testResults) {
        if (result.issues && result.issues.length > 0) {
          scanResult.issues.push(...result.issues.map(issue => ({
            ...issue,
            route: result.route
          })));
        }
      }
      scanResult.summary.totalIssues = scanResult.issues.length;
    }
    
    // Generate fixes for any issues found
    if (scanResult.issues && scanResult.issues.length > 0) {
      core.info(`🔧 Found ${scanResult.issues.length} issues`);
      // Fix generation would happen here if needed
      // Currently skipped as it requires a separate analyzer instance
    }
    
    // Save screenshots to disk and prepare for upload
    const allScreenshots = [];
    for (const result of testResults) {
      for (const [screenshotIndex, screenshotBuffer] of result.screenshots.entries()) {
        // Extract the path from the actual URL where screenshot was taken
        let urlPath = result.route;
        if (result.screenshotUrls && result.screenshotUrls[screenshotIndex]) {
          try {
            const actualUrl = new URL(result.screenshotUrls[screenshotIndex]);
            urlPath = actualUrl.pathname || result.route;
          } catch (e) {
            // If URL parsing fails, use the original route
            urlPath = result.route;
          }
        }
        
        // Create filename with actual URL path
        const sanitizedPath = urlPath.replace(/\//g, '-').replace(/^-+|-+$/g, '') || 'root';
        const wasRedirected = result.actualUrl && !result.actualUrl.includes(result.route);
        const redirectSuffix = wasRedirected ? '_redirected' : '';
        const filename = `${sanitizedPath}${redirectSuffix}_viewport-${screenshotIndex}.png`;
        const screenshotPath = path.join(outputDir!, filename);
        
        // Save screenshot to disk
        await fs.writeFile(screenshotPath, screenshotBuffer);
        
        // Get baseline comparison data if available
        const viewport = viewports[screenshotIndex % viewports.length];
        let baselineData = undefined;
        let comparisonData = undefined;
        
        // Check if we have pixel diff data for this viewport
        if (result.pixelDiffs) {
          const pixelDiff = result.pixelDiffs.find(pd => 
            pd.viewport.width === viewport.width && pd.viewport.height === viewport.height
          );
          
          if (pixelDiff) {
            comparisonData = {
              hasDifference: pixelDiff.diffPercentage > 0.1, // 0.1% threshold
              diffPercentage: pixelDiff.diffPercentage,
              status: pixelDiff.diffPercentage === 0 ? 'new' : 
                     pixelDiff.diffPercentage > 0.1 ? 'changed' : 'unchanged',
              issues: result.issues?.filter(issue => issue.type === 'visual-regression') || []
            };
            
            // Save diff image to disk if available
            if (pixelDiff.diffImage) {
              const diffFilename = `${sanitizedPath}${redirectSuffix}_diff-${screenshotIndex}.png`;
              const diffPath = path.join(outputDir!, diffFilename);
              await fs.writeFile(diffPath, pixelDiff.diffImage);
              
              // Store diff image path for later upload
              (comparisonData as any).diffImagePath = diffPath;
              (comparisonData as any).diffImageName = diffFilename;
            }
          }
        } else if (result.issues?.some(i => i.type === 'visual-regression')) {
          // If we have visual regression issues but no pixel diff data, it's likely a new baseline
          comparisonData = {
            hasDifference: false,
            diffPercentage: 0,
            status: 'new',
            issues: result.issues?.filter(issue => issue.type !== 'visual-regression') || []
          };
        }

        allScreenshots.push({
          name: filename,
          path: screenshotPath,
          viewport,
          timestamp: Date.now(),
          route: result.route,
          actualUrl: result.screenshotUrls?.[screenshotIndex] || result.actualUrl,
          baseline: baselineData,
          comparison: comparisonData
        });
      }
    }
    
    // Upload screenshots to Firebase if configured
    let uploadedScreenshots = allScreenshots;
    let screenshotsUrl = ''; // Will be set after upload or constructed from bucket
    
    if (inputs.firebaseCredentials && inputs.storageBucket) {
      try {
        core.info('📤 Uploading screenshots to Firebase Storage...');
        core.info(`  Storage Bucket: ${inputs.storageBucket}`);
        core.info(`  Number of screenshots: ${allScreenshots.length}`);
        
        // Check if firebaseCredentials is a file path for testing
        let credentialsBase64 = inputs.firebaseCredentials;
        if (inputs.firebaseCredentials.endsWith('.json')) {
          try {
            const credentialsContent = await fs.readFile(inputs.firebaseCredentials, 'utf-8');
            credentialsBase64 = Buffer.from(credentialsContent).toString('base64');
            core.info('  Using Firebase credentials from file');
          } catch (error) {
            core.debug(`Not a file path, treating as base64: ${error}`);
          }
        }
        
        const { FirebaseStorageManager } = await import('./providers/storage/FirebaseStorageManager');
        
        const storageManager = FirebaseStorageManager.getInstance(
          firebaseConfig,
          {
            bucket: inputs.storageBucket,
            basePath: defaultConfig.storage.basePath,
            signedUrlExpiry: defaultConfig.storage.providers.firebase.signedUrlExpiryHours * 60 * 60 * 1000
          },
          credentialsBase64
        );
        
        uploadedScreenshots = await storageManager.uploadScreenshots(allScreenshots);
        
        // Upload diff images separately using batchUpload
        const diffFilesToUpload: Array<{ localPath: string, remotePath: string, contentType: string }> = [];
        const diffScreenshotMap = new Map<string, any>();
        
        for (const screenshot of uploadedScreenshots) {
          if (screenshot.comparison && (screenshot.comparison as any).diffImagePath) {
            const diffImagePath = (screenshot.comparison as any).diffImagePath;
            const diffImageName = (screenshot.comparison as any).diffImageName;
            
            diffFilesToUpload.push({
              localPath: diffImagePath,
              remotePath: diffImageName,
              contentType: 'image/png'
            });
            
            diffScreenshotMap.set(diffImageName, screenshot);
          }
        }
        
        if (diffFilesToUpload.length > 0) {
          try {
            core.info(`📊 Uploading ${diffFilesToUpload.length} diff images...`);
            const diffUrls = await storageManager.batchUpload(diffFilesToUpload);
            
            // Update comparison data with diff URLs
            diffUrls.forEach((url, index) => {
              if (url) {
                const diffFile = diffFilesToUpload[index];
                const screenshot = diffScreenshotMap.get(diffFile.remotePath);
                if (screenshot?.comparison) {
                  screenshot.comparison.diffImageUrl = url;
                  core.info(`  📊 Diff uploaded: ${diffFile.remotePath}`);
                }
              }
            });
          } catch (error) {
            core.warning(`Failed to upload diff images: ${error}`);
          }
        }
        
        // Log uploaded URLs
        core.info('✅ Screenshots uploaded successfully:');
        let uploadedCount = 0;
        for (const screenshot of uploadedScreenshots) {
          if (screenshot.firebaseUrl) {
            core.info(`  📸 ${screenshot.name}: ${screenshot.firebaseUrl}`);
            uploadedCount++;
          }
        }
        core.info(`  Total uploaded: ${uploadedCount}/${allScreenshots.length}`);
        
        // Get storage console URL
        screenshotsUrl = storageManager.generateStorageConsoleUrl();
        core.info(`\n🔗 View all screenshots in Firebase Console: ${screenshotsUrl}`);
        
      } catch (error) {
        core.warning(`Failed to upload screenshots to Firebase: ${error}`);
        core.warning('Screenshots are saved locally but not uploaded to cloud storage');
        core.debug(`Firebase credentials present: ${!!inputs.firebaseCredentials}`);
        core.debug(`Storage bucket: ${inputs.storageBucket}`);
      }
    } else {
      core.warning('Firebase storage not configured. Screenshots saved locally only.');
      core.warning(`Firebase credentials present: ${!!inputs.firebaseCredentials}`);
      core.warning(`Storage bucket configured: ${!!inputs.storageBucket}`);
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
        screenshots: uploadedScreenshots
          .filter(s => s.route === r.route)
          .map(s => ({
            name: s.name,
            path: s.path,
            viewport: s.viewport,
            timestamp: s.timestamp,
            firebaseUrl: s.firebaseUrl
          })),
        videos: [],
        errors: r.error ? [r.error] : [],
        consoleMessages: []
      })),
      screenshotsUrl,
      summary: {
        componentsVerified: analysis.components,
        routesTested: analysis.routes,
        issuesFound: scanResult.issues?.map((i: any) => i.description) || []
      }
    };
    
    // Report to PR with timeout
    core.info('📝 Posting results to PR...');
    const reportStartTime = Date.now();
    const commentEngine = getGitHubCommentEngine();
    
    try {
      await Promise.race([
        commentEngine.postVerificationResults(verificationResult, screenshotsUrl),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PR report posting timeout')), 30000)
        )
      ]);
      core.info(`✅ PR report posted in ${Date.now() - reportStartTime}ms`);
    } catch (error) {
      core.warning(`Failed to post PR report: ${error}`);
      // Continue with cleanup
    }
    
    // Clean up test runner resources after visual analysis is complete
    core.info('🧹 Cleaning up browser resources...');
    const cleanupStartTime = Date.now();
    try {
      // Add timeout to prevent hanging
      await Promise.race([
        testRunner.cleanup(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 10000))
      ]);
      core.info(`✅ Browser cleanup completed in ${Date.now() - cleanupStartTime}ms`);
    } catch (error) {
      core.warning(`Browser cleanup failed or timed out: ${error}`);
    }
    
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
    
    core.info(`⏱️ Total test execution time: ${Date.now() - startTime}ms`);
    
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
      core.info('🗑️ Cleaning up temporary directory...');
      const cleanupStartTime = Date.now();
      const deleted = await deleteFile(outputDir);
      if (!deleted) {
        core.warning(`Failed to cleanup ${outputDir}`);
      } else {
        core.info(`✅ Temp directory cleaned up in ${Date.now() - cleanupStartTime}ms`);
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
    storageBucket: config.get('storage-bucket'),
    claudeApiKey: config.getSecret('claude-api-key'),
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

/**
 * Handle route discovery mode
 */
async function handleRouteDiscovery(inputs: ActionInputs): Promise<void> {
  try {
    core.info('🔍 Running in route discovery mode...');
    
    // Get PR number
    const prNumber = GitHubServiceFactory.getService().getPRNumber();
    
    if (!prNumber) {
      core.setFailed('Route discovery requires a pull request context');
      return;
    }
    
    // Create route analyzer
    const impactAnalyzer = new RouteImpactAnalyzer(null, inputs.previewUrl);
    
    // Analyze PR impact
    const impactTree = await impactAnalyzer.analyzePRImpact(prNumber);
    
    // Extract routes
    const routes = new Set<string>();
    
    // Add routes from component mappings
    if (impactTree.componentRouteMapping && impactTree.componentRouteMapping.size > 0) {
      for (const [, mappedRoutes] of impactTree.componentRouteMapping) {
        for (const route of mappedRoutes) {
          if (route.routePath) {
            routes.add(route.routePath);
          }
        }
      }
    }
    
    // Add directly affected routes
    if (impactTree.affectedRoutes && impactTree.affectedRoutes.length > 0) {
      for (const impact of impactTree.affectedRoutes) {
        if (impact.route) {
          routes.add(impact.route);
        }
      }
    }
    
    // Default to homepage if no routes found
    if (routes.size === 0) {
      routes.add('/');
    }
    
    // Output routes as JSON for the workflow
    const routeArray = Array.from(routes);
    core.setOutput('routes', JSON.stringify(routeArray));
    core.setOutput('route-count', routeArray.length.toString());
    
    core.info(`✅ Discovered ${routeArray.length} routes: ${routeArray.join(', ')}`);
  } catch (error) {
    core.setFailed(`Route discovery failed: ${error}`);
  }
}

/**
 * Handle baseline generation mode - captures screenshots from production URL
 */
async function handleBaselineGeneration(inputs: ActionInputs): Promise<void> {
  const startTime = Date.now();
  
  try {
    core.info('📸 Running in baseline generation mode...');
    core.info(`🌐 Production URL: ${inputs.productionUrl || inputs.previewUrl}`);
    
    // Use production URL for baseline generation, fallback to preview URL
    const baselineUrl = inputs.productionUrl || inputs.previewUrl;
    
    // Parse viewports
    const viewports = inputs.viewports.split(',').map(viewport => {
      const [width, height] = viewport.trim().split('x').map(Number);
      return { width, height, name: `${width}x${height}` };
    });
    
    // Get routes to capture
    const testRoutesInput = config.get('test-routes', { defaultValue: '' });
    let routes: string[] = [];
    
    if (testRoutesInput) {
      // Parse comma-separated routes if provided
      routes = testRoutesInput.split(',').map((r: string) => r.trim()).filter((r: string) => r.length > 0);
      core.info(`📍 Using specified routes: ${routes.join(', ')}`);
    } else {
      // Use smart navigation to discover routes if enabled
      const enableAINavigation = getBooleanConfig('enable-ai-navigation');
      
      if (enableAINavigation) {
        core.info('🧠 Using AI navigation to discover routes...');
        
        // Import AIRouteDiscovery
        const { AIRouteDiscovery } = await import('./core/analysis/AIRouteDiscovery');
        const routeDiscovery = new AIRouteDiscovery(inputs.claudeApiKey);
        
        // Create a browser page for discovery
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        try {
          await page.goto(baselineUrl, { waitUntil: 'networkidle', timeout: 30000 });
          const discoveredRoutes = await routeDiscovery.discoverRoutes(page, baselineUrl);
          
          if (discoveredRoutes && discoveredRoutes.length > 0) {
            // Limit routes based on max-routes input
            const maxRoutes = parseInt(config.get('max-routes', { defaultValue: '10' }));
            routes = discoveredRoutes.slice(0, maxRoutes);
            core.info(`✅ AI discovered ${discoveredRoutes.length} routes, using first ${routes.length}`);
          }
        } finally {
          await browser.close();
        }
      }
      
      // Fallback to homepage if no routes discovered
      if (routes.length === 0) {
        core.warning('⚠️ No routes specified or discovered. Using homepage as fallback.');
        routes = ['/'];
      }
    }
    
    core.info(`📍 Routes to capture: ${routes.join(', ')}`);
    
    // Create storage provider
    const storageProvider = await StorageFactory.createFromInputs();
    
    // Import and use DynamicBaselineManager - existing infrastructure
    const { DynamicBaselineManager } = await import('./core/baseline/DynamicBaselineManager');
    
    // Create baseline manager with production URL
    const baselineManager = new DynamicBaselineManager({
      productionUrl: baselineUrl,
      storageProvider
    });
    
    // Create baselines for specified routes
    core.info(`📸 Creating baselines for ${routes.length} routes...`);
    const results: any[] = await baselineManager.createBaselines(routes, viewports);
    
    // Set outputs
    core.setOutput('baseline-count', results.length.toString());
    core.setOutput('baseline-routes', JSON.stringify(results.map((r: any) => r.route)));
    
    // Generate summary
    const duration = Date.now() - startTime;
    core.info('');
    core.info('═══════════════════════════════════════════');
    core.info('📸 BASELINE GENERATION COMPLETE');
    core.info('═══════════════════════════════════════════');
    core.info(`✅ Generated ${results.length} baseline screenshots`);
    core.info(`📍 Routes captured: ${results.map((r: any) => r.route).join(', ')}`);
    core.info(`🖼️ Viewports: ${viewports.map(v => `${v.width}x${v.height}`).join(', ')}`);
    core.info(`⏱️ Duration: ${Math.round(duration / 1000)}s`);
    core.info('═══════════════════════════════════════════');
    
  } catch (error) {
    core.setFailed(`Baseline generation failed: ${error}`);
  }
}

/**
 * Run tests in parallel mode
 */
async function runParallelTests(
  inputs: ActionInputs,
  firebaseConfig: FirebaseConfig,
  viewports: any[],
  routes: string[],
  parallelChunksStr: string
): Promise<void> {
  try {
    core.info('🚀 Running tests in parallel mode...');
    
    // Parse parallel chunks
    const chunksData = JSON.parse(parallelChunksStr);
    const chunks = chunksData.chunks || chunksData;
    
    if (!Array.isArray(chunks)) {
      throw new Error('Invalid parallel-chunks format. Expected JSON array of route arrays.');
    }
    
    // Create storage provider if available
    let storageProvider = null;
    try {
      const storageProviderName = config.get('storage-provider', { defaultValue: 'github' });
      if (storageProviderName !== 'github') {
        storageProvider = await StorageFactory.createFromInputs();
      }
    } catch (error) {
      core.debug(`Storage provider initialization failed: ${error}`);
    }
    
    // Create parallel executor
    const executor = new ParallelTestExecutor({
      chunks,
      firebaseConfig,
      viewports,
      storageProvider,
      maxConcurrency: 3,
      progressCallback: (progress) => {
        core.info(`Progress: ${progress.percentage}% (${progress.completedRoutes}/${progress.totalRoutes} routes)`);
      }
    });
    
    // Execute tests
    const results = await executor.execute();
    
    // Get statistics
    const stats = executor.getStatistics();
    
    // Create verification result
    const verificationResult: VerificationResult = {
      status: stats.successRate === 100 ? 'success' : 'failure',
      firebaseConfig,
      totalTests: results.length,
      passedTests: results.filter(r => r.status === 'passed').length,
      failedTests: results.filter(r => r.status === 'failed').length,
      skippedTests: 0,
      duration: stats.totalDuration,
      testResults: results,
      screenshotsUrl: inputs.previewUrl,
      summary: {
        componentsVerified: [],
        routesTested: routes,
        issuesFound: results.flatMap(r => r.errors || [])
      }
    };
    
    // Post results to PR
    const commentEngine = getGitHubCommentEngine();
    await commentEngine.postVerificationResults(verificationResult, inputs.previewUrl);
    
    // Set outputs
    core.setOutput('status', verificationResult.status);
    core.setOutput('total-routes', routes.length.toString());
    core.setOutput('passed-tests', verificationResult.passedTests.toString());
    core.setOutput('failed-tests', verificationResult.failedTests.toString());
    core.setOutput('duration', `${Math.round(stats.totalDuration / 1000)}s`);
    
    if (verificationResult.status === 'failure') {
      core.setFailed(`Visual tests failed: ${verificationResult.failedTests} test(s) failed`);
    } else {
      core.info(`✅ All visual tests passed (${stats.successRate.toFixed(1)}% success rate)`);
    }
  } catch (error) {
    core.setFailed(`Parallel test execution failed: ${error}`);
  }
}

// Export for external usage
export { run };

// Main execution
if (require.main === module) {
  const mainStartTime = Date.now();
  run().catch(error => {
    core.setFailed(error.message);
  }).finally(() => {
    core.info(`⏱️ Total workflow time: ${Date.now() - mainStartTime}ms`);
    
    // Force exit after a short delay to prevent hanging
    setTimeout(() => {
      core.info('🔄 Force exiting to prevent hanging...');
      process.exit(0);
    }, 5000);
  });
}