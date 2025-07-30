#!/usr/bin/env node

/**
 * Browser Check Script
 * Verifies that Playwright browsers are properly installed
 */

const { chromium } = require('playwright');

async function checkBrowser() {
  console.log('🔍 Checking Playwright browser installation...\n');

  try {
    console.log('1️⃣ Attempting to launch browser...');
    const browser = await chromium.launch({ 
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    console.log('✅ Browser launched successfully!');
    console.log('🖥️  You should see a browser window now.\n');
    
    console.log('2️⃣ Creating new page...');
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log('3️⃣ Navigating to example.com...');
    await page.goto('https://example.com');
    
    console.log('✅ Navigation successful!');
    console.log('⏳ Keeping browser open for 5 seconds...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('4️⃣ Closing browser...');
    await browser.close();
    
    console.log('\n✅ All checks passed! Playwright is properly installed.');
    
  } catch (error) {
    console.error('❌ Browser check failed:', error.message);
    console.log('\n🔧 To fix this issue:');
    console.log('1. Install Playwright browsers:');
    console.log('   npx playwright install chromium');
    console.log('');
    console.log('2. If on a server without display:');
    console.log('   xvfb-run node playground.js');
    console.log('');
    console.log('3. On macOS, you might need to allow the browser in Security & Privacy settings.');
  }
}

if (require.main === module) {
  checkBrowser().catch(console.error);
}

module.exports = checkBrowser;