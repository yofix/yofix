#!/usr/bin/env node

/**
 * Visual Tester Module
 * Captures screenshots and performs visual testing
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateWithLLM } from './llm-browser-agent';
import { executeAuthStrategies } from './auth-strategies';

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

async function runVisualTests(): Promise<void> {
  const previewUrl = process.env.INPUT_PREVIEW_URL;
  const routesJson = process.env.INPUT_ROUTES || '[]';
  const viewportsStr = process.env.INPUT_VIEWPORTS || '1920x1080';
  const timeout = process.env.INPUT_TEST_TIMEOUT || '30s';
  const debug = process.env.INPUT_DEBUG === 'true';

  // Authentication
  const authEmail = process.env.INPUT_AUTH_EMAIL;
  const authPassword = process.env.INPUT_AUTH_PASSWORD;
  const authLoginUrl = process.env.INPUT_AUTH_LOGIN_URL || '/login/password';
  const claudeApiKey = process.env.INPUT_CLAUDE_API_KEY;

  if (!previewUrl) {
    console.error('❌ Preview URL is required');
    process.exit(1);
  }

  console.log(`📸 Running visual tests on ${previewUrl}`);

  // Parse routes
  let routes: Route[] = [];
  try {
    routes = JSON.parse(routesJson);
  } catch {
    // If no routes provided, test the base URL
    routes = [{ path: '/', title: 'Home' }];
  }

  // Parse viewports
  const viewports: Viewport[] = viewportsStr.split(',').map(vp => {
    const [width, height] = vp.trim().split('x').map(Number);
    return {
      width,
      height,
      name: `${width}x${height}`
    };
  });

  console.log(`🔍 Testing ${routes.length} routes across ${viewports.length} viewports`);

  const browser = await chromium.launch({
    headless: !debug,  // Run in headed mode when debug is true
    slowMo: debug ? 500 : 0,  // Slow down actions in debug mode
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results: TestResult[] = [];
  const screenshots: string[] = [];

  try {
    // Create a persistent context to maintain session across routes
    const context = await browser.newContext({
      viewport: viewports[0], // Use first viewport for auth
      // Accept all cookies to maintain session
      acceptDownloads: false,
      ignoreHTTPSErrors: true,
      // Store cookies and local storage
      storageState: undefined
    });

    // Perform authentication once if credentials provided
    if (authEmail && authPassword) {
      console.log(`🔐 Authenticating at ${authLoginUrl}...`);
      const authSuccess = await performAuthentication(
        context,
        previewUrl,
        authLoginUrl,
        authEmail,
        authPassword,
        debug
      );
      
      if (!authSuccess) {
        console.error('❌ Authentication failed');
        // Continue anyway - some routes might be public
      } else {
        console.log('✅ Authentication successful');
      }
    }

    // Test each route with each viewport
    for (const route of routes) {
      console.log(`\n📍 Testing route: ${route.path}`);

      for (const viewport of viewports) {
        // Create new page with specific viewport
        const page = await context.newPage();
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        try {
          // Set timeout
          page.setDefaultTimeout(parseInt(timeout) * 1000);

          // Navigate to the URL
          const fullUrl = new URL(route.path, previewUrl).href;
          
          if (debug) {
            console.log(`  🌐 Navigating to: ${fullUrl}`);
          }
          
          const response = await page.goto(fullUrl, { waitUntil: 'networkidle' });
          
          // Check if we were redirected to login (indicates auth failure)
          const currentUrl = page.url();
          const wasRedirectedToLogin = currentUrl.includes('/login') && !route.path.includes('/login');
          
          if (wasRedirectedToLogin) {
            console.log(`  ⚠️ ${viewport.name} - Redirected to login (auth may have expired)`);
            
            // Try to re-authenticate
            if (authEmail && authPassword) {
              console.log('  🔐 Re-authenticating...');
              await page.close();
              const reAuthSuccess = await performAuthentication(
                context,
                previewUrl,
                authLoginUrl,
                authEmail,
                authPassword,
                debug
              );
              
              if (reAuthSuccess) {
                // Retry the route on a new page
                const retryPage = await context.newPage();
                await retryPage.setViewportSize({ width: viewport.width, height: viewport.height });
                await retryPage.goto(fullUrl, { waitUntil: 'networkidle' });
                
                // Close old page and use retry page
                await page.close();
                
                // Continue with retry page
                await retryPage.waitForLoadState('networkidle');
                await retryPage.waitForTimeout(1000);
                
                // Capture screenshot with retry page
                const screenshotName = `${route.path.replace(/\//g, '-')}-${viewport.name}.png`;
                const screenshotPath = path.join(process.cwd(), 'screenshots', screenshotName);
                fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
                
                await retryPage.screenshot({
                  path: screenshotPath,
                  fullPage: true
                });
                
                screenshots.push(screenshotPath);
                
                results.push({
                  route: route.path,
                  viewport: viewport.name,
                  screenshot: screenshotPath,
                  status: 'passed',
                  message: 'Screenshot captured successfully after re-authentication'
                });
                
                console.log(`  ✅ ${viewport.name} - Screenshot captured after re-auth`);
                await retryPage.close();
                continue; // Skip to next viewport
              }
            }
          }

          // Wait for content to stabilize
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(1000); // Additional wait for animations

          // Capture screenshot
          const screenshotName = `${route.path.replace(/\//g, '-')}-${viewport.name}.png`;
          const screenshotPath = path.join(process.cwd(), 'screenshots', screenshotName);
          
          // Ensure directory exists
          fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });

          await page.screenshot({
            path: screenshotPath,
            fullPage: true
          });

          screenshots.push(screenshotPath);

          // Record result
          results.push({
            route: route.path,
            viewport: viewport.name,
            screenshot: screenshotPath,
            status: wasRedirectedToLogin ? 'warning' : 'passed',
            message: wasRedirectedToLogin 
              ? 'Screenshot captured but route may require authentication' 
              : 'Screenshot captured successfully'
          });

          console.log(`  ✅ ${viewport.name} - Screenshot captured`);

        } catch (error: any) {
          console.error(`  ❌ ${viewport.name} - Test failed:`, error.message);
          
          results.push({
            route: route.path,
            viewport: viewport.name,
            screenshot: '',
            status: 'failed',
            message: error.message
          });
        } finally {
          await page.close();
        }
      }
    }

    // Save context state for potential reuse
    if (authEmail && authPassword) {
      const statePath = path.join(process.cwd(), 'auth-state.json');
      await context.storageState({ path: statePath });
      console.log(`\n💾 Saved authentication state to ${statePath}`);
    }

    // Output results
    const outputPath = path.join(process.cwd(), 'visual-test-results.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      results,
      screenshots,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        failed: results.filter(r => r.status === 'failed').length,
        warnings: results.filter(r => r.status === 'warning').length
      }
    }, null, 2));

    // Set GitHub Action output
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      fs.appendFileSync(githubOutput, `results=${JSON.stringify(results)}\n`);
      fs.appendFileSync(githubOutput, `screenshots=${JSON.stringify(screenshots)}\n`);
      fs.appendFileSync(githubOutput, `test-count=${results.length}\n`);
      fs.appendFileSync(githubOutput, `passed-count=${results.filter(r => r.status === 'passed').length}\n`);
    }

    console.log(`\n✅ Visual testing completed: ${results.filter(r => r.status === 'passed').length}/${results.length} passed`);

  } catch (error) {
    console.error('❌ Visual testing failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

/**
 * Perform authentication on a dedicated login page
 */
