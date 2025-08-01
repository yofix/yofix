const { chromium } = require('playwright');
const { executeAuthStrategies } = require('./dist/modules/auth-strategies');

async function testAuthVerification() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 300
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🔐 Testing Authentication and Route Verification...\n');

    const email = 'hari@tryloop.ai';
    const password = 'Loop@134';
    const loginUrl = 'https://app.tryloop.ai/login/password';

    // Navigate to login page
    console.log('1️⃣ Navigating to login page...');
    await page.goto(loginUrl, { waitUntil: 'networkidle' });
    console.log('✅ On login page');

    // Authenticate using smart strategies
    console.log('\n2️⃣ Authenticating...');
    const authSuccess = await executeAuthStrategies(page, email, password, true);
    
    if (!authSuccess) {
      console.error('❌ Authentication failed');
      return;
    }
    
    console.log('✅ Authentication successful!');
    console.log(`   Current URL: ${page.url()}`);
    
    // Wait a bit for the app to fully load
    console.log('\n3️⃣ Waiting for app to stabilize...');
    await page.waitForTimeout(3000);
    
    // Now navigate to /home
    console.log('\n4️⃣ Navigating to /home route...');
    const homeUrl = 'https://app.tryloop.ai/home';
    
    try {
      await page.goto(homeUrl, { waitUntil: 'networkidle', timeout: 60000 });
      console.log('✅ Successfully navigated to /home');
      console.log(`   Current URL: ${page.url()}`);
      
      // Take a screenshot
      await page.screenshot({ path: 'home-route-verified.png', fullPage: true });
      console.log('📸 Screenshot saved: home-route-verified.png');
      
      // Check if we were redirected
      const currentUrl = page.url();
      if (currentUrl !== homeUrl) {
        console.log(`⚠️  Note: Was redirected from /home to ${currentUrl}`);
      }
      
    } catch (error) {
      console.error('❌ Failed to navigate to /home:', error.message);
      
      // Check current state
      const currentUrl = page.url();
      console.log(`   Current URL: ${currentUrl}`);
      
      // Take debug screenshot
      await page.screenshot({ path: 'home-route-error.png', fullPage: true });
      console.log('📸 Debug screenshot saved: home-route-error.png');
    }
    
    // Try to discover actual routes
    console.log('\n5️⃣ Discovering available routes...');
    
    // Look for navigation links
    const navLinks = await page.evaluate(() => {
      const links = [];
      // Common selectors for navigation
      const selectors = [
        'nav a',
        'aside a',
        '[role="navigation"] a',
        '.sidebar a',
        '.menu a',
        'a[href^="/"]'
      ];
      
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(link => {
          const href = link.getAttribute('href');
          const text = link.textContent?.trim();
          if (href && !href.startsWith('#') && !href.startsWith('http')) {
            links.push({ href, text });
          }
        });
      });
      
      // Remove duplicates
      const unique = [];
      const seen = new Set();
      links.forEach(link => {
        if (!seen.has(link.href)) {
          seen.add(link.href);
          unique.push(link);
        }
      });
      
      return unique;
    });
    
    if (navLinks.length > 0) {
      console.log('📍 Found navigation links:');
      navLinks.forEach(link => {
        console.log(`   - ${link.href} (${link.text || 'no text'})`);
      });
    } else {
      console.log('⚠️  No navigation links found');
    }

  } catch (error) {
    console.error('Error:', error);
  }

  console.log('\n⏸️  Browser will remain open for 30 seconds...');
  await page.waitForTimeout(30000);

  await browser.close();
}

testAuthVerification().catch(console.error);