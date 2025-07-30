#!/usr/bin/env node

/**
 * Test Auto-Detection Feature
 * 
 * This script tests the login auto-detection functionality
 */

const { SmartAuthHandler } = require('./dist/github/SmartAuthHandler');
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

async function testAutoDetection() {
  console.log('🧪 Testing Login Auto-Detection...\n');

  const websites = [
    'https://github.com',
    'https://stackoverflow.com', 
    'https://reddit.com',
    'https://example.com'
  ];

  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  
  if (!claudeApiKey) {
    console.error('❌ Please set CLAUDE_API_KEY in your environment');
    process.exit(1);
  }

  for (const website of websites) {
    console.log(`🔍 Testing auto-detection for: ${website}`);
    
    try {
      const authConfig = {
        loginUrl: 'auto-detect',
        email: 'test@example.com',
        password: 'password123'
      };

      const authHandler = new SmartAuthHandler(authConfig, claudeApiKey);
      
      // Create a mock page object
      const mockPage = {
        context: () => ({ browser: () => ({}) }),
        url: () => website
      };

      // This will trigger auto-detection
      const startTime = Date.now();
      const result = await authHandler.login(mockPage, website);
      const duration = Date.now() - startTime;
      
      console.log(`  ⏱️  Duration: ${duration}ms`);
      console.log(`  ${result ? '✅' : '⚠️'} Result: ${result ? 'Success' : 'Failed'}`);
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }

  console.log('🎉 Auto-detection testing completed!');
}

if (require.main === module) {
  testAutoDetection().catch(console.error);
}

module.exports = testAutoDetection;