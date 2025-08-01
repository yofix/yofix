const { chromium } = require('playwright');
const { LLMBrowserAgent } = require('./dist/modules/llm-browser-agent');
require('dotenv').config({ path: '.env.local' });

async function testLLMOnlyAuth() {
  // MUST have a valid Claude API key
  const apiKey = process.env.CLAUDE_API_KEY;
  console.log('CLAUDE_API_KEY:', apiKey);
  if (!apiKey) {
    console.error('❌ CLAUDE_API_KEY environment variable is required');
    console.log('Please set: export CLAUDE_API_KEY="your-api-key"');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const page = await browser.newPage();

  try {
    console.log('🤖 LLM-Only Authentication Demo\n');
    console.log('This example uses ONLY Claude AI to understand and interact with the login page.\n');

    const email = 'hari@tryloop.ai';
    const password = 'Loop@134';
    const loginUrl = 'https://app.tryloop.ai/login/password';

    // Navigate to login page
    console.log('1️⃣ Navigating to login page...');
    await page.goto(loginUrl, { waitUntil: 'networkidle' });
    console.log('✅ On login page\n');

    // Create LLM agent
    const agent = new LLMBrowserAgent(apiKey);

    // Show what the LLM sees
    console.log('2️⃣ Capturing DOM snapshot for Claude...');
    const snapshot = await agent.captureDOMSnapshot(page);
    console.log(`📸 Found ${snapshot.elements.length} interactive elements\n`);
    
    console.log('Elements Claude can see:');
    snapshot.elements.slice(0, 10).forEach(el => {
      console.log(`  - ${el.tag}${el.attributes.type ? `[type="${el.attributes.type}"]` : ''} ${el.text ? `"${el.text.substring(0, 30)}..."` : ''}`);
    });
    if (snapshot.elements.length > 10) {
      console.log(`  ... and ${snapshot.elements.length - 10} more elements`);
    }

    // Create the authentication task
    const task = `Log in to this website with the following credentials:
- Email/Username: ${email}
- Password: ${password}

Find the email/username input field, fill it with the email.
Find the password input field, fill it with the password.
Click the submit/login button to complete authentication.`;

    console.log('\n3️⃣ Sending task to Claude AI...');
    console.log('Task:', task.split('\n')[0] + '...');

    // Generate actions using Claude
    const actions = await agent.generateActions(task, snapshot, true);
    
    console.log('\n4️⃣ Claude generated these actions:');
    actions.forEach((action, i) => {
      console.log(`  ${i + 1}. ${action.action}${action.selector ? ` on "${action.selector}"` : ''}${action.value ? ` with value "${action.value}"` : ''}`);
    });

    // Execute each action
    console.log('\n5️⃣ Executing Claude\'s actions...');
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      console.log(`\n  ⚡ Action ${i + 1}: ${action.action}`);
      
      try {
        await agent.executeAction(page, action);
        console.log(`  ✅ Success`);
        
        // Small delay to see the action
        await page.waitForTimeout(1000);
      } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
        throw error;
      }
    }

    // Wait for navigation
    console.log('\n6️⃣ Waiting for login to complete...');
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
    } catch {
      await page.waitForTimeout(2000);
    }

    // Check result
    const currentUrl = page.url();
    const stillOnLogin = currentUrl.includes('/login') || currentUrl.includes('/signin');
    
    if (!stillOnLogin) {
      console.log('\n✅ Authentication successful!');
      console.log(`   Now at: ${currentUrl}`);
      
      await page.screenshot({ path: 'llm-auth-success.png', fullPage: true });
      console.log('📸 Screenshot saved: llm-auth-success.png');
    } else {
      console.log('\n❌ Still on login page - authentication may have failed');
      console.log(`   Current URL: ${currentUrl}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('401') || error.message.includes('authentication_error')) {
      console.log('\n⚠️  This appears to be an API key issue.');
      console.log('Please ensure you have a valid Claude API key set in CLAUDE_API_KEY environment variable.');
    }
  }

  console.log('\n⏸️  Browser will remain open for 30 seconds...');
  await page.waitForTimeout(30000);

  await browser.close();
}

// Run the test
console.log('==================================================');
console.log('       LLM-Only Authentication Test');
console.log('==================================================\n');

testLLMOnlyAuth().catch(console.error);