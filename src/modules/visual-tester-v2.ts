#!/usr/bin/env node

/**
 * Visual Tester Module v2
 * Improved authentication handling and verification
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

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
  status: 'passed' | 'failed' | 'warning' | 'skipped';
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
    routes = [{ path: '/', title: 'Home' }];
  }

  // Parse viewports
  const viewports: Viewport[] = viewportsStr.split(',').map(vp => {
    const [width, height] = vp.trim().split('x').map(Number);
    return { width, height, name: `${width}x${height}` };
  });

  console.log(`🔍 Testing ${routes.length} routes across ${viewports.length} viewports`);

  const browser = await chromium.launch({
    headless: !debug,
    slowMo: debug ? 500 : 0,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results: TestResult[] = [];
  const screenshots: string[] = [];
  let isAuthenticated = false;

  try {
    // Create a persistent context
    const context = await browser.newContext({
      viewport: viewports[0],
      acceptDownloads: false,
      ignoreHTTPSErrors: true
    });

    // STEP 1: Authenticate if credentials provided
    if (authEmail && authPassword) {
      console.log(`\n🔐 Step 1: Authentication at ${authLoginUrl}...`);
      isAuthenticated = await performAuthentication(
        context,
        previewUrl,
        authLoginUrl,
        authEmail,
        authPassword,
        debug
      );
      
      if (!isAuthenticated) {
        console.error('❌ Authentication failed! Cannot proceed with protected routes.');
        
        // Only test public routes
        const publicRoutes = routes.filter(r => 
          r.path === '/' || 
          r.path.includes('/login') || 
          r.path.includes('/public')
        );
        
        if (publicRoutes.length === 0) {
          console.error('❌ No public routes to test. Exiting.');
          await browser.close();
          process.exit(1);
        }
        
        console.log(`⚠️ Testing only public routes: ${publicRoutes.map(r => r.path).join(', ')}`);
        routes = publicRoutes;
      } else {
        console.log('✅ Authentication successful! Proceeding with all routes.');
      }
    }

    // STEP 2: Verify authentication by checking a protected route
    if (isAuthenticated && routes.length > 0) {
      console.log('\n🔍 Step 2: Verifying authentication...');
      const testPage = await context.newPage();
      
      // Find a protected route (not home or login)
      const protectedRoute = routes.find(r => 
        r.path !== '/' && 
        !r.path.includes('/login') && 
        !r.path.includes('/public')
      ) || routes[0];
      
      const testUrl = new URL(protectedRoute.path, previewUrl).href;
      await testPage.goto(testUrl, { waitUntil: 'networkidle' });
      
      const currentUrl = testPage.url();
      const wasRedirected = currentUrl.includes('/login');
      
      if (wasRedirected) {
        console.error(`❌ Authentication verification failed - redirected to login when accessing ${protectedRoute.path}`);
        isAuthenticated = false;
      } else {
        console.log(`✅ Authentication verified - successfully accessed ${protectedRoute.path}`);
      }
      
      await testPage.close();
    }

    // STEP 3: Test each route
    console.log('\n📸 Step 3: Capturing screenshots...');
    
    for (const route of routes) {
      console.log(`\n📍 Testing route: ${route.path}`);

      // Skip protected routes if not authenticated
      if (!isAuthenticated && 
          route.path !== '/' && 
          !route.path.includes('/login') && 
          !route.path.includes('/public')) {
        console.log(`  ⏭️ Skipping protected route (not authenticated)`);
        
        for (const viewport of viewports) {
          results.push({
            route: route.path,
            viewport: viewport.name,
            screenshot: '',
            status: 'skipped',
            message: 'Skipped - authentication required'
          });
        }
        continue;
      }

      for (const viewport of viewports) {
        const page = await context.newPage();
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        try {
          page.setDefaultTimeout(parseInt(timeout) * 1000);

          const fullUrl = new URL(route.path, previewUrl).href;
          
          if (debug) {
            console.log(`  🌐 Navigating to: ${fullUrl}`);
          }
          
          await page.goto(fullUrl, { waitUntil: 'networkidle' });
          
          // Check if we were redirected
          const currentUrl = page.url();
          const wasRedirectedToLogin = currentUrl.includes('/login') && !route.path.includes('/login');
          
          if (wasRedirectedToLogin) {
            console.log(`  ❌ ${viewport.name} - Unauthorized (redirected to login)`);
            
            results.push({
              route: route.path,
              viewport: viewport.name,
              screenshot: '',
              status: 'failed',
              message: 'Unauthorized - redirected to login'
            });
            
            await page.close();
            continue;
          }

          // Wait for content
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(1000);

          // Capture screenshot
          const screenshotName = `${route.path.replace(/\//g, '-')}-${viewport.name}.png`;
          const screenshotPath = path.join(process.cwd(), 'screenshots', screenshotName);
          
          fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });

          await page.screenshot({
            path: screenshotPath,
            fullPage: true
          });

          screenshots.push(screenshotPath);

          results.push({
            route: route.path,
            viewport: viewport.name,
            screenshot: screenshotPath,
            status: 'passed',
            message: 'Screenshot captured successfully'
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

    // Save authentication state if successful
    if (isAuthenticated) {
      const statePath = path.join(process.cwd(), 'auth-state.json');
      await context.storageState({ path: statePath });
      console.log(`\n💾 Saved authentication state to ${statePath}`);
    }

    // Output results
    const outputPath = path.join(process.cwd(), 'visual-test-results.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      results,
      screenshots,
      authenticated: isAuthenticated,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        failed: results.filter(r => r.status === 'failed').length,
        warnings: results.filter(r => r.status === 'warning').length,
        skipped: results.filter(r => r.status === 'skipped').length
      }
    }, null, 2));

    // Set GitHub Action output
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      fs.appendFileSync(githubOutput, `results=${JSON.stringify(results)}\n`);
      fs.appendFileSync(githubOutput, `screenshots=${JSON.stringify(screenshots)}\n`);
      fs.appendFileSync(githubOutput, `authenticated=${isAuthenticated}\n`);
    }

    const summary = results.filter(r => r.status === 'passed').length;
    console.log(`\n✅ Visual testing completed: ${summary}/${results.length} passed`);

  } catch (error) {
    console.error('❌ Visual testing failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

/**
 * Improved authentication function
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
    const loginUrl = new URL(loginPath, baseUrl).href;
    if (debug) {
      console.log(`  🌐 Navigating to login: ${loginUrl}`);
    }
    
    await page.goto(loginUrl, { waitUntil: 'networkidle' });
    
    // Wait a bit for any redirects or dynamic content
    await page.waitForTimeout(2000);
    
    // For MUI components (like Loop uses), we need different selectors
    if (debug) {
      console.log('  🔍 Looking for login form fields...');
      
      const inputs = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        return Array.from(inputs).map((input, index) => ({
          index,
          type: input.type,
          id: input.id,
          className: input.className,
          visible: input.offsetParent !== null
        }));
      });
      
      console.log(`  📋 Found ${inputs.length} input fields`);
    }
    
    // Strategy 1: Try by type first
    let emailFilled = false;
    const textInputs = await page.$$('input[type="text"], input[type="email"]');
    const visibleTextInputs = [];
    
    for (const input of textInputs) {
      if (await input.isVisible()) {
        visibleTextInputs.push(input);
      }
    }
    
    if (visibleTextInputs.length > 0) {
      if (debug) {
        console.log(`  ✅ Found ${visibleTextInputs.length} visible text inputs`);
      }
      
      // Fill the first visible text input with email
      await visibleTextInputs[0].fill(email);
      emailFilled = true;
      
      if (debug) {
        console.log(`  ✅ Filled email in first text input`);
      }
    }
    
    // Strategy 2: If no text inputs, try other selectors
    if (!emailFilled) {
      const emailSelectors = [
        'input:not([type="password"])',  // Any input that's not password
        'input[type="email"]',
        'input[name*="email"]',
        'input[name*="username"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]'
      ];
      
      for (const selector of emailSelectors) {
        try {
          const input = await page.locator(selector).first();
          if (await input.isVisible()) {
            await input.fill(email);
            emailFilled = true;
            if (debug) {
              console.log(`  ✅ Filled email using selector: ${selector}`);
            }
            break;
          }
        } catch {
          // Continue trying
        }
      }
    }
    
    if (!emailFilled) {
      throw new Error('Could not find email/username input field');
    }
    
    // Fill password
    const passwordInput = await page.locator('input[type="password"]').first();
    await passwordInput.fill(password);
    
    if (debug) {
      console.log('  ✅ Filled password');
    }
    
    // Find and click submit button
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Log in")',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("Continue")',
      'button'  // Last resort - any button
    ];
    
    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const buttons = await page.$$(selector);
        for (const button of buttons) {
          if (await button.isVisible()) {
            const text = await button.textContent();
            if (debug) {
              console.log(`  🔍 Found button: "${text}"`);
            }
            
            // Check if it's likely a submit button
            if (!text || 
                text.toLowerCase().includes('log') || 
                text.toLowerCase().includes('sign') ||
                text.toLowerCase().includes('submit') ||
                text.toLowerCase().includes('continue')) {
              await button.click();
              submitted = true;
              if (debug) {
                console.log(`  ✅ Clicked button: "${text}"`);
              }
              break;
            }
          }
        }
        if (submitted) break;
      } catch {
        // Continue trying
      }
    }
    
    if (!submitted) {
      // Try pressing Enter
      await passwordInput.press('Enter');
      if (debug) {
        console.log('  ⚠️ No submit button found, pressed Enter');
      }
    }
    
    // Wait for navigation
    try {
      await page.waitForNavigation({ 
        waitUntil: 'networkidle', 
        timeout: 10000 
      });
    } catch {
      // Navigation might not happen immediately
      await page.waitForTimeout(3000);
    }
    
    // Check if we're still on login page
    const currentUrl = page.url();
    const stillOnLogin = currentUrl.includes('/login') || currentUrl.includes('/signin');
    
    if (stillOnLogin) {
      if (debug) {
        console.log(`  ❌ Still on login page: ${currentUrl}`);
        
        // Check for error messages
        const possibleErrors = await page.evaluate(() => {
          const texts = [];
          // Look for common error elements
          const selectors = ['.error', '.alert', '[role="alert"]', '.MuiAlert-root'];
          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
              const text = el.textContent?.trim();
              if (text) texts.push(text);
            });
          });
          return texts;
        });
        
        if (possibleErrors.length > 0) {
          console.log(`  ❌ Error messages found:`, possibleErrors);
        }
      }
      
      return false;
    }
    
    // Success!
    if (debug) {
      console.log(`  ✅ Navigated to: ${currentUrl}`);
    }
    
    return true;
    
  } catch (error: any) {
    console.error(`  ❌ Authentication error: ${error.message}`);
    
    if (debug) {
      await page.screenshot({ path: 'auth-error.png', fullPage: true });
      console.log('  📸 Error screenshot saved: auth-error.png');
    }
    
    return false;
  } finally {
    await page.close();
  }
}

// Run if called directly
if (require.main === module) {
  runVisualTests().catch(console.error);
}