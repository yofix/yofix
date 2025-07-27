import * as core from '@actions/core';
import { Page } from 'playwright';
import { SmartAuthHandler } from './SmartAuthHandler';

export interface AuthConfig {
  loginUrl: string;
  email: string;
  password: string;
  successIndicator?: string;
}

/**
 * AuthHandler V2 - Hybrid approach that tries smart detection first,
 * falls back to selectors only if needed
 */
export class AuthHandlerV2 {
  private authConfig: AuthConfig;
  private smartHandler?: SmartAuthHandler;
  private useSmartMode: boolean;

  constructor(authConfig: AuthConfig, claudeApiKey?: string) {
    this.authConfig = authConfig;
    this.useSmartMode = !!claudeApiKey;
    
    if (claudeApiKey) {
      this.smartHandler = new SmartAuthHandler(authConfig, claudeApiKey);
    }
  }

  /**
   * Perform login - try smart mode first, fallback to selectors
   */
  async login(page: Page, baseUrl: string): Promise<boolean> {
    // Always try smart mode first if available
    if (this.smartHandler) {
      core.info('🤖 Attempting smart login with AI...');
      try {
        const result = await this.smartHandler.login(page, baseUrl);
        if (result) {
          core.info('✅ Smart login successful!');
          return true;
        }
      } catch (error) {
        core.warning(`Smart login failed, falling back to selectors: ${error}`);
      }
    }

    // Fallback to basic selector approach
    core.info('📝 Using selector-based login...');
    return await this.selectorBasedLogin(page, baseUrl);
  }

  /**
   * Simplified selector-based login with only the most common patterns
   */
  private async selectorBasedLogin(page: Page, baseUrl: string): Promise<boolean> {
    try {
      await page.goto(`${baseUrl}${this.authConfig.loginUrl}`, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Only keep the most reliable selectors
      const emailInput = await this.findInput(page, [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        '#email',
        '#username'
      ]);

      if (!emailInput) {
        throw new Error('Could not find email input');
      }

      const passwordInput = await this.findInput(page, [
        'input[type="password"]',
        'input[name="password"]',
        '#password'
      ]);

      if (!passwordInput) {
        throw new Error('Could not find password input');
      }

      // Fill fields
      await emailInput.fill(this.authConfig.email);
      await passwordInput.fill(this.authConfig.password);

      // Try to submit
      const submitted = await this.submitForm(page, passwordInput);
      if (!submitted) {
        throw new Error('Could not submit form');
      }

      // Wait and verify
      await page.waitForTimeout(3000);
      return await this.isLoggedIn(page);

    } catch (error) {
      core.error(`Selector-based login failed: ${error}`);
      return false;
    }
  }

  /**
   * Find visible and enabled input
   */
  private async findInput(page: Page, selectors: string[]): Promise<any> {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element && await element.isVisible() && await element.isEnabled()) {
          return element;
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  /**
   * Try to submit the form
   */
  private async submitForm(page: Page, lastInput: any): Promise<boolean> {
    // First try submit button
    const submitButton = await page.$('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    if (submitButton && await submitButton.isVisible()) {
      await submitButton.click();
      return true;
    }

    // Fallback to Enter key
    await lastInput.press('Enter');
    return true;
  }

  /**
   * Simple logged-in check
   */
  private async isLoggedIn(page: Page): Promise<boolean> {
    const url = page.url();
    
    // Not on login page = probably logged in
    if (!url.includes('/login') && !url.includes('/signin')) {
      return true;
    }

    // Check for common logged-in elements
    const loggedInElement = await page.$('[data-testid="user-menu"], .user-avatar, button:has-text("Logout")');
    return !!loggedInElement;
  }
}

/**
 * Factory function to create the appropriate auth handler
 */
export function createAuthHandler(
  authConfig: AuthConfig,
  claudeApiKey?: string,
  forceSmartMode?: boolean
): AuthHandlerV2 | SmartAuthHandler {
  if (forceSmartMode && claudeApiKey) {
    return new SmartAuthHandler(authConfig, claudeApiKey);
  }
  
  return new AuthHandlerV2(authConfig, claudeApiKey);
}