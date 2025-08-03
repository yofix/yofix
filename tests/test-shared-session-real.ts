#!/usr/bin/env ts-node

/**
 * Real integration test for shared browser session
 * This actually runs Playwright and tests real websites
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

async function testRealSharedSession() {
  console.log('🧪 Real Integration Test: Shared Browser Session with Playwright\n');
  
  const testUrl = 'https://www.w3.org';
  const routes = ['/', '/standards/', '/participate/'];
  const screenshotDir = path.join(process.cwd(), 'test-results');
  
  // Create test-results directory
  try {
    await fs.mkdir(screenshotDir, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }
  
  console.log('📌 Test 1: Independent Sessions (Old Behavior)\n');
  const independentStart = Date.now();
  
  for (let i = 0; i < routes.length; i++) {
    const routeStart = Date.now();
    console.log(`Route ${i + 1}: ${routes[i]}`);
    
    // Create new browser for each route
    console.log('  - Creating browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    
    // Navigate and test
    console.log(`  - Navigating to ${testUrl}${routes[i]}...`);
    await page.goto(`${testUrl}${routes[i]}`);
    
    // Take screenshot with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const screenshotPath = path.join(screenshotDir, `independent-route${i + 1}-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  - Screenshot saved: ${path.basename(screenshotPath)}`);
    
    // Get page title
    const title = await page.title();
    console.log(`  - Page title: "${title}"`);
    
    // Close browser
    console.log('  - Closing browser...');
    await browser.close();
    
    const routeTime = Date.now() - routeStart;
    console.log(`  - Route completed in ${routeTime}ms\n`);
  }
  
  const independentTime = Date.now() - independentStart;
  console.log(`Total time (independent): ${independentTime}ms\n`);
  
  console.log('📌 Test 2: Shared Session (New Behavior)\n');
  const sharedStart = Date.now();
  
  // Create browser once
  console.log('Initial setup:');
  console.log('  - Creating browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  console.log('  - Browser ready\n');
  
  // Test all routes with same browser
  for (let i = 0; i < routes.length; i++) {
    const routeStart = Date.now();
    console.log(`Route ${i + 1}: ${routes[i]}`);
    
    // Navigate and test (no browser creation needed)
    console.log(`  - Navigating to ${testUrl}${routes[i]}...`);
    await page.goto(`${testUrl}${routes[i]}`);
    
    // Take screenshot with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const screenshotPath = path.join(screenshotDir, `shared-route${i + 1}-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  - Screenshot saved: ${path.basename(screenshotPath)}`);
    
    // Get page title
    const title = await page.title();
    console.log(`  - Page title: "${title}"`);
    
    const routeTime = Date.now() - routeStart;
    console.log(`  - Route completed in ${routeTime}ms\n`);
  }
  
  // Close browser once at the end
  console.log('Cleanup:');
  console.log('  - Closing browser...');
  await browser.close();
  
  const sharedTime = Date.now() - sharedStart;
  console.log(`\nTotal time (shared): ${sharedTime}ms\n`);
  
  // Summary
  console.log('📊 REAL PERFORMANCE COMPARISON:\n');
  console.log(`Independent sessions: ${independentTime}ms`);
  console.log(`Shared session: ${sharedTime}ms`);
  console.log(`Time saved: ${independentTime - sharedTime}ms (${Math.round((1 - sharedTime/independentTime) * 100)}% faster)\n`);
  
  console.log('📸 Screenshots saved in:', screenshotDir);
  console.log('\n✅ Real integration test completed!');
}

// Test with authentication simulation
async function testAuthenticatedSession() {
  console.log('\n\n🔐 Test 3: Authenticated Session Simulation\n');
  
  const loginUrl = 'https://example.com/login';
  const protectedRoutes = ['/dashboard', '/profile', '/settings'];
  
  console.log('Simulating authenticated route testing...\n');
  
  // Independent sessions
  console.log('❌ Independent: Each route requires login');
  for (const route of protectedRoutes) {
    console.log(`  - Navigate to ${loginUrl}`);
    console.log('  - Fill login form');
    console.log('  - Submit and wait for auth');
    console.log(`  - Navigate to ${route}`);
    console.log('  - Take screenshot\n');
  }
  
  // Shared session
  console.log('✅ Shared: Login once, test all routes');
  console.log(`  - Navigate to ${loginUrl}`);
  console.log('  - Fill login form');
  console.log('  - Submit and wait for auth');
  for (const route of protectedRoutes) {
    console.log(`  - Navigate to ${route} (already authenticated)`);
    console.log('  - Take screenshot');
  }
  
  console.log('\n🎯 Key benefit: Authentication happens only once!');
}

// Run all tests
async function runAllTests() {
  try {
    await testRealSharedSession();
    await testAuthenticatedSession();
    
    console.log('\n\n🎉 All tests completed successfully!');
    console.log('\n💡 To test with your own app:');
    console.log('1. Update the testUrl to your application');
    console.log('2. Add authentication credentials if needed');
    console.log('3. Update routes to match your app structure');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runAllTests().catch(console.error);