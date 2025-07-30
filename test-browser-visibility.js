#!/usr/bin/env node

/**
 * Test browser visibility
 * 
 * Quick script to verify browser window shows up properly
 */

const { Agent } = require('./dist/browser-agent/core/Agent');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment
const envLocal = path.join(__dirname, '.env.local');
if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else {
  dotenv.config();
}

async function testBrowserVisibility() {
  console.log('🧪 Testing Browser Visibility...\n');
  
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ Please set CLAUDE_API_KEY in your environment');
    process.exit(1);
  }

  console.log('1️⃣  Creating browser agent with headless: false');
  const agent = new Agent('Navigate to https://example.com and wait for the page to load', {
    headless: false,
    maxSteps: 3,
    llmProvider: 'anthropic',
    viewport: { width: 1920, height: 1080 }
  });

  process.env.ANTHROPIC_API_KEY = apiKey;

  try {
    console.log('2️⃣  Initializing browser...');
    await agent.initialize();
    
    console.log('3️⃣  Browser should now be visible!');
    console.log('    👀 Look for a browser window on your screen');
    
    console.log('4️⃣  Running agent task...');
    const result = await agent.run();
    
    if (result.success) {
      console.log('✅ Browser task completed successfully!');
      console.log(`   Final URL: ${result.finalUrl}`);
      console.log(`   Steps taken: ${result.steps.length}`);
    } else {
      console.log('❌ Task failed:', result.error);
    }
    
    console.log('\n5️⃣  Keeping browser open for 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('6️⃣  Cleaning up...');
    await agent.cleanup();
    
    console.log('\n✅ Test completed! Did you see the browser window?');
    
  } catch (error) {
    console.error('❌ Error during test:', error);
    await agent.cleanup();
  }
}

if (require.main === module) {
  testBrowserVisibility().catch(console.error);
}

module.exports = testBrowserVisibility;