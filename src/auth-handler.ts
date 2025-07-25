import * as core from '@actions/core';
import { Page } from 'playwright';

export interface AuthConfig {
  loginUrl: string;
  email: string;
  password: string;
  successIndicator?: string; // Element or URL pattern that indicates successful login
}

export class AuthHandler {
  private authConfig: AuthConfig;

  constructor(authConfig: AuthConfig) {
    this.authConfig = authConfig;
  }

  /**
   * Perform login with email and password
   */
  async login(page: Page, baseUrl: string): Promise<boolean> {
    try {
      core.info(`Attempting login at ${baseUrl}${this.authConfig.loginUrl}`);
      
      // Navigate to login page
      await page.goto(`${baseUrl}${this.authConfig.loginUrl}`, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for login form to be ready
      await page.waitForLoadState('domcontentloaded');
      
      // Look for common email input selectors
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[id="email"]',
        'input[placeholder*="email" i]',
        'input[aria-label*="email" i]'
      ];
      
      let emailInput = null;
      for (const selector of emailSelectors) {
        try {
          emailInput = await page.waitForSelector(selector, { timeout: 5000 });
          if (emailInput) break;
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!emailInput) {
        throw new Error('Could not find email input field');
      }

      // Look for password input
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[id="password"]',
        'input[placeholder*="password" i]',
        'input[aria-label*="password" i]'
      ];

      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          passwordInput = await page.waitForSelector(selector, { timeout: 5000 });
          if (passwordInput) break;
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!passwordInput) {
        throw new Error('Could not find password input field');
      }

      // Fill in credentials
      await emailInput.fill(this.authConfig.email);
      await passwordInput.fill(this.authConfig.password);
      
      // Look for submit button
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("Log in")',
        '*[role="button"]:has-text("Login")',
        '*[role="button"]:has-text("Sign in")'
      ];

      let submitButton = null;
      for (const selector of submitSelectors) {
        try {
          submitButton = await page.locator(selector).first();
          if (await submitButton.isVisible()) break;
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!submitButton) {
        throw new Error('Could not find submit button');
      }

      // Click submit and wait for navigation
      await Promise.all([
        page.waitForNavigation({ 
          waitUntil: 'networkidle',
          timeout: 30000 
        }).catch(() => {
          // Some SPAs don't trigger navigation
          core.info('No navigation detected after login, checking for SPA behavior');
        }),
        submitButton.click()
      ]);

      // Wait a bit for any redirects or state updates
      await page.waitForTimeout(3000);

      // Check if login was successful
      const isLoggedIn = await this.verifyLogin(page);
      
      if (isLoggedIn) {
        core.info('Login successful');
        
        // Store auth state for reuse
        const cookies = await page.context().cookies();
        const localStorage = await page.evaluate(() => JSON.stringify(window.localStorage));
        const sessionStorage = await page.evaluate(() => JSON.stringify(window.sessionStorage));
        
        return true;
      } else {
        core.warning('Login verification failed');
        return false;
      }

    } catch (error) {
      core.error(`Login failed: ${error}`);
      
      // Take screenshot for debugging
      try {
        await page.screenshot({ 
          path: '/tmp/login-error.png',
          fullPage: true 
        });
        core.info('Login error screenshot saved to /tmp/login-error.png');
      } catch (screenshotError) {
        core.warning(`Failed to take error screenshot: ${screenshotError}`);
      }
      
      return false;
    }
  }

  /**
   * Verify if login was successful
   */
  private async verifyLogin(page: Page): Promise<boolean> {
    // Check if we're still on login page
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
      // Check for error messages
      const errorSelectors = [
        '.error-message',
        '.alert-danger',
        '[role="alert"]',
        '*:has-text("Invalid")',
        '*:has-text("incorrect")'
      ];

      for (const selector of errorSelectors) {
        try {
          const error = await page.locator(selector).first();
          if (await error.isVisible()) {
            const errorText = await error.textContent();
            core.warning(`Login error detected: ${errorText}`);
            return false;
          }
        } catch (e) {
          // No error found with this selector
        }
      }
    }

    // Check for success indicators
    if (this.authConfig.successIndicator) {
      try {
        await page.waitForSelector(this.authConfig.successIndicator, { 
          timeout: 5000,
          state: 'visible' 
        });
        return true;
      } catch (e) {
        core.warning(`Success indicator not found: ${this.authConfig.successIndicator}`);
      }
    }

    // Check for common logged-in indicators
    const loggedInSelectors = [
      '[data-testid="user-menu"]',
      '.user-avatar',
      '.user-profile',
      'button:has-text("Logout")',
      'button:has-text("Sign out")',
      'a:has-text("Profile")',
      'a:has-text("Dashboard")',
      'nav a[href*="dashboard"]'
    ];

    for (const selector of loggedInSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          core.info(`Found logged-in indicator: ${selector}`);
          return true;
        }
      } catch (e) {
        // Continue checking
      }
    }

    // If we're not on login page anymore, assume success
    if (!currentUrl.includes('/login') && !currentUrl.includes('/signin')) {
      core.info('Navigation away from login page detected, assuming success');
      return true;
    }

    return false;
  }

  /**
   * Logout from the application
   */
  async logout(page: Page): Promise<void> {
    try {
      core.info('Attempting logout');
      
      // Look for logout button/link
      const logoutSelectors = [
        'button:has-text("Logout")',
        'button:has-text("Sign out")',
        'button:has-text("Log out")',
        'a:has-text("Logout")',
        'a:has-text("Sign out")',
        '[data-testid="logout-button"]'
      ];

      let logoutElement = null;
      for (const selector of logoutSelectors) {
        try {
          logoutElement = await page.locator(selector).first();
          if (await logoutElement.isVisible()) break;
        } catch (e) {
          // Continue to next selector
        }
      }

      if (logoutElement) {
        await logoutElement.click();
        await page.waitForTimeout(2000);
        core.info('Logout successful');
      } else {
        core.warning('Logout button not found');
      }
    } catch (error) {
      core.warning(`Logout failed: ${error}`);
    }
  }

  /**
   * Create auth config from environment
   */
  static createFromEnv(): AuthHandler | null {
    const email = process.env.AUTH_EMAIL || process.env.LOGIN_EMAIL;
    const password = process.env.AUTH_PASSWORD || process.env.LOGIN_PASSWORD;
    const loginUrl = process.env.AUTH_LOGIN_URL || '/login/password';

    if (!email || !password) {
      return null;
    }

    return new AuthHandler({
      loginUrl,
      email,
      password,
      successIndicator: process.env.AUTH_SUCCESS_INDICATOR
    });
  }
}