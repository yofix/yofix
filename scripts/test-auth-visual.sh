#!/bin/bash

# Test authentication in visual mode (headed browser)
# Run with: ./scripts/test-auth-visual.sh

set -e

echo "🔐 YoFix Authentication Test - Visual Mode"
echo "=========================================="
echo ""

# Test configuration
TEST_URL="${TEST_URL:-https://app.tryloop.ai}"
TEST_EMAIL="${TEST_EMAIL:-hari@tryloop.ai}"
TEST_PASSWORD="${TEST_PASSWORD:-Loop@134}"
TEST_LOGIN_URL="${TEST_LOGIN_URL:-/login/password}"

# Create a test script that runs visual-tester with headed browser
cat > test-visual-headed.js << 'EOF'
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testAuth() {
  const browser = await chromium.launch({
    headless: false,  // Run in headed mode
    slowMo: 500,      // Slow down by 500ms to see what's happening
    devtools: false   // Open devtools if needed
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    console.log('🌐 Navigating to login page...');
    const loginUrl = new URL(process.env.TEST_LOGIN_URL, process.env.TEST_URL).href;
    console.log(`   URL: ${loginUrl}`);
    
    await page.goto(loginUrl, { waitUntil: 'networkidle' });
    
    console.log('⏳ Waiting for page to load...');
    await page.waitForTimeout(2000);
    
    // Take screenshot of login page
    await page.screenshot({ path: 'login-page.png', fullPage: true });
    console.log('📸 Screenshot saved: login-page.png');
    
    // Debug: Print all input fields found
    console.log('\n🔍 Searching for input fields...');
    
    const inputs = await page.evaluate(() => {
      const allInputs = document.querySelectorAll('input');
      return Array.from(allInputs).map(input => ({
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        className: input.className,
        isVisible: input.offsetParent !== null
      }));
    });
    
    console.log('Found inputs:', JSON.stringify(inputs, null, 2));
    
    // Try different selectors
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="username" i]',
      'input[id*="email" i]',
      'input[id*="username" i]',
      'input[type="text"]'  // Last resort
    ];
    
    let emailInput = null;
    for (const selector of emailSelectors) {
      console.log(`\nTrying selector: ${selector}`);
      try {
        const elements = await page.$$(selector);
        console.log(`  Found ${elements.length} elements`);
        
        for (const element of elements) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            console.log(`  ✅ Found visible element with selector: ${selector}`);
            emailInput = element;
            break;
          }
        }
        
        if (emailInput) break;
      } catch (e) {
        console.log(`  ❌ Error with selector: ${e.message}`);
      }
    }
    
    if (!emailInput) {
      console.log('\n❌ Could not find email input field');
      console.log('\n📄 Page HTML structure:');
      const forms = await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        return Array.from(forms).map(form => form.outerHTML.substring(0, 500) + '...');
      });
      console.log('Forms found:', forms);
    } else {
      console.log('\n✅ Found email input, filling form...');
      await emailInput.fill(process.env.TEST_EMAIL);
      
      // Find password field
      const passwordInput = await page.locator('input[type="password"]').first();
      await passwordInput.fill(process.env.TEST_PASSWORD);
      
      // Take screenshot before submit
      await page.screenshot({ path: 'login-filled.png', fullPage: true });
      console.log('📸 Screenshot saved: login-filled.png');
      
      // Find submit button
      console.log('\n🔍 Looking for submit button...');
      const submitButton = await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
      
      console.log('🖱️ Clicking submit...');
      await submitButton.click();
      
      // Wait for navigation
      await page.waitForNavigation({ waitUntil: 'networkidle' });
      
      console.log('✅ Navigation complete');
      console.log(`   Current URL: ${page.url()}`);
      
      // Take screenshot after login
      await page.screenshot({ path: 'after-login.png', fullPage: true });
      console.log('📸 Screenshot saved: after-login.png');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Take error screenshot
    await page.screenshot({ path: 'error-state.png', fullPage: true });
    console.log('📸 Error screenshot saved: error-state.png');
  }
  
  console.log('\n⏸️  Browser will stay open for 10 seconds...');
  await page.waitForTimeout(10000);
  
  await browser.close();
}

// Set up environment
process.env.TEST_URL = '$TEST_URL';
process.env.TEST_EMAIL = '$TEST_EMAIL';
process.env.TEST_PASSWORD = '$TEST_PASSWORD';
process.env.TEST_LOGIN_URL = '$TEST_LOGIN_URL';

testAuth().catch(console.error);
EOF

echo "Running visual test with headed browser..."
echo ""
echo "Configuration:"
echo "  URL: $TEST_URL"
echo "  Login URL: $TEST_LOGIN_URL"
echo "  Email: $TEST_EMAIL"
echo ""

# Install playwright if needed
if ! npm list playwright >/dev/null 2>&1; then
  echo "Installing playwright..."
  npm install playwright
fi

# Run the visual test
node test-visual-headed.js

# Clean up
rm test-visual-headed.js

echo ""
echo "Screenshots saved:"
ls -la *.png 2>/dev/null || echo "No screenshots found"

echo ""
echo "To view screenshots:"
echo "  open login-page.png"
echo "  open login-filled.png"
echo "  open after-login.png"