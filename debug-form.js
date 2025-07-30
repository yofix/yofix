#!/usr/bin/env node

const { chromium } = require('playwright');

async function debugForm() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Enable console logging
  page.on('console', msg => console.log('Browser console:', msg.text()));
  
  try {
    await page.goto('https://app.tryloop.ai');
    await page.click('text="sign-in with password instead"', { timeout: 3000 });
    await page.waitForTimeout(1000);
    
    // Check form structure
    const formInfo = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]');
      const inputs = document.querySelectorAll('input');
      
      return {
        formCount: forms.length,
        buttonCount: buttons.length,
        inputCount: inputs.length,
        formAction: forms[0]?.action || 'none',
        formMethod: forms[0]?.method || 'none',
        hasOnSubmit: forms[0]?.onsubmit ? 'yes' : 'no',
        buttons: Array.from(buttons).map(b => ({
          tag: b.tagName,
          type: b.type || 'none',
          text: b.textContent?.trim() || '',
          visible: window.getComputedStyle(b).display !== 'none'
        })),
        inputs: Array.from(inputs).map(i => ({
          type: i.type,
          name: i.name || 'none',
          id: i.id || 'none',
          required: i.required
        }))
      };
    });
    
    console.log('Form Debug Info:', JSON.stringify(formInfo, null, 2));
    
    // Try filling and submitting
    await page.fill('input[type="text"]:visible', 'hari@tryloop.ai');
    await page.fill('input[type="password"]', 'Loop@134');
    
    // Wait to see if there's any client-side validation
    await page.waitForTimeout(1000);
    
    // Check for any error messages
    const errors = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('[role="alert"], .error, .invalid, [aria-invalid="true"]');
      return Array.from(errorElements).map(e => e.textContent);
    });
    
    if (errors.length > 0) {
      console.log('Validation errors found:', errors);
    }
    
    // Try different submit methods
    console.log('\nTrying submit method 1: Enter key...');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    console.log('URL after Enter:', page.url());
    
    // Check if there's a hidden submit button or link
    const submitElements = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const submitCandidates = [];
      
      allElements.forEach(el => {
        const text = el.textContent?.toLowerCase() || '';
        const classes = el.className?.toLowerCase() || '';
        
        if (text.includes('sign') || text.includes('login') || text.includes('submit') ||
            classes.includes('submit') || classes.includes('login')) {
          submitCandidates.push({
            tag: el.tagName,
            text: el.textContent?.trim().substring(0, 50),
            classes: el.className,
            clickable: el.onclick !== null || el.hasAttribute('onclick'),
            href: el.href || 'none'
          });
        }
      });
      
      return submitCandidates;
    });
    
    console.log('\nPotential submit elements:', JSON.stringify(submitElements, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('\nKeeping browser open...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

debugForm().catch(console.error);