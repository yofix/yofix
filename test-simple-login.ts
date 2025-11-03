#!/usr/bin/env node

/**
 * Simple, fast, deterministic login test
 * Industry best practice: Use Playwright directly for known forms
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';

dotenv.config();

const AUTH_EMAIL = process.env.AUTH_EMAIL || 'hari@tryloop.ai';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'Loop@134';
const LOGIN_URL = 'https://app.tryloop.ai/login/password';

async function simpleLogin() {
  console.log('🚀 Simple Login Test - Industry Best Practice');
  console.log(`📍 URL: ${LOGIN_URL}`);
  console.log('⏱️  Expected time: 2-3 seconds\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    const startTime = Date.now();

    // Step 1: Navigate to login page
    console.log('1️⃣  Navigating to login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    // Step 2: Fill email using multiple strategies
    console.log('2️⃣  Filling email field...');
    try {
      // Try by placeholder first
      await page.fill('input[placeholder*="email" i]', AUTH_EMAIL);
    } catch {
      try {
        // Try by type
        await page.fill('input[type="email"]', AUTH_EMAIL);
      } catch {
        // Try by aria-label
        await page.fill('input[aria-label*="email" i]', AUTH_EMAIL);
      }
    }

    // Step 3: Fill password
    console.log('3️⃣  Filling password field...');
    await page.fill('input[type="password"]', AUTH_PASSWORD);

    // Step 4: Click submit
    console.log('4️⃣  Clicking submit...');
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")').first();
    await submitButton.click();

    // Step 5: Wait for navigation away from login page
    console.log('5️⃣  Waiting for authentication...');
    await page.waitForURL(url => !url.includes('/login'), {
      timeout: 10000
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log('\n✅ Login successful!');
    console.log(`⏱️  Total time: ${duration.toFixed(2)}s`);
    console.log(`📍 Final URL: ${page.url()}`);

    // Take a screenshot
    console.log('\n📸 Taking screenshot...');
    await page.screenshot({ path: 'login-success.png', fullPage: false });
    console.log('✅ Screenshot saved to: login-success.png');

    // Wait to inspect
    console.log('\n⏸️  Browser will remain open for 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error) {
    console.error('\n❌ Login failed:', error.message);
    await page.screenshot({ path: 'login-failed.png' });
    console.log('📸 Error screenshot saved to: login-failed.png');
    process.exit(1);
  } finally {
    await browser.close();
  }
}

simpleLogin().catch(console.error);
