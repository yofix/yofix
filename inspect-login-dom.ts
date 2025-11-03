#!/usr/bin/env node

/**
 * DOM Inspector for Login Forms
 * Shows what selectors are available and which approach works best
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';

dotenv.config();

const LOGIN_URL = 'https://app.tryloop.ai/login/password';

async function inspectLoginDOM() {
  console.log('🔍 Login Form DOM Inspector\n');
  console.log(`📍 URL: ${LOGIN_URL}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    // Wait for form to be visible
    await page.waitForTimeout(2000);

    console.log('='.repeat(80));
    console.log('EMAIL INPUT FIELDS:');
    console.log('='.repeat(80));

    // Find all possible email inputs
    const emailInputs = await page.locator('input[type="email"], input[type="text"], input[placeholder*="email" i], input[aria-label*="email" i]').all();

    for (let i = 0; i < emailInputs.length; i++) {
      const input = emailInputs[i];
      const attrs = {
        id: await input.getAttribute('id'),
        name: await input.getAttribute('name'),
        type: await input.getAttribute('type'),
        placeholder: await input.getAttribute('placeholder'),
        'aria-label': await input.getAttribute('aria-label'),
        class: await input.getAttribute('class'),
        value: await input.inputValue()
      };

      console.log(`\n[${i + 1}] Email Input:`);
      console.log(JSON.stringify(attrs, null, 2));

      // Try to build selectors
      console.log('\nPossible selectors:');
      if (attrs.id) console.log(`  - #${attrs.id}`);
      if (attrs.name) console.log(`  - input[name="${attrs.name}"]`);
      if (attrs.type) console.log(`  - input[type="${attrs.type}"]`);
      if (attrs.placeholder) console.log(`  - input[placeholder="${attrs.placeholder}"]`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('PASSWORD INPUT FIELDS:');
    console.log('='.repeat(80));

    const passwordInputs = await page.locator('input[type="password"]').all();

    for (let i = 0; i < passwordInputs.length; i++) {
      const input = passwordInputs[i];
      const attrs = {
        id: await input.getAttribute('id'),
        name: await input.getAttribute('name'),
        type: await input.getAttribute('type'),
        placeholder: await input.getAttribute('placeholder'),
        'aria-label': await input.getAttribute('aria-label'),
        class: await input.getAttribute('class'),
        value: await input.inputValue()
      };

      console.log(`\n[${i + 1}] Password Input:`);
      console.log(JSON.stringify(attrs, null, 2));

      console.log('\nPossible selectors:');
      if (attrs.id) console.log(`  - #${attrs.id}`);
      if (attrs.name) console.log(`  - input[name="${attrs.name}"]`);
      if (attrs.placeholder) console.log(`  - input[placeholder="${attrs.placeholder}"]`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUBMIT BUTTONS:');
    console.log('='.repeat(80));

    const buttons = await page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Login")').all();

    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      const attrs = {
        id: await button.getAttribute('id'),
        type: await button.getAttribute('type'),
        class: await button.getAttribute('class'),
        text: await button.textContent()
      };

      console.log(`\n[${i + 1}] Button:`);
      console.log(JSON.stringify(attrs, null, 2));

      console.log('\nPossible selectors:');
      if (attrs.id) console.log(`  - #${attrs.id}`);
      if (attrs.type) console.log(`  - button[type="${attrs.type}"]`);
      if (attrs.text) console.log(`  - button:has-text("${attrs.text?.trim()}")`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('FORM STRUCTURE:');
    console.log('='.repeat(80));

    const forms = await page.locator('form').all();
    console.log(`\nTotal forms found: ${forms.length}`);

    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      const attrs = {
        id: await form.getAttribute('id'),
        action: await form.getAttribute('action'),
        method: await form.getAttribute('method'),
        class: await form.getAttribute('class')
      };

      console.log(`\n[${i + 1}] Form:`);
      console.log(JSON.stringify(attrs, null, 2));
    }

    console.log('\n' + '='.repeat(80));
    console.log('ACCESSIBILITY TREE (Login relevant elements):');
    console.log('='.repeat(80));

    // Get accessibility snapshot
    const snapshot = await page.accessibility.snapshot();
    console.log('\nAccessibility tree:');
    console.log(JSON.stringify(snapshot, null, 2));

    console.log('\n' + '='.repeat(80));
    console.log('\n⏸️  Browser will remain open for inspection...');
    console.log('Press Ctrl+C to close\n');

    // Keep browser open for manual inspection
    await new Promise(() => {});

  } catch (error) {
    console.error('\n❌ Inspection failed:', error);
    await page.screenshot({ path: 'inspect-failed.png' });
    process.exit(1);
  } finally {
    // Don't close - let user inspect
  }
}

inspectLoginDOM().catch(console.error);
