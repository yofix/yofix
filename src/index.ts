// CRITICAL: Register unhandled rejection handler FIRST, before any imports or async operations
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  // Can't use core.warning yet as @actions/core isn't imported
  console.warn(`⚠️ Unhandled promise rejection: ${reason?.message || String(reason)}`);
  console.warn(`This error was caught by global handler and will not crash the workflow`);
  // Don't fail the workflow for non-critical unhandled rejections
  // These are often from fire-and-forget promises in decorators/circuit breakers
});

import * as core from '@actions/core';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Simplified to use @yofix/browser for screenshot capture
import { captureScreenshotsWithBrowser } from './core/screenshot/BrowserScreenshotCapture';
import { PRReporter } from './github/PRReporter';
import { ActionInputs, VerificationResult, FirebaseConfig, RouteAnalysisResult } from './types';
// Bot functionality removed - only simple screenshot capture
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
} from './core';
import { defaultConfig } from './config/default.config';
import { GitHubCacheManager } from './github/GitHubCacheManager';
import { analyzeRoutesWithExternalTool, ExternalRouteImpactTree } from './core/analysis/ThirdPartyRouteImpactAnalyzer';

async function run(): Promise<void> {
  try {
    // Initialize core services first
    initializeCoreServices();
    
    // Configure GitHub service with token
    const githubToken = config.get('github-token');
    if (githubToken) {
      await GitHubServiceFactory.getService().configure({ token: githubToken });
    }
    
    // Check if this is a bot command
    // Only run visual testing workflow - bot commands removed
    await runVisualTesting();
  } catch (error) {
    await errorHandler.handleError(error as Error, {
      severity: ErrorSeverity.CRITICAL,
      category: ErrorCategory.ORCHESTRATION,
      location: 'orchestration'
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
 * Run visual testing using @yofix/browser for screenshot capture
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
    let impactTree: ExternalRouteImpactTree | null = null;
    let routesToTest: ExternalRouteImpactTree | null = null;
    let impactCommentBody: string | null = null;

    if (prNumber > 0) {
      try {
        core.info('🛰️ Using route-impact-analyzer to discover affected routes...');

        const github = GitHubServiceFactory.getService();
        const prFiles = await github.listPullRequestFiles();
        core.info(`📝 Analyzing ${prFiles.length} changed files: ${prFiles.map(f => f.filename).join(', ')}`);
        const externalAnalysis = await analyzeRoutesWithExternalTool(prFiles, inputs.previewUrl);
        core.info(`🎯 Route impact analysis complete: ${externalAnalysis.impactTree.totalRoutesAffected} routes affected, ${externalAnalysis.routesToTest.totalRoutesAffected} routes to test`);
        impactTree = externalAnalysis.impactTree;
        routesToTest = externalAnalysis.routesToTest;
        impactCommentBody = externalAnalysis.commentBody;
      } catch (externalError) {
        const error = externalError as Error;
        core.error(`❌ Route impact analyzer error: ${error.message}`);
        if (error.stack) {
          core.debug(`Stack trace: ${error.stack}`);
        }
        await errorHandler.handleError(error, {
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.PACKAGE,
          location: '@yofix/analyzer',
          recoverable: true
        });
        core.warning('Third-party route analyzer failed. Falling back to testing homepage only.');
        affectedRoutes = ['/'];
      }
    }
    
    if (routesToTest) {
      affectedRoutes = extractRoutesFromImpactTree(routesToTest);
      logImpactTreeSummary(routesToTest);
    } else if (impactTree) {
      // Fallback to full impact tree if routesToTest is not available
      affectedRoutes = extractRoutesFromImpactTree(impactTree);
      logImpactTreeSummary(impactTree);
    }
    
    if (prNumber > 0 && impactCommentBody) {
      const githubServiceWithContext = GitHubServiceFactory.getService();
      try {
        await Promise.race([
          githubServiceWithContext.createComment(impactCommentBody),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('GitHub comment timeout')), 15000)
          )
        ]);
        core.info('✅ Posted route impact summary to PR');
      } catch (commentError) {
        core.warning(`Failed to post impact summary to PR: ${commentError}`);
      }
    }
    
    // If no PR number or no routes found, default to homepage
    if (affectedRoutes.length === 0) {
      core.info('ℹ️ No specific routes identified, defaulting to homepage');
      affectedRoutes = ['/'];
    }
    
    // Use the affected routes for testing
    const routes = affectedRoutes
    
    // Extract unique components from routes to test
    let components: string[] = ['App']; // Default fallback

    const treeToUse = routesToTest || impactTree;
    if (treeToUse) {
      const allComponents = new Set<string>();

      // Get components from affected routes
      if (treeToUse.affectedRoutes && treeToUse.affectedRoutes.length > 0) {
        for (const route of treeToUse.affectedRoutes) {
          // Add changed files that affect this route
          if (route.changedFiles) {
            route.changedFiles.forEach((file: string) => {
              const componentName = path.basename(file, path.extname(file));
              if (componentName && componentName !== 'index') {
                allComponents.add(componentName);
              }
            });
          }
        }
      }

      // Get components from component route mapping
      if (treeToUse.componentRouteMapping && treeToUse.componentRouteMapping.size > 0) {
        for (const [componentFile] of treeToUse.componentRouteMapping) {
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
      hasUIChanges: (treeToUse?.affectedRoutes?.length || 0) > 0 || (treeToUse?.componentRouteMapping?.size || 0) > 0,
      changedPaths: routes,
      components: components,
      routes: routes,
      testSuggestions: routes.map(r => `Test route ${r} for visual regressions`),
      riskLevel: (treeToUse?.sharedComponents?.size || 0) > 0 ? 'high' : 'medium'
    };
    
    core.info(`🔍 Found ${analysis.routes.length} routes to test`);
    
    // Capture screenshots using @yofix/browser
    core.info('📸 Capturing screenshots with @yofix/browser...');
    const screenshotResult = await captureScreenshotsWithBrowser({
      routes: analysis.routes,
      baseUrl: inputs.previewUrl,
      viewports,
      credentials: inputs.authEmail && inputs.authPassword ? {
        email: inputs.authEmail,
        password: inputs.authPassword
      } : undefined,
      loginUrl: inputs.authLoginUrl,
      verbose: true
    });

    if (!screenshotResult.success) {
      throw new Error(`Screenshot capture failed: ${screenshotResult.errors?.map(e => e.message).join(', ')}`);
    }

    outputDir = screenshotResult.outputDirectory;
    core.info(`✅ Captured ${screenshotResult.screenshots.length} route screenshots`);
    core.info(`  Output directory: ${outputDir}`);

    // @yofix/browser now outputs data ready for @yofix/storage - no conversion needed!
    // Flatten RouteScreenshot[] to file list for upload
    // Also create a map to preserve metadata for later
    const screenshotMetadataMap = new Map<string, { route: string; fullUrl: string; viewport: any; metadata: any }>();

    const filesForUpload = screenshotResult.screenshots.flatMap(routeScreenshot =>
      routeScreenshot.screenshots.map(screenshot => {
        // Store metadata for later retrieval
        // @yofix/browser structure: screenshot has width, height, viewport (string like "1920x1080")
        screenshotMetadataMap.set(screenshot.path, {
          route: routeScreenshot.route,
          fullUrl: routeScreenshot.fullUrl,
          viewport: {
            width: screenshot.width,
            height: screenshot.height,
            name: screenshot.viewport // e.g., "1920x1080"
          },
          metadata: screenshot.metadata
        });

        return {
          path: screenshot.path,
          destination: screenshot.destination,
          contentType: screenshot.contentType,
          metadata: screenshot.metadata
        };
      })
    );

    core.info(`📦 Prepared ${filesForUpload.length} files for upload`);

    // Upload screenshots to Firebase if configured
    let uploadedFiles: Array<{ localPath: string; remotePath: string; url?: string }> = [];
    let screenshotsUrl = ''; // Will be set after upload or constructed from bucket

    if (inputs.firebaseCredentials && inputs.storageBucket) {
      try {
        core.info('📤 Uploading screenshots to Firebase Storage...');
        core.info(`  Storage Bucket: ${inputs.storageBucket}`);
        core.info(`  Number of screenshots: ${filesForUpload.length}`);
        
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
        
        const { uploadFiles } = await import('@yofix/storage');

        // Direct upload using @yofix/storage - no conversion needed!
        const uploadResult = await uploadFiles({
          storage: {
            provider: 'firebase',
            config: {
              bucket: inputs.storageBucket,
              credentials: credentialsBase64,
              basePath: `pr-${prNumber}/screenshots`
            }
          },
          files: filesForUpload,
          verbose: true,
          onProgress: (progress) => {
            const percentage = ((progress.filesUploaded / progress.totalFiles) * 100).toFixed(1);
            core.info(`  Upload progress: ${progress.filesUploaded}/${progress.totalFiles} files (${percentage}%)`);
          }
        });

        if (!uploadResult.success) {
          throw new Error(`Upload failed: ${uploadResult.errors?.map(e => e.message).join(', ')}`);
        }

        uploadedFiles = uploadResult.files;

        // TODO: Baseline comparison and diff image upload will be added here

        // Log uploaded URLs
        core.info('✅ Screenshots uploaded successfully:');
        uploadedFiles.forEach(file => {
          core.info(`  📸 ${file.remotePath}: ${file.url || 'pending'}`);
        });
        core.info(`  Total uploaded: ${uploadedFiles.length}/${filesForUpload.length}`);

        // Get storage console URL
        const projectId = inputs.storageBucket.split('.')[0] || 'unknown';
        screenshotsUrl = `https://console.firebase.google.com/project/${projectId}/storage/${inputs.storageBucket}`;
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

    // Create verification result based on screenshot capture
    const verificationResult: VerificationResult = {
      status: screenshotResult.success ? 'success' : 'failure',
      firebaseConfig,
      totalTests: screenshotResult.screenshots.length,
      passedTests: screenshotResult.screenshots.filter(r => r.success !== false).length,
      failedTests: screenshotResult.screenshots.filter(r => r.success === false).length,
      skippedTests: 0,
      duration: Date.now() - startTime,
      testResults: screenshotResult.screenshots.map(r => {
        // Extract pathname from full URL for matching with uploaded files
        let routePath = r.route;
        if (routePath.startsWith('http://') || routePath.startsWith('https://')) {
          try {
            const url = new URL(routePath);
            routePath = url.pathname;
          } catch (error) {
            core.debug(`Failed to parse route URL: ${routePath}`);
          }
        }

        // Convert route path to sanitized filename format (e.g., /guard/trends -> guard-trends)
        const sanitizedRoute = routePath
          .replace(/^\//, '')           // Remove leading slash
          .replace(/\//g, '-')          // Replace slashes with dashes
          .toLowerCase();

        core.debug(`Matching route "${r.route}" (sanitized: "${sanitizedRoute}") with uploaded files`);

        return {
          testId: `test-${r.route}`,
          testName: `Route Test: ${r.route}`,
          status: r.success !== false ? 'passed' : 'failed',
          duration: screenshotResult.totalDuration,
          screenshots: uploadedFiles
            .filter(f => {
              if (!f.remotePath) return false;
              const match = f.remotePath.includes(sanitizedRoute);
              core.debug(`  Checking "${f.remotePath}" contains "${sanitizedRoute}": ${match}`);
              return match;
            })
            .map(f => {
              // Retrieve original metadata using local path
              const metadata = screenshotMetadataMap.get(f.localPath);
              const viewport = metadata?.viewport || { width: 0, height: 0, name: '' };
              const screenshotRoute = metadata?.route || routePath;
              const fullUrl = metadata?.fullUrl || '';

              return {
                name: `${screenshotRoute}-${viewport.width}x${viewport.height}.png`,
                path: f.localPath,
                viewport: viewport,
                timestamp: Date.now(),
                firebaseUrl: f.url || '',
                route: screenshotRoute,
                fullUrl: fullUrl
              };
            }),
          videos: [],
          errors: r.error ? [r.error] : [],
          consoleMessages: []
        };
      }),
      screenshotsUrl,
      summary: {
        componentsVerified: analysis.components,
        routesTested: analysis.routes,
        issuesFound: screenshotResult.errors?.map(e => e.message) || []
      }
    };

    // Report to PR with timeout
    core.info('📝 Posting results to PR...');
    const reportStartTime = Date.now();
    const reporter = new PRReporter();

    try {
      await Promise.race([
        reporter.postResults(verificationResult, prNumber.toString()),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('PR report posting timeout')), 30000)
        )
      ]);
      core.info(`✅ PR report posted in ${Date.now() - reportStartTime}ms`);
    } catch (error) {
      core.warning(`Failed to post PR report: ${error}`);
      // Continue anyway
    }

    // Set outputs
    core.setOutput('success', verificationResult.status === 'success');
    core.setOutput('issues-found', screenshotResult.errors?.length || 0);
    core.setOutput('critical-issues', 0); // No visual analysis anymore
    core.setOutput('warning-issues', 0); // No visual analysis anymore

    if (verificationResult.status === 'success') {
      core.info('✅ All screenshots captured successfully!');
    } else {
      core.setFailed(`❌ Screenshot capture had errors`);
    }

    core.info(`⏱️ Total execution time: ${Date.now() - startTime}ms`);
    
  } catch (error) {
    // Use centralized error handler
    await errorHandler.handleError(error as Error, {
      severity: ErrorSeverity.CRITICAL,
      category: ErrorCategory.ORCHESTRATION,
      location: 'visual-testing'
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

function extractRoutesFromImpactTree(impactTree: ExternalRouteImpactTree): string[] {
  const routes = new Set<string>();

  if (impactTree.componentRouteMapping && impactTree.componentRouteMapping.size > 0) {
    for (const componentRoutes of impactTree.componentRouteMapping.values()) {
      for (const routeInfo of componentRoutes) {
        if (routeInfo.routePath) {
          // Pass routes as-is to @yofix/browser - it handles both full URLs and paths
          routes.add(routeInfo.routePath);
        }
      }
    }
  }

  if (impactTree.affectedRoutes && impactTree.affectedRoutes.length > 0) {
    for (const impact of impactTree.affectedRoutes) {
      if (impact.route) {
        // Pass routes as-is to @yofix/browser - it handles both full URLs and paths
        routes.add(impact.route);
      }
    }
  }

  return Array.from(routes);
}

function logImpactTreeSummary(impactTree: ExternalRouteImpactTree): void {
  if (impactTree.componentRouteMapping && impactTree.componentRouteMapping.size > 0) {
    core.info('🎯 Component mappings found:');
    for (const [component, routes] of impactTree.componentRouteMapping) {
      core.info(`  ${component} affects ${routes.length} routes:`);
      for (const route of routes) {
        if (route.routePath) {
          core.info(`    - ${route.routePath} (in ${route.routeFile || 'unknown'})`);
        }
      }
    }
  }
  
  if (impactTree.affectedRoutes && impactTree.affectedRoutes.length > 0) {
    const mappedRoutes = new Set<string>();
    if (impactTree.componentRouteMapping) {
      for (const routes of impactTree.componentRouteMapping.values()) {
        routes.forEach(route => {
          if (route.routePath) {
            mappedRoutes.add(route.routePath);
          }
        });
      }
    }
    
    const additionalRoutes = impactTree.affectedRoutes
      .filter(impact => impact.route && !mappedRoutes.has(impact.route))
      .map(impact => impact.route);
    
    if (additionalRoutes.length > 0) {
      core.info(`🎯 Found ${additionalRoutes.length} additional routes from direct changes`);
    }
  }
  
  const allRoutes = extractRoutesFromImpactTree(impactTree);
  core.info(`📍 Total unique routes to test: ${allRoutes.length}`);
  if (allRoutes.length > 0) {
    core.info(`📍 Affected routes: ${allRoutes.join(', ')}`);
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
  if (inputs.authMode && !['llm', 'selectors', 'smart', 'baseline'].includes(inputs.authMode)) {
    return `Invalid auth-mode: "${inputs.authMode}". Must be one of: llm, selectors, smart, baseline`;
  }
  
  // Validate timeout format using centralized validator
  const timeoutResult = Validators.isTimeout(inputs.testTimeout);
  if (!timeoutResult.valid) {
    return `Invalid test-timeout: ${timeoutResult.error}`;
  }
  
  return null;
}

// getErrorTips removed - error messages should be self-explanatory

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
