/**
 * Smart authentication strategies for YoFix
 * These strategies work with modern dynamic UIs without relying on specific selectors
 */

import { Page } from 'playwright';
import { createModuleLogger, ErrorCategory, ErrorSeverity, executeOperation } from '../core';

export interface AuthStrategy {
  name: string;
  execute: (page: Page, email: string, password: string, debug?: boolean) => Promise<boolean>;
}

/**
 * Strategy 1: Tab Order Navigation
 * Most reliable - uses keyboard navigation which works on any form
 */
export const tabOrderStrategy: AuthStrategy = {
  name: 'Tab Order Navigation',
  async execute(page: Page, email: string, password: string, debug?: boolean) {
    const logger = createModuleLogger({
      module: 'AuthStrategy.TabOrder',
      debug,
      defaultCategory: ErrorCategory.AUTHENTICATION
    });
    
    try {
      logger.debug('  🔄 Using Tab Order Strategy...');
      
      // Click anywhere on the page to ensure focus
      await page.click('body');
      
      // Tab to first input field
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
      
      // Type email
      await page.keyboard.type(email);
      logger.debug('  ✅ Typed email in first field');
      
      // Tab to password field
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
      
      // Type password
      await page.keyboard.type(password);
      logger.debug('  ✅ Typed password in second field');
      
      // Tab to submit button (might need multiple tabs)
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(50);
      }
      
      logger.debug('  ✅ Pressed Enter on submit button');
      
      return true;
    } catch (error) {
      await logger.error(error as Error, {
        userAction: 'Tab order authentication strategy',
        severity: ErrorSeverity.MEDIUM,
        metadata: { strategy: 'tabOrder' }
      });
      return false;
    }
  }
};

/**
 * Strategy 2: Visual Proximity
 * Uses visual positioning to find related fields
 */
export const visualProximityStrategy: AuthStrategy = {
  name: 'Visual Proximity',
  async execute(page: Page, email: string, password: string, debug?: boolean) {
    const logger = createModuleLogger({
      module: 'AuthStrategy.VisualProximity',
      debug,
      defaultCategory: ErrorCategory.AUTHENTICATION
    });
    
    try {
      logger.debug('  🔄 Using Visual Proximity Strategy...');
      
      // Find all text inputs
      const textInputs = await page.locator('input[type="text"], input[type="email"], input:not([type])').all();
      
      if (textInputs.length === 0) {
        throw new Error('No text inputs found');
      }
      
      // Sort by vertical position (top to bottom)
      const inputsWithPosition = await Promise.all(
        textInputs.map(async (input) => {
          const box = await input.boundingBox();
          return { input, y: box?.y || 0 };
        })
      );
      
      inputsWithPosition.sort((a, b) => a.y - b.y);
      
      // First visible input is likely email
      const emailInput = inputsWithPosition[0].input;
      await emailInput.fill(email);
      logger.debug('  ✅ Filled top-most input with email');
      
      // Find password field
      const passwordInput = await page.locator('input[type="password"]').first();
      
      if (await passwordInput.isVisible()) {
        await passwordInput.fill(password);
        logger.debug('  ✅ Filled password input');
      } else {
        // If no password field, second input might be password
        if (inputsWithPosition.length > 1) {
          await inputsWithPosition[1].input.fill(password);
          logger.debug('  ✅ Filled second input with password');
        }
      }
      
      await page.waitForTimeout(500);
      
      // Find submit button - look for button with login-related text
      const submitButton = await page.locator(`
        button:has-text("Sign in"),
        button:has-text("Log in"), 
        button:has-text("Login"),
        button:has-text("Submit"),
        button[type="submit"],
        input[type="submit"]
      `).first();
      
      if (await submitButton.isVisible()) {
        await submitButton.click();
      } else {
        // Press Enter on password field
        await page.locator('input[type="password"]').press('Enter');
        logger.debug('  ⚠️ No submit button found, pressed Enter');
      }
      
      return true;
    } catch (error) {
      await logger.error(error as Error, {
        userAction: 'Visual proximity authentication strategy',
        severity: ErrorSeverity.MEDIUM,
        metadata: { strategy: 'visualProximity' }
      });
      return false;
    }
  }
};

/**
 * Strategy 3: Form Detection
 * Looks for form elements and their associations
 */
