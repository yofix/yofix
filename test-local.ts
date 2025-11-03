#!/usr/bin/env node

/**
 * Local test script for YoFix browser agent
 * Tests against app.tryloop.ai with authentication
 */

import { TestGenerator } from './src/core/testing/TestGenerator';
import { Agent } from './src/browser-agent/core/Agent';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
const AUTH_EMAIL = process.env.AUTH_EMAIL || 'hari@tryloop.ai';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'Loop@134';

if (!CLAUDE_API_KEY) {
  console.error('❌ Error: CLAUDE_API_KEY environment variable is required');
  console.error('   Set it in .env file or export CLAUDE_API_KEY=sk-...');
  process.exit(1);
}

async function testBrowserAgent() {
  console.log('🚀 YoFix Local Test');
  console.log(`📍 Testing against: https://app.tryloop.ai`);
  console.log(`🤖 Using model: ${CLAUDE_MODEL}`);
  console.log('');

  try {
    // Test simple authentication
    const authTask = `Authenticate using llm_login with email="${AUTH_EMAIL}" password="${AUTH_PASSWORD}" loginUrl="https://app.tryloop.ai/login/password".`;

    console.log('🔐 Testing authentication...');
    const agent = new Agent(authTask, {
      headless: false, // Show browser for debugging
      maxSteps: 10,
      llmProvider: 'anthropic',
      llmModel: CLAUDE_MODEL,
      viewport: { width: 1920, height: 1080 },
      apiKey: CLAUDE_API_KEY,
      debug: true
    });

    await agent.initialize();
    const result = await agent.run();

    console.log('');
    console.log('📊 Test Result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Steps: ${result.stepsCompleted}`);
    console.log(`   Duration: ${result.duration}ms`);

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    // Get final state
    const state = agent.getState();
    console.log(`   Final URL: ${state.currentUrl}`);
    console.log(`   Memory entries: ${state.memory.size}`);

    // Keep browser open for inspection if failed
    if (!result.success) {
      console.log('');
      console.log('⏸️  Browser will remain open for 30 seconds for inspection...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    await agent.cleanup();

    if (!result.success) {
      process.exit(1);
    }

    console.log('');
    console.log('✅ Test completed successfully!');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testBrowserAgent().catch(console.error);
