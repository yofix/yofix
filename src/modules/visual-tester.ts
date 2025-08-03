#!/usr/bin/env node

/**
 * Visual Tester Module
 * Captures screenshots and performs visual testing
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { authenticateWithLLM } from './llm-browser-agent';
import { executeAuthStrategies } from './auth-strategies';
import { 
  createModuleLogger, 
  ErrorCategory, 
  ErrorSeverity, 
  executeOperation, 
  retryOperation,
  config,
  getBooleanConfig,
  safeJSONParse,
  write,
  ensureDirectory,
  parseTimeout
} from '../core';

interface Route {
  path: string;
  title: string;
}

interface Viewport {
  width: number;
  height: number;
  name: string;
}

interface TestResult {
  route: string;
  viewport: string;
  screenshot: string;
  status: 'passed' | 'failed' | 'warning';
  message?: string;
}

const logger = createModuleLogger({
  module: 'VisualTester',
  defaultCategory: ErrorCategory.BROWSER
});

async function runVisualTests(): Promise<void> {
  const previewUrl = config.get('preview-url', { required: true });
  const routesJson = config.get('routes', { defaultValue: '[]' });
  const viewportsStr = config.get('viewports', { defaultValue: '1920x1080' });
  const timeout = config.get('test-timeout', { defaultValue: '30s' });
  const debug = getBooleanConfig('debug');

  // Authentication
  const authEmail = config.get('auth-email');
  const authPassword = config.get('auth-password');
  const authLoginUrl = config.get('auth-login-url', { defaultValue: '/login/password' });
  const claudeApiKey = config.getSecret('claude-api-key');

  if (!previewUrl) {
    await logger.error(new Error('Preview URL is required'), {
      severity: ErrorSeverity.CRITICAL,
      userAction: 'Start visual tests'
    });
    process.exit(1);
  }

  logger.info(`📸 Running visual tests on ${previewUrl}`);

  // Parse routes
  const routesResult = safeJSONParse<Route[]>(routesJson, { 
    defaultValue: [{ path: '/', title: 'Home' }] 
  });
  const routes = routesResult.data!;

  // Parse viewports
  const viewports: Viewport[] = viewportsStr.split(',').map(vp => {
    const [width, height] = vp.split('x').map(Number);
    return {
      width: width || 1920,
      height: height || 1080,
      name: `${width}x${height}`
    };
  });

  logger.info(`🔍 Testing ${routes.length} routes across ${viewports.length} viewports`);

  // Create output directory
  const outputDir = '.yofix/screenshots';
  await ensureDirectory(outputDir);

  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    timeout: parseTimeout(timeout)
  });

  const results: TestResult[] = [];
  let screenshots: string[] = [];

  try {
    // Create context with custom user agent
    const context = await browser.newContext({
      userAgent: 'YoFix Visual Tester (Playwright)',
      viewport: { width: 1920, height: 1080 }
    });

    // Perform authentication if credentials provided
    if (authEmail && authPassword) {
      logger.info(`🔐 Authenticating at ${authLoginUrl}...`);
      
      const authResult = await executeOperation(
        () => performAuthentication(
          context,
          previewUrl,
          authLoginUrl,
          authEmail,
          authPassword,
          claudeApiKey,
          debug
        ),
        {
          name: 'Authentication',
          category: ErrorCategory.AUTHENTICATION,
          severity: ErrorSeverity.HIGH,
          metadata: { authLoginUrl }
        }
      );

      if (!authResult.success || !authResult.data) {
        logger.warn('❌ Authentication failed - continuing with public routes');
      } else {
        logger.info('✅ Authentication successful');
      }
    }

    // Test each route
    for (const route of routes) {
      logger.info(`\n📍 Testing route: ${route.path}`);

      // Test each viewport
      for (const viewport of viewports) {
        const page = await context.newPage();
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        const result = await executeOperation(
          async () => {
            const fullUrl = new URL(route.path, previewUrl).href;
            
            if (debug) {
              logger.debug(`  🌐 Navigating to: ${fullUrl}`);
            }

            // Navigate with retry
            await retryOperation(
              () => page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }),
              {
                maxAttempts: 3,
                delay: 2000,
                onRetry: (attempt) => logger.debug(`Retry attempt ${attempt} for ${fullUrl}`)
              }
            );

            // Wait for page to stabilize
            await page.waitForTimeout(2000);

            // Check if we were redirected to login
            const currentUrl = page.url();
            const wasRedirectedToLogin = currentUrl.includes('login') && !route.path.includes('login');

            if (wasRedirectedToLogin) {
              logger.warn(`  ⚠️ ${viewport.name} - Redirected to login (auth may have expired)`);
              
              // Try to re-authenticate
              if (authEmail && authPassword) {
                logger.info('  🔐 Re-authenticating...');
                await page.close();
                
                const authPage = await context.newPage();
                const reAuthResult = await executeOperation(
                  () => performAuthentication(
                    context,
                    previewUrl,
                    authLoginUrl,
                    authEmail,
                    authPassword,
                    claudeApiKey,
                    debug
                  ),
                  {
                    name: 'Re-authentication',
                    category: ErrorCategory.AUTHENTICATION,
                    severity: ErrorSeverity.MEDIUM
                  }
                );

                if (reAuthResult.success && reAuthResult.data) {
                  // Try the route again after re-auth
                  const retryPage = await context.newPage();
                  await retryPage.setViewportSize({ width: viewport.width, height: viewport.height });
                  
                  await retryPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                  await retryPage.waitForTimeout(2000);

                  // Capture screenshot
                  const screenshotPath = path.join(outputDir, `${route.path.replace(/\//g, '-')}-${viewport.name}.png`);
                  await retryPage.screenshot({ 
                    path: screenshotPath,
                    fullPage: true 
                  });
                  
                  screenshots.push(screenshotPath);
                  
                  logger.info(`  ✅ ${viewport.name} - Screenshot captured after re-auth`);
                  await retryPage.close();
                  
                  return {
                    route: route.path,
                    viewport: viewport.name,
                    screenshot: screenshotPath,
                    status: 'warning' as const,
                    message: 'Required re-authentication'
                  };
                }
                
                await authPage.close();
              }
              
              return {
                route: route.path,
                viewport: viewport.name,
                screenshot: '',
                status: 'warning' as const,
                message: 'Authentication required'
              };
            }

            // Capture screenshot
            const screenshotPath = path.join(outputDir, `${route.path.replace(/\//g, '-')}-${viewport.name}.png`);
            await page.screenshot({ 
              path: screenshotPath,
              fullPage: true 
            });
            
            screenshots.push(screenshotPath);

            logger.info(`  ✅ ${viewport.name} - Screenshot captured`);

            return {
              route: route.path,
              viewport: viewport.name,
              screenshot: screenshotPath,
              status: 'passed' as const
            };
          },
          {
            name: `Test route ${route.path} at ${viewport.name}`,
            category: ErrorCategory.BROWSER,
            severity: ErrorSeverity.MEDIUM,
            metadata: { route: route.path, viewport: viewport.name }
          }
        );

        if (result.success && result.data) {
          results.push(result.data);
        } else {
          results.push({
            route: route.path,
            viewport: viewport.name,
            screenshot: '',
            status: 'failed',
            message: result.error
          });
        }

        await page.close();
      }
    }

    // Save authentication state if we have it
    const statePath = path.join(outputDir, 'auth-state.json');
    if (authEmail && (await context.storageState()).cookies.length > 0) {
      await context.storageState({ path: statePath });
      logger.info(`\n💾 Saved authentication state to ${statePath}`);
    }

    await context.close();

    // Output results
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      warnings: results.filter(r => r.status === 'warning').length,
      results
    };

    fs.writeFileSync('.yofix/test-results.json', JSON.stringify(summary, null, 2));
    
    // Set outputs for GitHub Actions
    process.stdout.write(`::set-output name=screenshots::${JSON.stringify(screenshots)}\n`);
    process.stdout.write(`::set-output name=results::${JSON.stringify(summary)}\n`);

    logger.info(`\n✅ Visual testing completed: ${results.filter(r => r.status === 'passed').length}/${results.length} passed`);

  } catch (error) {
    await logger.error(error as Error, {
      userAction: 'Run visual tests',
      severity: ErrorSeverity.CRITICAL
    });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

async function performAuthentication(
  context: BrowserContext,
  previewUrl: string,
  loginPath: string,
  email: string,
  password: string,
  claudeApiKey?: string,
  debug?: boolean
): Promise<boolean> {
  const log = createModuleLogger({
    module: 'VisualTester.Auth',
    debug,
    defaultCategory: ErrorCategory.AUTHENTICATION
  });

  const page = await context.newPage();
  
  try {
    const loginUrl = new URL(loginPath, previewUrl).href;
    
    if (debug) {
      log.debug(`  🌐 Navigating to login: ${loginUrl}`);
    }
    
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Check if we can find a password field (indicates we're on a login page)
    const passwordField = await page.$('input[type="password"]');
    
    if (!passwordField) {
      if (debug) {
        log.debug('  ⚠️ Password field not found within 10 seconds');
        // Take a screenshot for debugging
        await page.screenshot({ path: 'debug-login-page.png', fullPage: true });
        log.debug('  📸 Debug screenshot saved: debug-login-page.png');
      }
      await page.close();
      return false;
    }
    
    // Try LLM authentication first if API key is available
    if (claudeApiKey) {
      log.info('  🤖 Attempting LLM-powered authentication...');
      
      const llmResult = await executeOperation(
        () => authenticateWithLLM(
          page,
          email,
          password,
          loginUrl,
          claudeApiKey,
          debug
        ),
        {
          name: 'LLM authentication',
          category: ErrorCategory.AUTHENTICATION,
          fallback: false
        }
      );
      
      if (llmResult.success && llmResult.data) {
        log.info('  ✅ LLM authentication successful');
        return true;
      } else {
        log.warn('  ⚠️ LLM authentication failed, trying smart strategies...');
      }
    }
    
    // Fallback to smart authentication strategies
    log.info('  🧠 Using smart authentication strategies...');
    const success = await executeAuthStrategies(page, email, password, debug);
    
    await page.close();
    return success;
    
  } catch (error: any) {
    await log.error(error, {
      userAction: 'Perform authentication',
      severity: ErrorSeverity.HIGH,
      metadata: { loginPath }
    });
    return false;
  }
}

// parseTimeout function removed - using centralized utility from core

// Run if called directly
if (require.main === module) {
  runVisualTests().catch(async (error) => {
    await logger.error(error, {
      userAction: 'Run visual tester module',
      severity: ErrorSeverity.CRITICAL
    });
    process.exit(1);
  });
}