#!/usr/bin/env node

const { chromium } = require('playwright');
const { DOMIndexer } = require('./dist/browser-agent/core/DOMIndexer');

async function debugTryLoop() {
  console.log('🔍 Debugging TryLoop elements...\n');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  const domIndexer = new DOMIndexer();
  
  try {
    await page.goto('https://app.tryloop.ai');
    await page.waitForTimeout(2000);
    
    // Click password login if needed
    try {
      await page.click('text="sign-in with password instead"', { timeout: 3000 });
      await page.waitForTimeout(1000);
    } catch (e) {}
    
    const dom = await domIndexer.indexPage(page);
    
    console.log('📋 All input elements:');
    let inputCount = 0;
    for (const [id, element] of dom.elements) {
      if (element.tag === 'input' && element.isVisible) {
        inputCount++;
        console.log(`\n[${element.index}] Input field:`);
        console.log(`  Type: ${element.attributes.type || 'text'}`);
        console.log(`  Placeholder: ${element.attributes.placeholder || 'none'}`);
        console.log(`  Name: ${element.attributes.name || 'none'}`);
        console.log(`  Aria-label: ${element.attributes['aria-label'] || 'none'}`);
        console.log(`  Interactive: ${element.isInteractive}`);
      }
    }
    
    console.log(`\n\n📋 All button elements:`);
    let buttonCount = 0;
    for (const [id, element] of dom.elements) {
      if ((element.tag === 'button' || element.attributes.type === 'submit' || element.attributes.role === 'button') && element.isVisible) {
        buttonCount++;
        console.log(`\n[${element.index}] Button:`);
        console.log(`  Text: "${element.text || ''}"`);
        console.log(`  Type: ${element.attributes.type || 'none'}`);
        console.log(`  Role: ${element.attributes.role || 'none'}`);
        console.log(`  Position: x=${element.boundingBox.x}, y=${element.boundingBox.y}`);
      }
    }
    
    console.log(`\n\nTotal inputs: ${inputCount}, Total buttons: ${buttonCount}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

debugTryLoop().catch(console.error);