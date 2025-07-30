#!/usr/bin/env node

/**
 * Fast Browser Playground - Simplified for speed
 */

const { chromium } = require('playwright');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const envLocal = path.join(__dirname, '.env.local');
const envDefault = path.join(__dirname, '.env');

if (require('fs').existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (require('fs').existsSync(envDefault)) {
  dotenv.config({ path: envDefault });
}

async function runFastLogin() {
  console.log('🚀 Fast Login Test\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    console.log('1️⃣  Navigating to TryLoop...');
    await page.goto('https://app.tryloop.ai');
    
    // Click password login if visible
    try {
      await page.click('text="sign-in with password instead"', { timeout: 3000 });
      console.log('✅ Clicked password login link');
    } catch (e) {
      console.log('📍 Already on password login page');
    }
    
    // Wait for page to be ready
    await page.waitForTimeout(1000);
    
    console.log('\n2️⃣  Filling login form...');
    
    // Find and fill email field - using multiple strategies
    console.log('   Finding email field...');
    const emailFilled = await fillEmailField(page, 'hari@tryloop.ai');
    if (!emailFilled) {
      throw new Error('Could not find email field');
    }
    
    // Find and fill password field
    console.log('   Finding password field...');
    await page.fill('input[type="password"]', 'Loop@134');
    console.log('   ✅ Password entered');
    
    console.log('\n3️⃣  Submitting form...');
    
    // Try multiple submit strategies
    const submitted = await submitForm(page);
    if (!submitted) {
      throw new Error('Could not submit form');
    }
    
    // Wait for navigation
    console.log('   ⏳ Waiting for login to complete...');
    await page.waitForTimeout(3000);
    
    // Check if login was successful
    const currentUrl = page.url();
    console.log(`\n📍 Current URL: ${currentUrl}`);
    
    if (!currentUrl.includes('login')) {
      console.log('✅ Login successful!');
      
      // Try to find username
      try {
        const username = await page.textContent('text=/hari/i') || 
                        await page.textContent('text=/Hari/i') ||
                        await page.textContent('[aria-label*="user"]');
        
        if (username) {
          console.log(`👤 Found username: ${username}`);
        }
      } catch (e) {
        console.log('Could not extract username');
      }
    } else {
      console.log('❌ Still on login page - login may have failed');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n⏸️  Keeping browser open for observation...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

async function fillEmailField(page, email) {
  // Strategy 1: First visible text input
  try {
    const inputs = await page.$$('input[type="text"]:visible, input[type="email"]:visible');
    if (inputs.length > 0) {
      await inputs[0].fill(email);
      console.log('   ✅ Email entered (first input)');
      return true;
    }
  } catch (e) {}
  
  // Strategy 2: Input by type=email
  try {
    await page.fill('input[type="email"]', email);
    console.log('   ✅ Email entered (type=email)');
    return true;
  } catch (e) {}
  
  // Strategy 3: First input before password
  try {
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      const allInputs = await page.$$('input');
      for (let i = 0; i < allInputs.length - 1; i++) {
        const input = allInputs[i];
        const nextInput = allInputs[i + 1];
        const nextType = await nextInput.getAttribute('type');
        
        if (nextType === 'password') {
          await input.fill(email);
          console.log('   ✅ Email entered (input before password)');
          return true;
        }
      }
    }
  } catch (e) {}
  
  return false;
}

async function submitForm(page) {
  // Strategy 1: Click LOGIN button specifically
  try {
    await page.click('button:has-text("LOGIN")', { timeout: 2000 });
    console.log('   ✅ Clicked LOGIN button');
    return true;
  } catch (e) {
    console.log('   ⚠️  Could not find LOGIN button');
  }
  
  // Strategy 2: Press Enter in password field
  try {
    await page.press('input[type="password"]', 'Enter');
    console.log('   ✅ Pressed Enter in password field');
    return true;
  } catch (e) {
    console.log('   ⚠️  Could not press Enter in password field');
  }
  
  // Strategy 3: Click any visible button that looks like submit
  try {
    const buttons = await page.$$('button:visible');
    for (const button of buttons) {
      const text = await button.textContent();
      if (text && (text.includes('LOGIN') || text.includes('SIGN') || text.includes('SUBMIT'))) {
        await button.click();
        console.log(`   ✅ Clicked button: ${text}`);
        return true;
      }
    }
  } catch (e) {
    console.log('   ⚠️  No suitable buttons found');
  }
  
  // Strategy 3: Submit the form directly
  try {
    await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      if (forms.length > 0) {
        forms[0].submit();
      }
    });
    console.log('   ✅ Submitted form directly');
    return true;
  } catch (e) {
    console.log('   ⚠️  Could not submit form directly');
  }
  
  return false;
}

// Check if API key is set
if (!process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.log('⚡ Running in direct mode (no AI needed for this test)\n');
}

// Run the fast login test
runFastLogin().catch(console.error);