const { chromium } = require('playwright');
const { executeAuthStrategies } = require('./dist/modules/auth-strategies');

async function testSmartAuth() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🔐 Testing Smart Authentication Strategies...\n');

    const email = process.env.TEST_EMAIL || 'hari@tryloop.ai';
    const password = process.env.TEST_PASSWORD || 'Loop@134';
    const loginUrl = 'https://app.tryloop.ai/login/password';

    console.log('Configuration:');
    console.log(`  URL: ${loginUrl}`);
    console.log(`  Email: ${email}`);
    console.log('');

    // Navigate to login page
    await page.goto(loginUrl, { waitUntil: 'networkidle' });
    console.log('✅ Navigated to login page');

    // Test authentication strategies
    const success = await executeAuthStrategies(
      page,
      email,
      password,
      true // debug mode
    );

    if (success) {
      console.log('\n✅ Authentication successful!');
      console.log(`Current URL: ${page.url()}`);
      
      // Take a screenshot of the authenticated page
      await page.screenshot({ path: 'authenticated-page.png', fullPage: true });
      console.log('📸 Screenshot saved: authenticated-page.png');
    } else {
      console.log('\n❌ All authentication strategies failed');
      
      // Take debug screenshot
      await page.screenshot({ path: 'debug-login-page.png', fullPage: true });
      console.log('📸 Debug screenshot saved: debug-login-page.png');
    }

  } catch (error) {
    console.error('Error:', error);
  }

  console.log('\n⏸️  Browser will remain open for 30 seconds...');
  await page.waitForTimeout(30000);

  await browser.close();
}

testSmartAuth().catch(console.error);