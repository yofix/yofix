#!/usr/bin/env node

/**
 * Smart Login Test - DOM Intelligence Approach
 * Uses semantic structure (labels, headings, accessibility tree) instead of hardcoded selectors
 * This is the RIGHT way to handle "any login page" dynamically
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';

dotenv.config();

const AUTH_EMAIL = process.env.AUTH_EMAIL || 'hari@tryloop.ai';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'Loop@134';
const LOGIN_URL = 'https://app.tryloop.ai/login/password';

/**
 * Find input by associated label/heading text
 * This uses DOM semantics, not hardcoded selectors
 */
async function findInputByLabel(page: any, labelText: string, inputType: string = 'text') {
  // Strategy 1: Standard <label> with for= attribute
  let input = await page.locator(`label:has-text("${labelText}")`).locator('..').locator(`input[type="${inputType}"]`).first();
  if (await input.count() > 0) return input;

  // Strategy 2: <label> wrapping input
  input = await page.locator(`label:has-text("${labelText}") input[type="${inputType}"]`).first();
  if (await input.count() > 0) return input;

  // Strategy 3: Heading followed by input (MUI pattern)
  // Find heading with text, then find next input sibling
  const heading = page.locator(`:is(h1, h2, h3, h4, h5, h6):has-text("${labelText}")`).first();
  if (await heading.count() > 0) {
    // Find the input that comes after this heading
    input = heading.locator(`~ *`).locator(`input[type="${inputType}"]`).first();
    if (await input.count() > 0) return input;

    // Try parent's next sibling (for nested structures)
    input = heading.locator('..').locator('~*').locator(`input[type="${inputType}"]`).first();
    if (await input.count() > 0) return input;
  }

  // Strategy 4: Accessibility tree - look for any container with the label text that contains an input
  input = page.locator(`:is(div, fieldset, section):has-text("${labelText}")`).locator(`input[type="${inputType}"]`).first();
  if (await input.count() > 0) return input;

  throw new Error(`Could not find input for label "${labelText}"`);
}

async function smartLogin() {
  console.log('🧠 Smart Login Test - DOM Intelligence');
  console.log(`📍 URL: ${LOGIN_URL}`);
  console.log('⏱️  Expected time: 2-3 seconds');
  console.log('🎯 Uses semantic structure, not hardcoded selectors\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    const startTime = Date.now();

    // Step 1: Navigate
    console.log('1️⃣  Navigating to login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    // Wait for content to render
    await page.waitForTimeout(1000);

    // Step 2: Find email field using semantic structure
    console.log('2️⃣  Finding email field (using label "Email")...');
    const emailInput = await findInputByLabel(page, 'Email', 'text');
    await emailInput.fill(AUTH_EMAIL);
    console.log(`    ✓ Found and filled email field`);

    // Step 3: Find password field using semantic structure
    console.log('3️⃣  Finding password field (using label "Password")...');
    const passwordInput = await findInputByLabel(page, 'Password', 'password');
    await passwordInput.fill(AUTH_PASSWORD);
    console.log(`    ✓ Found and filled password field`);

    // Step 4: Find submit button by text
    console.log('4️⃣  Finding submit button...');
    // Try multiple common button texts
    const submitButton = page.locator('button:has-text("LOGIN"), button:has-text("Log in"), button:has-text("Sign in"), button[type="submit"]').first();
    await submitButton.click();
    console.log(`    ✓ Clicked submit button`);

    // Step 5: Wait for navigation
    console.log('5️⃣  Waiting for authentication...');
    await page.waitForURL(url => !url.toString().includes('/login'), {
      timeout: 10000
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log('\n✅ Login successful!');
    console.log(`⏱️  Total time: ${duration.toFixed(2)}s`);
    console.log(`📍 Final URL: ${page.url()}`);

    // Take screenshot
    console.log('\n📸 Taking screenshot...');
    await page.screenshot({ path: 'smart-login-success.png', fullPage: false });
    console.log('✅ Screenshot saved to: smart-login-success.png');

    // Wait to inspect
    console.log('\n⏸️  Browser will remain open for 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error: any) {
    console.error('\n❌ Login failed:', error.message);
    await page.screenshot({ path: 'smart-login-failed.png' });
    console.log('📸 Error screenshot saved to: smart-login-failed.png');
    process.exit(1);
  } finally {
    await browser.close();
  }
}

smartLogin().catch(console.error);
