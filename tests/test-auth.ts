#!/usr/bin/env ts-node
/**
 * Test authentication flow
 */

import { chromium } from 'playwright';
import { AuthHandler } from '../src/auth-handler';

async function testAuth() {
  console.log('🧪 Testing Authentication Flow\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Test with tryloop.ai
  const authHandler = new AuthHandler({
    loginUrl: '/login/password',
    email: 'hari@tryloop.ai',
    password: 'Loop@134'
  });

  try {
    console.log('📍 Testing with https://app.tryloop.ai');
    
    const loginSuccess = await authHandler.login(page, 'https://app.tryloop.ai');
    
    if (loginSuccess) {
      console.log('✅ Login successful!');
      
      // Try navigating to a protected route
      await page.goto('https://app.tryloop.ai/dashboard', { waitUntil: 'networkidle' });
      console.log('📊 Successfully navigated to dashboard');
      
      // Take screenshot
      await page.screenshot({ path: 'test-auth-success.png', fullPage: true });
      console.log('📸 Screenshot saved: test-auth-success.png');
      
      // Test logout
      await authHandler.logout(page);
      console.log('🚪 Logout completed');
    } else {
      console.log('❌ Login failed');
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

testAuth();