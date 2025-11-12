#!/usr/bin/env node

/**
 * Test Configuration Fixes
 * Verifies that all configuration variables are properly passed from
 * action.yml INPUT_* env vars to the external packages
 */

// Simulate GitHub Actions composite action environment
process.env.INPUT_CLAUDE_API_KEY = 'sk-test-key-12345678';
process.env.INPUT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
process.env.INPUT_VIEWPORTS = '1920x1080,768x1024';
process.env.INPUT_STORAGE_BUCKET = 'test-bucket';
process.env.INPUT_FIREBASE_CREDENTIALS = 'test-credentials';
process.env.INPUT_STORAGE_PROVIDER = 'firebase';
process.env.INPUT_AUTH_EMAIL = 'test@example.com';
process.env.INPUT_AUTH_PASSWORD = 'test-password';

console.log('━'.repeat(60));
console.log('🧪 Testing Configuration Fix');
console.log('━'.repeat(60));
console.log('\n📝 Environment variables set:');
console.log('  INPUT_CLAUDE_API_KEY:', process.env.INPUT_CLAUDE_API_KEY.substring(0, 15) + '...');
console.log('  INPUT_CLAUDE_MODEL:', process.env.INPUT_CLAUDE_MODEL);
console.log('  INPUT_VIEWPORTS:', process.env.INPUT_VIEWPORTS);
console.log('  INPUT_STORAGE_BUCKET:', process.env.INPUT_STORAGE_BUCKET);

console.log('\n🔍 Testing ConfigurationManager...');

// Load and test ConfigurationManager
const {ConfigurationManager} = require('./dist/index.js');

// Prevent the actual workflow from running
if (ConfigurationManager) {
  const config = ConfigurationManager.getInstance();

  const tests = [
    ['claude-api-key', process.env.INPUT_CLAUDE_API_KEY],
    ['claude-model', process.env.INPUT_CLAUDE_MODEL],
    ['viewports', process.env.INPUT_VIEWPORTS],
    ['storage-bucket', process.env.INPUT_STORAGE_BUCKET],
    ['storage-provider', process.env.INPUT_STORAGE_PROVIDER],
    ['auth-email', process.env.INPUT_AUTH_EMAIL],
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach(([key, expected]) => {
    const value = config.get(key);
    const success = value === expected;

    if (success) {
      console.log(`  ✅ ${key}: ${value === expected ? 'PASS' : 'FAIL'}`);
      passed++;
    } else {
      console.log(`  ❌ ${key}: Expected "${expected}", got "${value}"`);
      failed++;
    }
  });

  console.log('\n' + '━'.repeat(60));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('✅ All configuration tests passed!');
    console.log('━'.repeat(60));
    process.exit(0);
  } else {
    console.log('❌ Some configuration tests failed');
    console.log('━'.repeat(60));
    process.exit(1);
  }
} else {
  console.log('❌ ConfigurationManager not found in exports');
  process.exit(1);
}
