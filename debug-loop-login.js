const { chromium } = require('playwright');

async function debugLogin() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000
  });

  const page = await browser.newPage();
  
  console.log('🌐 Navigating to Loop login page...');
  await page.goto('https://app.tryloop.ai/login/password');
  
  // Wait for page to load
  await page.waitForTimeout(3000);
  
  // Debug all inputs
  const inputs = await page.evaluate(() => {
    const allInputs = document.querySelectorAll('input');
    const forms = document.querySelectorAll('form');
    
    return {
      inputCount: allInputs.length,
      formCount: forms.length,
      inputs: Array.from(allInputs).map(input => ({
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        className: input.className,
        ariaLabel: input.getAttribute('aria-label'),
        visible: input.offsetParent !== null,
        value: input.value
      })),
      forms: Array.from(forms).map(form => ({
        id: form.id,
        className: form.className,
        action: form.action,
        method: form.method
      }))
    };
  });
  
  console.log('\n📊 Page Analysis:');
  console.log(`Forms found: ${inputs.formCount}`);
  console.log(`Inputs found: ${inputs.inputCount}`);
  console.log('\n🔍 Input details:');
  inputs.inputs.forEach((input, i) => {
    console.log(`\nInput ${i + 1}:`);
    console.log(`  Type: ${input.type}`);
    console.log(`  Name: ${input.name}`);
    console.log(`  ID: ${input.id}`);
    console.log(`  Placeholder: ${input.placeholder}`);
    console.log(`  Class: ${input.className}`);
    console.log(`  Aria Label: ${input.ariaLabel}`);
    console.log(`  Visible: ${input.visible}`);
  });
  
  // Try to find email/password fields with more flexible selectors
  console.log('\n🔐 Attempting to fill login form...');
  
  // Look for any text input that might be email/username
  const textInputs = await page.$$('input[type="text"], input[type="email"]');
  console.log(`Found ${textInputs.length} text/email inputs`);
  
  if (textInputs.length > 0) {
    console.log('Filling first text input with email...');
    await textInputs[0].fill('hari@tryloop.ai');
  }
  
  // Look for password input
  const passwordInputs = await page.$$('input[type="password"]');
  console.log(`Found ${passwordInputs.length} password inputs`);
  
  if (passwordInputs.length > 0) {
    console.log('Filling password input...');
    await passwordInputs[0].fill('Loop@134');
  }
  
  // Take screenshot
  await page.screenshot({ path: 'loop-login-debug.png', fullPage: true });
  console.log('\n📸 Screenshot saved: loop-login-debug.png');
  
  console.log('\n⏸️  Browser will remain open for inspection...');
  console.log('Press Ctrl+C to close');
  
  // Keep browser open
  await page.waitForTimeout(60000);
  
  await browser.close();
}

debugLogin().catch(console.error);