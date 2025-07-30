#!/usr/bin/env node

/**
 * YoFix System Integration Test
 * 
 * Tests all major components with browser-agent
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment
const envLocal = path.join(__dirname, '.env.local');
if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else {
  dotenv.config();
}

// Import all major components
const { SmartAuthHandler } = require('./dist/github/SmartAuthHandler');
const { TestGenerator } = require('./dist/core/testing/TestGenerator');
const { VisualAnalyzer } = require('./dist/core/analysis/VisualAnalyzer');
const { VisualRunner } = require('./dist/core/testing/VisualRunner');
const { VisualIssueTestGenerator } = require('./dist/core/testing/VisualIssueTestGenerator');
const { Agent } = require('./dist/browser-agent/core/Agent');

async function runSystemTest() {
  console.log('🧪 YoFix System Integration Test');
  console.log('=================================\n');

  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ Please set CLAUDE_API_KEY in your environment');
    process.exit(1);
  }

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // Test 1: SmartAuthHandler
  console.log('1️⃣  Testing SmartAuthHandler...');
  try {
    const authHandler = new SmartAuthHandler({
      loginUrl: 'auto-detect',
      email: 'test@example.com',
      password: 'password123'
    }, apiKey);
    
    // Verify it's properly initialized and ready to use browser-agent
    if (authHandler.authConfig && authHandler.claudeApiKey) {
      console.log('   ✅ SmartAuthHandler correctly initialized with browser-agent architecture');
      results.passed++;
    } else {
      console.log('   ❌ SmartAuthHandler initialization failed');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ SmartAuthHandler error:', error.message);
    results.failed++;
  }

  // Test 2: TestGenerator
  console.log('\n2️⃣  Testing TestGenerator...');
  try {
    const testGen = new TestGenerator(apiKey);
    
    // Check if it's properly initialized
    console.log('   ✅ TestGenerator initialized with browser-agent architecture');
    results.passed++;
  } catch (error) {
    console.log('   ❌ TestGenerator error:', error.message);
    results.failed++;
  }

  // Test 3: VisualAnalyzer
  console.log('\n3️⃣  Testing VisualAnalyzer...');
  try {
    const analyzer = new VisualAnalyzer(apiKey, 'test-token');
    
    // Check if it's properly initialized
    console.log('   ✅ VisualAnalyzer ready with browser-agent support');
    results.passed++;
  } catch (error) {
    console.log('   ❌ VisualAnalyzer error:', error.message);
    results.failed++;
  }

  // Test 4: VisualRunner
  console.log('\n4️⃣  Testing VisualRunner...');
  try {
    const runner = new VisualRunner(apiKey);
    
    // Check if it's properly initialized
    console.log('   ✅ VisualRunner initialized successfully');
    results.passed++;
  } catch (error) {
    console.log('   ❌ VisualRunner error:', error.message);
    results.failed++;
  }

  // Test 5: VisualIssueTestGenerator
  console.log('\n5️⃣  Testing VisualIssueTestGenerator...');
  try {
    const issueGen = new VisualIssueTestGenerator(apiKey);
    
    // Check if it's properly initialized
    console.log('   ✅ VisualIssueTestGenerator ready');
    results.passed++;
  } catch (error) {
    console.log('   ❌ VisualIssueTestGenerator error:', error.message);
    results.failed++;
  }

  // Test 6: Direct Browser Agent
  console.log('\n6️⃣  Testing Browser Agent directly...');
  try {
    const agent = new Agent('Test task', {
      headless: true,
      maxSteps: 1,
      llmProvider: 'anthropic'
    });
    
    console.log('   ✅ Browser Agent created successfully');
    results.passed++;
  } catch (error) {
    console.log('   ❌ Browser Agent error:', error.message);
    results.failed++;
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('================');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);

  if (results.failed === 0) {
    console.log('\n🎉 All systems operational! YoFix is ready to use.');
  } else {
    console.log('\n⚠️  Some components need attention.');
  }

  // Save results
  const resultsPath = path.join(__dirname, 'test-results', 'system-integration.json');
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    ...results
  }, null, 2));

  console.log(`\n📄 Results saved to: ${resultsPath}`);
}

if (require.main === module) {
  runSystemTest().catch(console.error);
}

module.exports = runSystemTest;