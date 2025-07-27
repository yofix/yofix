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
      
      // Enhanced email input selectors - more comprehensive
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[id="email"]',
        'input[placeholder*="email" i]',
        'input[aria-label*="email" i]',
        'input[autocomplete="email"]',
        'input[data-testid*="email" i]',
        // Common form field patterns
        'input[name="username"]',
        'input[id="username"]',
        'input[placeholder*="username" i]',
        'input[name="login"]',
        'input[id="login"]',
        // Generic text inputs that might be email fields
        'form input[type="text"]:first-of-type',
        '#email-input',
        '.email-input input',
        '[data-test*="email"] input',
        '[data-cy*="email"] input'
      ];
      
      let emailInput = null;
      for (const selector of emailSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const element of elements) {
            // Check if element is visible and enabled
            const isVisible = await element.isVisible();
            const isEnabled = await element.isEnabled();
            if (isVisible && isEnabled) {
              emailInput = element;
              core.info(`Found email input using selector: ${selector}`);
              break;
            }
          }
          if (emailInput) break;
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!emailInput) {
        // Try to find by label text
        const labels = await page.$$('label');
        for (const label of labels) {
          const text = await label.textContent();
          if (text && text.toLowerCase().includes('email')) {
            const forAttr = await label.getAttribute('for');
            if (forAttr) {
              emailInput = await page.$(`#${forAttr}`);
              if (emailInput) {
                core.info(`Found email input via label for="${forAttr}"`);
                break;
              }
            }
          }
        }
      }

      if (!emailInput) {
        throw new Error('Could not find email input field. Tried ' + emailSelectors.length + ' selectors.');
      }

      // Enhanced password input selectors
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[id="password"]',
        'input[placeholder*="password" i]',
        'input[aria-label*="password" i]',
        'input[autocomplete="current-password"]',
        'input[autocomplete="new-password"]',
        'input[data-testid*="password" i]',
        '#password-input',
        '.password-input input',
        '[data-test*="password"] input',
        '[data-cy*="password"] input'
      ];

      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const element of elements) {
            const isVisible = await element.isVisible();
            const isEnabled = await element.isEnabled();
            if (isVisible && isEnabled) {
              passwordInput = element;
              core.info(`Found password input using selector: ${selector}`);
              break;
            }
          }
          if (passwordInput) break;
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!passwordInput) {
        throw new Error('Could not find password input field');
      }

      // Clear and fill credentials with delays to mimic human behavior
      await emailInput.click();
      await page.waitForTimeout(100);
      await emailInput.fill('');
      await page.waitForTimeout(100);
      await emailInput.fill(this.authConfig.email);
      await page.waitForTimeout(200);
      
      await passwordInput.click();
      await page.waitForTimeout(100);
      await passwordInput.fill('');
      await page.waitForTimeout(100);
      await passwordInput.fill(this.authConfig.password);
      await page.waitForTimeout(200);
      
      // Enhanced submit button selectors
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("Log in")',
        'button:has-text("Continue")',
        'button:has-text("Submit")',
        '*[role="button"]:has-text("Login")',
        '*[role="button"]:has-text("Sign in")',
        'button.login-button',
        'button.signin-button',
        'button.submit-button',
        '#login-button',
        '#signin-button',
        '[data-testid*="login-button"]',
        '[data-testid*="signin-button"]',
        '[data-cy*="login-button"]',
        '[data-cy*="signin-button"]',
        // Find button after password field
        'input[type="password"] ~ button',
        'input[type="password"] ~ * button',
        // Form submit buttons
        'form button:not([type="button"])',
        'form input[type="submit"]',
        'form button[type="submit"]'
      ];

      let submitButton = null;
      for (const selector of submitSelectors) {
        try {
          const elements = await page.locator(selector).all();
          for (const element of elements) {
            if (await element.isVisible()) {
              submitButton = element;
              core.info(`Found submit button using selector: ${selector}`);
              break;
            }
          }
          if (submitButton) break;
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!submitButton) {
        // Try pressing Enter as fallback
        core.info('Submit button not found, trying Enter key');
        await passwordInput.press('Enter');
      } else {
        // Click submit and wait for navigation
        await submitButton.click();
      }

      // Wait for navigation or state change
      await Promise.race([
        page.waitForNavigation({ 
          waitUntil: 'networkidle',
          timeout: 30000 
        }).catch(() => {
          // Some SPAs don't trigger navigation
          core.info('No navigation detected after login, checking for SPA behavior');
        }),
        page.waitForTimeout(5000) // Wait 5 seconds max
      ]);

      // Additional wait for any redirects or state updates
      await page.waitForTimeout(2000);

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
        '*:has-text("incorrect")',
        '*:has-text("failed")',
        '.error',
        '.alert',
        '[data-testid*="error"]'
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
      '[data-testid="user-avatar"]',
      '.user-avatar',
      '.user-profile',
      '.user-menu',
      '#user-menu',
      'button:has-text("Logout")',
      'button:has-text("Sign out")',
      'button:has-text("Log out")',
      'a:has-text("Logout")',
      'a:has-text("Sign out")',
      'a:has-text("Profile")',
      'a:has-text("Dashboard")',
      'a:has-text("Account")',
      'nav a[href*="dashboard"]',
      'nav a[href*="profile"]',
      '[aria-label*="user menu" i]',
      '[aria-label*="account" i]'
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

    // If we're not on login page anymore and no errors, assume success
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
        '[data-testid="logout-button"]',
        '[data-testid="signout-button"]'
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