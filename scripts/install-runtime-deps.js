#!/usr/bin/env node

/**
 * Install runtime dependencies for YoFix GitHub Action
 * This script is called by the GitHub Action to install native modules
 * that were externalized during the build process
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('📦 Installing YoFix runtime dependencies...');

// Check if we're running as a GitHub Action
const isGitHubAction = process.env.GITHUB_ACTIONS === 'true';

if (isGitHubAction) {
  console.log('🔍 Detected GitHub Actions environment');
  
  // Install native modules that were externalized
  const nativeModules = [
    'tree-sitter',
    'tree-sitter-typescript', 
    'tree-sitter-javascript',
    'sharp'
  ];
  
  try {
    console.log('📥 Installing native modules...');
    execSync(`npm install ${nativeModules.join(' ')} --no-save --production`, {
      stdio: 'inherit',
      cwd: __dirname + '/..'
    });
    console.log('✅ Runtime dependencies installed successfully');
  } catch (error) {
    console.error('❌ Failed to install runtime dependencies:', error.message);
    process.exit(1);
  }
} else {
  console.log('ℹ️  Not running in GitHub Actions, skipping runtime dependency installation');
}