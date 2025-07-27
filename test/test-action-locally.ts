#!/usr/bin/env ts-node
/**
 * Local testing script for the GitHub Action
 * Usage: yarn test:action:local
 */

import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Load test environment
dotenv.config({ path: '.env.test' });

interface TestConfig {
  previewUrl: string;
  firebaseCredentials: string;
  storageBucket: string;
  githubToken: string;
  claudeApiKey: string;
  prNumber?: number;
}

async function testAction() {
  console.log('🧪 Testing @tryloop/visual-test Action Locally\n');

  // Validate environment
  const config: TestConfig = {
    previewUrl: process.env.TEST_PREVIEW_URL || 'https://react-vite-demo.vercel.app',
    firebaseCredentials: process.env.FE_FIREBASE_SERVICE_ACCOUNT_ARBOREAL_VISION_339901 || '',
    storageBucket: process.env.FE_VAR_FIREBASE_STORAGE_BUCKET || 'test-bucket',
    githubToken: process.env.YOFIX_GITHUB_TOKEN || '',
    claudeApiKey: process.env.CLAUDE_API_KEY || '',
    prNumber: parseInt(process.env.TEST_PR_NUMBER || '1'),
  };

  // Check required secrets
  const missing = [];
  if (!config.firebaseCredentials) missing.push('FE_FIREBASE_SERVICE_ACCOUNT_ARBOREAL_VISION_339901');
  if (!config.claudeApiKey) missing.push('CLAUDE_API_KEY');
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(m => console.error(`   - ${m}`));
    console.error('\nCopy .env.test.example to .env.test and fill in your values');
    process.exit(1);
  }

  console.log('📋 Test Configuration:');
  console.log(`   Preview URL: ${config.previewUrl}`);
  console.log(`   Storage Bucket: ${config.storageBucket}`);
  console.log(`   PR Number: ${config.prNumber}`);
  console.log(`   Claude API: ${config.claudeApiKey.substring(0, 10)}...`);
  console.log();

  // Create a mock GitHub event
  const mockEvent = {
    action: 'opened',
    number: config.prNumber,
    pull_request: {
      number: config.prNumber,
      head: {
        sha: 'test-sha',
        ref: 'test-branch',
      },
      base: {
        sha: 'main-sha',
        ref: 'main',
      },
    },
  };

  // Set up environment for the action
  process.env.GITHUB_EVENT_NAME = 'pull_request';
  process.env.GITHUB_EVENT_PATH = '/tmp/event.json';
  process.env.GITHUB_REPOSITORY = 'test-org/test-repo';
  process.env.GITHUB_WORKSPACE = process.cwd();
  process.env.GITHUB_ACTION = 'test';
  process.env.GITHUB_ACTOR = 'test-user';
  process.env.GITHUB_SHA = 'test-sha';
  process.env.GITHUB_REF = 'refs/pull/1/merge';

  // Set inputs
  process.env['INPUT_PREVIEW-URL'] = config.previewUrl;
  process.env['INPUT_FIREBASE-CREDENTIALS'] = config.firebaseCredentials;
  process.env['INPUT_STORAGE-BUCKET'] = config.storageBucket;
  process.env['INPUT_GITHUB-TOKEN'] = config.githubToken;
  process.env['INPUT_CLAUDE-API-KEY'] = config.claudeApiKey;

  // Write mock event
  fs.writeFileSync('/tmp/event.json', JSON.stringify(mockEvent));

  console.log('🚀 Running action...\n');

  try {
    // Run the built action
    execSync('node dist/index.js', {
      stdio: 'inherit',
      env: process.env,
    });
    
    console.log('\n✅ Action completed successfully!');
  } catch (error) {
    console.error('\n❌ Action failed:', error);
    process.exit(1);
  }
}

// Run the test
testAction().catch(console.error);