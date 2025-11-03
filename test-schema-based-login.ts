#!/usr/bin/env node

/**
 * Test: Schema-Based Login (Hybrid Approach)
 *
 * ARCHITECTURE:
 * 1. Analyze React source code ONCE using Claude (intelligent)
 * 2. Generate login schema with all selectors
 * 3. Save schema to Firebase/S3 (like visual baselines)
 * 4. Use schema for FAST deterministic login (no LLM calls)
 *
 * BENEFITS:
 * - Intelligence: LLM understands React code structure
 * - Speed: 2-3s login (vs 10-15s with llm_login)
 * - Reliable: Uses test IDs, names, semantic labels
 * - Cacheable: Schema reused across CI/CD runs
 * - Maintainable: Regenerate when code changes
 */

import { LoginSchemaGenerator, LoginSchema } from './src/browser-agent/schemas/LoginSchemaGenerator';
import { SchemaBasedLoginAction } from './src/browser-agent/actions/SchemaBasedLoginAction';
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const AUTH_EMAIL = process.env.AUTH_EMAIL || 'hari@tryloop.ai';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'Loop@134';
const LOGIN_URL = 'https://app.tryloop.ai/login/password';

// React source files to analyze - MUST include all component dependencies
const SOURCE_FILES = [
  path.resolve(__dirname, '../loop-frontend/src/pages/public/Login/LoginWithPassword.tsx'),
  path.resolve(__dirname, '../loop-frontend/src/pages/public/Login/LoginForm.tsx'),
  path.resolve(__dirname, '../loop-frontend/src/forms/CustomInput.tsx') // CRITICAL: Understand wrapper structure
];

async function testSchemaBasedLogin() {
  console.log('🧪 Schema-Based Login Test\n');
  console.log('ARCHITECTURE:');
  console.log('  1. Analyze React source (Claude - ONCE)');
  console.log('  2. Generate schema with selectors');
  console.log('  3. Save to storage (Firebase/S3)');
  console.log('  4. Fast deterministic login (NO LLM)\n');

  if (!CLAUDE_API_KEY) {
    console.error('❌ CLAUDE_API_KEY required');
    process.exit(1);
  }

  // Phase 1: Generate schema from source code
  console.log('='.repeat(80));
  console.log('PHASE 1: SCHEMA GENERATION (One-time, intelligent)');
  console.log('='.repeat(80));

  const generator = new LoginSchemaGenerator(CLAUDE_API_KEY);

  const schemaGenStart = Date.now();
  const schema: LoginSchema = await generator.generateFromSource(SOURCE_FILES, {
    loginUrl: LOGIN_URL,
    model: 'claude-sonnet-4-5-20250929'
  });
  const schemaGenDuration = Date.now() - schemaGenStart;

  console.log(`\n⏱️  Schema generation took: ${(schemaGenDuration / 1000).toFixed(2)}s`);
  console.log(`📊 Schema contains:`);
  console.log(`   - Email selectors: ${schema.fields.email.length}`);
  console.log(`   - Password selectors: ${schema.fields.password.length}`);
  console.log(`   - Submit selectors: ${schema.submit.length}`);
  console.log(`\n📋 Email selectors (priority order):`);
  schema.fields.email.forEach((sel, i) => {
    console.log(`   ${i + 1}. [${sel.type}] ${sel.value} - ${sel.description}`);
  });

  // Save schema for inspection
  await generator.saveSchema(schema, '.yofix-cache/login-schema.json');

  // Phase 2: Use schema for fast login
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 2: FAST DETERMINISTIC LOGIN (No LLM)');
  console.log('='.repeat(80));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // Create action with schema
    const loginAction = new SchemaBasedLoginAction(schema);

    const loginStart = Date.now();
    const result = await loginAction.execute(page, {
      email: AUTH_EMAIL,
      password: AUTH_PASSWORD,
      loginUrl: LOGIN_URL
    });
    const loginDuration = Date.now() - loginStart;

    if (result.success) {
      console.log('\n' + '='.repeat(80));
      console.log('✅ SUCCESS');
      console.log('='.repeat(80));
      console.log(`⏱️  Login duration: ${(loginDuration / 1000).toFixed(2)}s`);
      console.log(`📍 Final URL: ${result.data.finalUrl}`);
      console.log(`📦 Schema version: ${result.data.schemaVersion}`);

      console.log('\n📊 PERFORMANCE COMPARISON:');
      console.log(`   Schema generation: ${(schemaGenDuration / 1000).toFixed(2)}s (ONE-TIME)`);
      console.log(`   Schema-based login: ${(loginDuration / 1000).toFixed(2)}s (EVERY TIME)`);
      console.log(`   Traditional LLM login: ~10-15s (EVERY TIME)`);
      console.log(`\n💡 Speedup: ${((10000 / loginDuration)).toFixed(1)}x faster than LLM login!`);

      // Take screenshot
      await page.screenshot({ path: 'schema-login-success.png', fullPage: false });
      console.log(`📸 Screenshot: schema-login-success.png`);

      // Wait for inspection
      console.log('\n⏸️  Browser will remain open for 10 seconds...');
      await new Promise(resolve => setTimeout(resolve, 10000));

    } else {
      console.error('\n❌ Login failed:', result.error);
      await page.screenshot({ path: 'schema-login-failed.png' });
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await page.screenshot({ path: 'schema-test-failed.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }

  console.log('\n' + '='.repeat(80));
  console.log('🎯 NEXT STEPS:');
  console.log('='.repeat(80));
  console.log('1. Integrate LoginSchemaManager with Firebase/S3 storage');
  console.log('2. Add schema_login action to ActionRegistry');
  console.log('3. Use in GitHub Actions workflow:');
  console.log('   - First run: Generate schema, save to storage');
  console.log('   - Subsequent runs: Load from storage, fast login');
  console.log('4. Auto-regenerate when source files change');
  console.log('5. Share schemas across CI/CD runs');
}

testSchemaBasedLogin().catch(console.error);