async function performAuthentication(
  context: BrowserContext,
  baseUrl: string,
  loginPath: string,
  email: string,
  password: string,
  debug: boolean
): Promise<boolean> {
  const page = await context.newPage();
  
  try {
    // Navigate to login page
    const loginUrl = new URL(loginPath, baseUrl).href;
    if (debug) {
      console.log(`  🌐 Navigating to login: ${loginUrl}`);
    }
    
    await page.goto(loginUrl, { waitUntil: 'networkidle' });
    
    // Wait for login form to be visible
    try {
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    } catch (error) {
      if (debug) {
        console.log('  ⚠️ Password field not found within 10 seconds');
        // Take a screenshot for debugging
        await page.screenshot({ path: 'debug-login-page.png', fullPage: true });
        console.log('  📸 Debug screenshot saved: debug-login-page.png');
      }
      throw new Error('Login form not found - password field missing');
    }
    
    // Try LLM authentication if API key is available
    const claudeApiKey = process.env.INPUT_CLAUDE_API_KEY;
    if (claudeApiKey) {
      console.log('  🤖 Attempting LLM-powered authentication...');
      const llmSuccess = await authenticateWithLLM(
        page,
        email,
        password,
        undefined, // Already on login page
        claudeApiKey,
        debug
      );
      
      if (llmSuccess) {
        console.log('  ✅ LLM authentication successful');
        return true;
      } else {
        console.log('  ⚠️ LLM authentication failed, trying smart strategies...');
      }
    }
    
    // Fallback to smart authentication strategies
    console.log('  🧠 Using smart authentication strategies...');
    const success = await executeAuthStrategies(page, email, password, debug);
    
    return success;
    
  } catch (error: any) {
    console.error(`  ❌ Authentication error: ${error.message}`);
    return false;
  } finally {
    await page.close();
  }
}

// Run if called directly
if (require.main === module) {
  runVisualTests().catch(console.error);
}