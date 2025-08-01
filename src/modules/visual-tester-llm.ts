#!/usr/bin/env node

/**
 * Visual Tester Module with LLM-powered authentication
 * Uses natural language understanding for robust authentication
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateWithLLM } from './llm-browser-agent';

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
  
  // Claude API key for LLM authentication
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
    slowMo: debug ? 300 : 0,
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

    // Perform authentication if credentials provided
    if (authEmail && authPassword) {
      console.log(`\n🤖 Using LLM-powered authentication...`);
      
      const loginFullUrl = new URL(authLoginUrl, previewUrl).href;
      
      // Try LLM authentication first
      if (claudeApiKey) {
        isAuthenticated = await authenticateWithLLM(
          await context.newPage(),
          authEmail,
          authPassword,
          loginFullUrl,
          claudeApiKey,
          debug
        );
      } else {
        console.log('⚠️ No Claude API key provided, authentication may fail');
      }
      
      if (!isAuthenticated) {
        console.error('❌ Authentication failed!');
        
        // Test only public routes
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
        console.log('✅ Authentication successful!');
      }
    }

    // Test each route
    console.log('\n📸 Capturing screenshots...');
    
    for (const route of routes) {
      console.log(`\n📍 Testing route: ${route.path}`);

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
          
          // Check if we were redirected to login
          const currentUrl = page.url();
          const wasRedirectedToLogin = currentUrl.includes('/login') && !route.path.includes('/login');
          
          if (wasRedirectedToLogin && authEmail && authPassword) {
            console.log(`  ⚠️ ${viewport.name} - Session expired, re-authenticating...`);
            
            // Try to re-authenticate using LLM
            if (claudeApiKey) {
              const reAuth = await authenticateWithLLM(
                page,
                authEmail,
                authPassword,
                undefined, // Already on login page
                claudeApiKey,
                debug
              );
              
              if (reAuth) {
                // Navigate back to the intended route
                await page.goto(fullUrl, { waitUntil: 'networkidle' });
              }
            }
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
      authMethod: claudeApiKey ? 'llm' : 'none',
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

// Run if called directly
if (require.main === module) {
  runVisualTests().catch(console.error);
}