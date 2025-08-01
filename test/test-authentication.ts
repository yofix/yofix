#!/usr/bin/env ts-node

/**
 * Test script for authentication flow
 * Run with: yarn ts-node test/test-authentication.ts
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Test configuration
const TEST_CONFIG = {
  // Test with a real app (change to your test app)
  previewUrl: process.env.TEST_URL || 'https://app.tryloop.ai',
  authEmail: process.env.TEST_EMAIL || 'test@example.com',
  authPassword: process.env.TEST_PASSWORD || 'test-password',
  authLoginUrl: process.env.TEST_LOGIN_URL || '/login/password',
  
  // Test both modules
  testModules: ['route-extractor', 'visual-tester']
};

async function runTest(moduleName: string) {
  console.log(`\n🧪 Testing ${moduleName}...`);
  
  const modulePath = path.join(__dirname, '..', 'dist', 'modules', `${moduleName}.js`);
  
  // Set up environment variables
  const env = {
    ...process.env,
    INPUT_PREVIEW_URL: TEST_CONFIG.previewUrl,
    INPUT_AUTH_EMAIL: TEST_CONFIG.authEmail,
    INPUT_AUTH_PASSWORD: TEST_CONFIG.authPassword,
    INPUT_AUTH_LOGIN_URL: TEST_CONFIG.authLoginUrl,
    INPUT_DEBUG: 'true',
    INPUT_MAX_ROUTES: '5',
    INPUT_VIEWPORTS: '1920x1080',
    INPUT_TEST_TIMEOUT: '30s'
  };
  
  // For visual tester, we need routes
  if (moduleName === 'visual-tester') {
    // Use routes from previous test or default
    const routesPath = path.join(process.cwd(), 'routes.json');
    if (fs.existsSync(routesPath)) {
      const routes = fs.readFileSync(routesPath, 'utf-8');
      env.INPUT_ROUTES = routes;
    } else {
      env.INPUT_ROUTES = JSON.stringify([
        { path: '/', title: 'Home' },
        { path: '/dashboard', title: 'Dashboard' }
      ]);
    }
  }
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', [modulePath], { env, stdio: 'inherit' });
    
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`✅ ${moduleName} test passed`);
        resolve(true);
      } else {
        console.error(`❌ ${moduleName} test failed with code ${code}`);
        reject(new Error(`Test failed with code ${code}`));
      }
    });
    
    child.on('error', (err) => {
      console.error(`❌ Failed to run ${moduleName}:`, err);
      reject(err);
    });
  });
}

async function testAuthentication() {
  console.log('🚀 YoFix Authentication Test Suite');
  console.log('==================================');
  console.log(`URL: ${TEST_CONFIG.previewUrl}`);
  console.log(`Login URL: ${TEST_CONFIG.authLoginUrl}`);
  console.log(`Email: ${TEST_CONFIG.authEmail}`);
  
  try {
    // First, build the project
    console.log('\n📦 Building YoFix...');
    await new Promise((resolve, reject) => {
      const build = spawn('yarn', ['build'], { stdio: 'inherit' });
      build.on('exit', (code) => code === 0 ? resolve(true) : reject(new Error('Build failed')));
    });
    
    // Test each module
    for (const module of TEST_CONFIG.testModules) {
      await runTest(module);
    }
    
    // Check outputs
    console.log('\n📋 Checking outputs...');
    
    // Check routes.json
    const routesPath = path.join(process.cwd(), 'routes.json');
    if (fs.existsSync(routesPath)) {
      const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
      console.log(`✅ Found ${routes.length} routes:`, routes.map(r => r.path).join(', '));
    }
    
    // Check screenshots
    const screenshotsDir = path.join(process.cwd(), 'screenshots');
    if (fs.existsSync(screenshotsDir)) {
      const screenshots = fs.readdirSync(screenshotsDir);
      console.log(`✅ Created ${screenshots.length} screenshots:`, screenshots.join(', '));
    }
    
    // Check auth state
    const authStatePath = path.join(process.cwd(), 'auth-state.json');
    if (fs.existsSync(authStatePath)) {
      console.log('✅ Authentication state saved');
    }
    
    console.log('\n🎉 All tests passed!');
    
  } catch (error) {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  }
}

// Clean up function
function cleanup() {
  console.log('\n🧹 Cleaning up test artifacts...');
  
  const artifacts = [
    'routes.json',
    'visual-test-results.json',
    'auth-state.json',
    'screenshots'
  ];
  
  for (const artifact of artifacts) {
    const artifactPath = path.join(process.cwd(), artifact);
    if (fs.existsSync(artifactPath)) {
      if (fs.lstatSync(artifactPath).isDirectory()) {
        fs.rmSync(artifactPath, { recursive: true });
      } else {
        fs.unlinkSync(artifactPath);
      }
      console.log(`  Removed ${artifact}`);
    }
  }
}

// Run tests
if (require.main === module) {
  // Clean up before tests
  cleanup();
  
  // Run tests
  testAuthentication().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
  
  // Note: In real scenario, you might want to clean up after tests too
  // But keeping artifacts can be useful for debugging
}