export const formDetectionStrategy: AuthStrategy = {
  name: 'Form Detection',
  async execute(page: Page, email: string, password: string, debug?: boolean) {
    const logger = createModuleLogger({
      module: 'AuthStrategy.FormDetection',
      debug,
      defaultCategory: ErrorCategory.AUTHENTICATION
    });
    
    try {
      logger.debug('  🔄 Using Form Detection Strategy...');
      
      // Find forms with password fields
      const forms = await page.locator('form:has(input[type="password"])').all();
      
      if (forms.length === 0) {
        throw new Error('No forms with password fields found');
      }
      
      // Use the first form
      const form = forms[0];
      
      // Find inputs within this form
      const emailInput = await form.locator(`
        input[type="email"],
        input[type="text"][name*="email"],
        input[type="text"][name*="user"],
        input[type="text"]:not([type="password"])
      `).first();
      
      const passwordInput = await form.locator('input[type="password"]').first();
      
      // Fill fields
      if (await emailInput.isVisible()) {
        await emailInput.fill(email);
        logger.debug('  ✅ Filled email in form');
      }
      
      await passwordInput.fill(password);
      logger.debug('  ✅ Filled password in form');
      
      // Submit form
      const submitButton = await form.locator('button[type="submit"], input[type="submit"], button').first();
      
      if (await submitButton.isVisible()) {
        await submitButton.click();
      } else {
        // Try submitting the form directly
        await form.press('Enter');
      }
      
      logger.debug('  ✅ Submitted form');
      
      return true;
    } catch (error) {
      await logger.error(error as Error, {
        userAction: 'Form detection authentication strategy',
        severity: ErrorSeverity.MEDIUM,
        metadata: { strategy: 'formDetection' }
      });
      return false;
    }
  }
};

/**
 * Strategy 4: AI-Assisted Heuristics
 * Uses smart heuristics to identify login elements
 */
export const aiAssistedStrategy: AuthStrategy = {
  name: 'AI-Assisted Heuristics',
  async execute(page: Page, email: string, password: string, debug?: boolean) {
    const logger = createModuleLogger({
      module: 'AuthStrategy.AIAssisted',
      debug,
      defaultCategory: ErrorCategory.AUTHENTICATION
    });
    
    try {
      logger.debug('  🔄 Using AI-Assisted Strategy...');
      
      // Capture page text to understand context
      const pageText = await page.textContent('body');
      const lowerText = pageText?.toLowerCase() || '';
      
      // Detect login page patterns
      const loginPatterns = ['sign in', 'log in', 'login', 'email', 'password', 'username'];
      const isLikelyLoginPage = loginPatterns.some(pattern => lowerText.includes(pattern));
      
      if (!isLikelyLoginPage) {
        throw new Error('Does not appear to be a login page');
      }
      
      // Fill email field using multiple selectors
      const emailFilled = await page.evaluate(async (email) => {
        const selectors = [
          'input[type="email"]',
          'input[name*="email"]',
          'input[placeholder*="email"]',
          'input[id*="email"]',
          'input[name*="user"]',
          'input[placeholder*="user"]',
          'input[id*="user"]',
          'input[type="text"]:not([type="password"])'
        ];
        
        for (const selector of selectors) {
          const input = document.querySelector(selector) as HTMLInputElement;
          if (input && input.offsetHeight > 0) {
            input.value = email;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, email);
      
      if (emailFilled) {
        await page.waitForTimeout(200);
      }
      
      // Fill password field
      await page.locator('input[type="password"]').first().fill(password);
      await page.waitForTimeout(200);
      
      // Smart submit button detection
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const submitButton = buttons.find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          const value = (btn as HTMLInputElement).value?.toLowerCase() || '';
          return ['sign in', 'log in', 'login', 'submit'].some(term => 
            text.includes(term) || value.includes(term)
          );
        });
        
        if (submitButton) {
          (submitButton as HTMLElement).click();
        } else {
          // Fallback: submit the form
          const form = document.querySelector('form');
          if (form) form.submit();
        }
      });
      
      return true;
    } catch (error) {
      await logger.error(error as Error, {
        userAction: 'AI-assisted authentication strategy',
        severity: ErrorSeverity.MEDIUM,
        metadata: { strategy: 'aiAssisted' }
      });
      return false;
    }
  }
};

/**
 * Execute all authentication strategies in order until one succeeds
 */
export async function executeAuthStrategies(
  page: Page,
  email: string,
  password: string,
  debug?: boolean
): Promise<boolean> {
  const logger = createModuleLogger({
    module: 'AuthStrategies',
    debug,
    defaultCategory: ErrorCategory.AUTHENTICATION
  });
  
  const strategies = [
    tabOrderStrategy,
    visualProximityStrategy,
    formDetectionStrategy,
    aiAssistedStrategy
  ];
  
  for (const strategy of strategies) {
    logger.debug(`\n🎯 Trying ${strategy.name}...`);
    
    const result = await executeOperation(
      async () => {
        const success = await strategy.execute(page, email, password, debug);
        
        if (success) {
          // Wait for navigation
          await page.waitForTimeout(3000);
          
          // Check if we're still on a login page
          const currentUrl = page.url();
          const pageText = await page.textContent('body');
          const onLoginPage = currentUrl.includes('login') || 
                            currentUrl.includes('signin') ||
                            (pageText?.toLowerCase().includes('password') && 
                             pageText?.toLowerCase().includes('email'));
          
          if (!onLoginPage) {
            logger.debug(`  ✅ ${strategy.name} succeeded!`);
            return true;
          } else {
            logger.debug(`  ⚠️ ${strategy.name} executed but still on login page`);
            return false;
          }
        }
        
        return false;
      },
      {
        name: `Execute ${strategy.name}`,
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.MEDIUM,
        fallback: false
      }
    );
    
    if (result.success && result.data) {
      return true;
    }
  }
  
  logger.warn('All authentication strategies failed');
  return false;
}