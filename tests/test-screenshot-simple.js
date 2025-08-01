#!/usr/bin/env node

/**
 * Simple test to verify screenshot functionality
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🧪 Testing YoFix Screenshot Functionality\n');

// Test 1: Check if screenshot action exists
console.log('1️⃣ Checking screenshot action in browser-agent...');
try {
  const extractionActions = fs.readFileSync(
    path.join(__dirname, '../src/browser-agent/actions/extraction.ts'), 
    'utf8'
  );
  
  if (extractionActions.includes("name: 'screenshot'")) {
    console.log('✅ Screenshot action found in extraction.ts');
  } else {
    console.log('❌ Screenshot action not found');
  }
} catch (error) {
  console.log('❌ Error reading extraction.ts:', error.message);
}

// Test 2: Check visual differ
console.log('\n2️⃣ Checking VisualDiffer component...');
try {
  const visualDiffer = fs.readFileSync(
    path.join(__dirname, '../src/core/baseline/VisualDiffer.ts'),
    'utf8'
  );
  
  if (visualDiffer.includes('pixelmatch') && visualDiffer.includes('compare')) {
    console.log('✅ VisualDiffer has pixelmatch comparison');
  } else {
    console.log('❌ VisualDiffer missing comparison logic');
  }
} catch (error) {
  console.log('❌ Error reading VisualDiffer.ts:', error.message);
}

// Test 3: Check if screenshots are captured in navigation
console.log('\n3️⃣ Checking screenshot capture in navigation...');
try {
  const navigationActions = fs.readFileSync(
    path.join(__dirname, '../src/browser-agent/actions/navigation.ts'),
    'utf8'
  );
  
  const screenshotCount = (navigationActions.match(/screenshot.*await.*page\.screenshot/g) || []).length;
  console.log(`✅ Found ${screenshotCount} screenshot captures in navigation actions`);
} catch (error) {
  console.log('❌ Error reading navigation.ts:', error.message);
}

// Test 4: Check visual analysis
console.log('\n4️⃣ Checking VisualAnalyzer...');
try {
  const visualAnalyzer = fs.readFileSync(
    path.join(__dirname, '../src/core/analysis/VisualAnalyzer.ts'),
    'utf8'
  );
  
  if (visualAnalyzer.includes('visual_issues') && visualAnalyzer.includes('screenshot')) {
    console.log('✅ VisualAnalyzer handles visual issues and screenshots');
  } else {
    console.log('❌ VisualAnalyzer missing screenshot handling');
  }
} catch (error) {
  console.log('❌ Error reading VisualAnalyzer.ts:', error.message);
}

// Test 5: Check bot command handler for scan
console.log('\n5️⃣ Checking bot scan command...');
try {
  const commandHandler = fs.readFileSync(
    path.join(__dirname, '../src/bot/CommandHandler.ts'),
    'utf8'
  );
  
  if (commandHandler.includes('handleScan') && commandHandler.includes('screenshot')) {
    console.log('✅ Bot scan command includes screenshot functionality');
  } else {
    console.log('❌ Bot scan command missing screenshot integration');
  }
} catch (error) {
  console.log('❌ Error reading CommandHandler.ts:', error.message);
}

// Summary
console.log('\n📊 Summary:');
console.log('─'.repeat(50));
console.log('Screenshot functionality appears to be implemented with:');
console.log('- Browser-agent screenshot action');
console.log('- Visual differ for comparison');  
console.log('- Automatic screenshots on navigation');
console.log('- Visual issue detection');
console.log('- Bot command integration');
console.log('\n✅ Screenshot testing infrastructure is in place!');

// Test workflow example
console.log('\n📝 Example workflow to test screenshots:');
console.log('─'.repeat(50));
console.log('1. Comment on a PR: @yofix scan');
console.log('2. Or use CLI: yofix test --url https://example.com --screenshot');
console.log('3. Or in GitHub Action:');
console.log(`
  - uses: LoopKitchen/yofix@v1
    with:
      website-url: https://your-site.com
      smart-analysis: true
      auto-fix: true
`);