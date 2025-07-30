#!/usr/bin/env node

/**
 * Test script for smart actions
 */

const { chromium } = require('playwright');
const { DOMIndexer } = require('./dist/browser-agent/core/DOMIndexer');
const { ContextAwareElementFinder } = require('./dist/browser-agent/core/ContextAwareElementFinder');

async function testSmartActions() {
  console.log('🧪 Testing Smart Actions...\n');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const domIndexer = new DOMIndexer();
  const elementFinder = new ContextAwareElementFinder();
  
  try {
    // Test 1: TryLoop login page
    console.log('📍 Test 1: TryLoop Login Page');
    await page.goto('https://app.tryloop.ai');
    await page.waitForTimeout(2000);
    
    // Click "sign in with password" if present
    try {
      await page.click('text="sign-in with password instead"', { timeout: 3000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('Already on password login page');
    }
    
    // Index the DOM
    const dom = await domIndexer.indexPage(page);
    console.log(`Found ${dom.elements.size} elements, ${dom.interactiveElements.length} interactive\n`);
    
    // Test email field detection
    console.log('🔍 Finding email field...');
    const emailResult = await elementFinder.findFormField(dom, 'email');
    if (emailResult) {
      console.log(`✅ Found email field with ${emailResult.confidence}% confidence`);
      console.log(`   Reasons: ${emailResult.reasons.join(', ')}`);
      console.log(`   Element: [${emailResult.element.index}] ${emailResult.element.tag}`);
    } else {
      console.log('❌ Could not find email field');
    }
    
    // Test password field detection
    console.log('\n🔍 Finding password field...');
    const passwordResult = await elementFinder.findFormField(dom, 'password');
    if (passwordResult) {
      console.log(`✅ Found password field with ${passwordResult.confidence}% confidence`);
      console.log(`   Reasons: ${passwordResult.reasons.join(', ')}`);
      console.log(`   Element: [${passwordResult.element.index}] ${passwordResult.element.tag}`);
    } else {
      console.log('❌ Could not find password field');
    }
    
    // Test submit button detection
    console.log('\n🔍 Finding submit button...');
    const submitResult = await elementFinder.findSubmitButton(dom);
    if (submitResult) {
      console.log(`✅ Found submit button with ${submitResult.confidence}% confidence`);
      console.log(`   Reasons: ${submitResult.reasons.join(', ')}`);
      console.log(`   Element: [${submitResult.element.index}] ${submitResult.element.tag} "${submitResult.element.text}"`);
    } else {
      console.log('❌ Could not find submit button');
    }
    
    // Test 2: Google login page
    console.log('\n\n📍 Test 2: Google Login Page');
    await page.goto('https://accounts.google.com');
    await page.waitForTimeout(2000);
    
    const googleDom = await domIndexer.indexPage(page);
    console.log(`Found ${googleDom.elements.size} elements, ${googleDom.interactiveElements.length} interactive\n`);
    
    // Test email field detection on Google
    console.log('🔍 Finding email field on Google...');
    const googleEmailResult = await elementFinder.findFormField(googleDom, 'email');
    if (googleEmailResult) {
      console.log(`✅ Found email field with ${googleEmailResult.confidence}% confidence`);
      console.log(`   Reasons: ${googleEmailResult.reasons.join(', ')}`);
    } else {
      console.log('❌ Could not find email field');
    }
    
    // Test submit button on Google
    console.log('\n🔍 Finding submit button on Google...');
    const googleSubmitResult = await elementFinder.findSubmitButton(googleDom);
    if (googleSubmitResult) {
      console.log(`✅ Found submit button with ${googleSubmitResult.confidence}% confidence`);
      console.log(`   Reasons: ${googleSubmitResult.reasons.join(', ')}`);
      console.log(`   Element: "${googleSubmitResult.element.text}"`);
    } else {
      console.log('❌ Could not find submit button');
    }
    
    console.log('\n✅ Tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

// Run tests
testSmartActions().catch(console.error);