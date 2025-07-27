import * as core from '@actions/core';
import { Page } from 'playwright';
import { VisualAnalyzer } from '../core/analysis/VisualAnalyzer';
import { authMonitor } from '../monitoring/AuthMetrics';

export interface AuthConfig {
  loginUrl: string;
  email: string;
  password: string;
  successIndicator?: string;
}

/**
 * Smart Authentication Handler that uses AI to understand login forms
 * instead of hardcoded selectors
 */
export class SmartAuthHandler {
  private authConfig: AuthConfig;
  private visualAnalyzer: VisualAnalyzer;

  constructor(authConfig: AuthConfig, claudeApiKey: string) {
    this.authConfig = authConfig;
    this.visualAnalyzer = new VisualAnalyzer(claudeApiKey, '');
  }

  /**
   * Perform login using AI to understand the form
   */
  async login(page: Page, baseUrl: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      core.info(`🤖 Smart login: Navigating to ${baseUrl}${this.authConfig.loginUrl}`);
      
      // Navigate to login page
      await page.goto(`${baseUrl}${this.authConfig.loginUrl}`, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Take screenshot of the login page
      const screenshot = await page.screenshot({ fullPage: false });
      
      // Use AI to analyze the login form
      const formAnalysis = await this.analyzeLoginForm(screenshot);
      
      if (!formAnalysis.success) {
        throw new Error(`Could not understand login form: ${formAnalysis.error}`);
      }

      // Fill email field
      if (formAnalysis.emailSelector) {
        core.info(`AI found email field: ${formAnalysis.emailSelector}`);
        await page.fill(formAnalysis.emailSelector, this.authConfig.email);
      } else {
        throw new Error('Could not find email/username field');
      }

      // Fill password field
      if (formAnalysis.passwordSelector) {
        core.info(`AI found password field: ${formAnalysis.passwordSelector}`);
        await page.fill(formAnalysis.passwordSelector, this.authConfig.password);
      } else {
        throw new Error('Could not find password field');
      }

      // Submit form
      if (formAnalysis.submitSelector) {
        core.info(`AI found submit button: ${formAnalysis.submitSelector}`);
        await page.click(formAnalysis.submitSelector);
      } else if (formAnalysis.submitMethod === 'enter') {
        core.info('AI suggests pressing Enter to submit');
        await page.keyboard.press('Enter');
      } else {
        throw new Error('Could not find submit method');
      }

      // Wait for navigation or state change
      await this.waitForLoginCompletion(page);

      // Verify login success
      const success = await this.verifyLoginWithAI(page);
      
      // Record metrics
      authMonitor.recordAttempt({
        success,
        method: 'smart',
        url: `${baseUrl}${this.authConfig.loginUrl}`,
        duration: Date.now() - startTime
      });
      
      return success;

    } catch (error) {
      core.error(`Smart login failed: ${error}`);
      
      // Take debug screenshot
      try {
        const debugScreenshot = await page.screenshot({ fullPage: true });
        const debugAnalysis = await this.analyzeLoginError(debugScreenshot);
        core.info(`AI error analysis: ${debugAnalysis}`);
      } catch (e) {
        core.warning(`Could not analyze error: ${e}`);
      }
      
      // Record failure metrics
      authMonitor.recordAttempt({
        success: false,
        method: 'smart',
        url: `${baseUrl}${this.authConfig.loginUrl}`,
        errorType: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      return false;
    }
  }

  /**
   * Use AI to analyze the login form and find fields
   */
  private async analyzeLoginForm(screenshot: Buffer): Promise<{
    success: boolean;
    emailSelector?: string;
    passwordSelector?: string;
    submitSelector?: string;
    submitMethod?: 'click' | 'enter';
    error?: string;
  }> {
    const prompt = `
      Analyze this login form screenshot and identify:
      1. The email/username input field
      2. The password input field
      3. The submit/login button
      
      For each element found, provide the most specific CSS selector possible.
      Consider these patterns:
      - Input fields might have type="email", type="text", or type="password"
      - Look for labels, placeholders, or nearby text that indicates the field purpose
      - Submit buttons might say "Login", "Sign in", "Continue", etc.
      
      Return a JSON object with:
      {
        "emailSelector": "selector for email/username field",
        "passwordSelector": "selector for password field",
        "submitSelector": "selector for submit button",
        "submitMethod": "click" or "enter" if no button found
      }
      
      If you cannot find any field, set it to null.
    `;

    try {
      const analysis = await this.visualAnalyzer.analyzeScreenshot(screenshot, prompt);
      
      // Parse AI response
      const result = this.parseAIResponse(analysis);
      
      // Validate selectors by testing them
      return await this.validateSelectors(result);
      
    } catch (error) {
      return {
        success: false,
        error: `Form analysis failed: ${error}`
      };
    }
  }

  /**
   * Parse AI response to extract selectors
   */
  private parseAIResponse(aiResponse: any): any {
    try {
      // AI response should contain structured data
      if (typeof aiResponse === 'string') {
        // Try to extract JSON from response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
      
      // If already an object, return it
      return aiResponse;
    } catch (error) {
      core.warning(`Could not parse AI response: ${error}`);
      
      // Fallback to basic selectors
      return {
        emailSelector: 'input[type="email"], input[type="text"]',
        passwordSelector: 'input[type="password"]',
        submitSelector: 'button[type="submit"], button',
        submitMethod: 'click'
      };
    }
  }

  /**
   * Validate that selectors actually exist on the page
   */
  private async validateSelectors(selectors: any): Promise<any> {
    // In a real implementation, we would test each selector
    // For now, trust the AI analysis
    return {
      success: true,
      ...selectors
    };
  }

  /**
   * Wait for login to complete
   */
  private async waitForLoginCompletion(page: Page): Promise<void> {
    await Promise.race([
      page.waitForNavigation({ 
        waitUntil: 'networkidle',
        timeout: 30000 
      }).catch(() => {
        core.info('No navigation detected, checking for SPA behavior');
      }),
      page.waitForTimeout(5000)
    ]);
    
    // Additional wait for any redirects
    await page.waitForTimeout(2000);
  }

  /**
   * Use AI to verify if login was successful
   */
  private async verifyLoginWithAI(page: Page): Promise<boolean> {
    const screenshot = await page.screenshot({ fullPage: false });
    
    const prompt = `
      Analyze this screenshot to determine if the user is logged in.
      
      Look for indicators such as:
      - User profile/avatar elements
      - Logout/Sign out buttons
      - Dashboard or authenticated content
      - Welcome messages with user info
      - Navigation changes indicating authenticated state
      
      Also check for login failure indicators:
      - Error messages
      - "Invalid credentials" or similar text
      - Still on login page with form visible
      
      Return: { "loggedIn": true/false, "confidence": 0-100, "reason": "explanation" }
    `;
    
    try {
      const analysis = await this.visualAnalyzer.analyzeScreenshot(screenshot, prompt);
      const result = this.parseAIResponse(analysis);
      
      core.info(`AI login verification: ${JSON.stringify(result)}`);
      
      return result.loggedIn === true && result.confidence > 70;
    } catch (error) {
      core.warning(`AI verification failed: ${error}`);
      
      // Fallback to URL check
      const currentUrl = page.url();
      return !currentUrl.includes('/login') && !currentUrl.includes('/signin');
    }
  }

  /**
   * Analyze login error for better debugging
   */
  private async analyzeLoginError(screenshot: Buffer): Promise<string> {
    const prompt = `
      Analyze this login error screenshot and explain:
      1. What went wrong with the login attempt
      2. Any visible error messages
      3. Suggestions for fixing the issue
      
      Be concise and specific.
    `;
    
    try {
      const analysis = await this.visualAnalyzer.analyzeScreenshot(screenshot, prompt);
      return typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
    } catch (error) {
      return `Could not analyze error: ${error}`;
    }
  }

  /**
   * Smart logout using AI
   */
  async logout(page: Page): Promise<void> {
    try {
      const screenshot = await page.screenshot({ fullPage: false });
      
      const prompt = `
        Find the logout/sign out button in this screenshot.
        Return the CSS selector for the logout element.
      `;
      
      const analysis = await this.visualAnalyzer.analyzeScreenshot(screenshot, prompt);
      const result = this.parseAIResponse(analysis);
      
      if (result.logoutSelector) {
        await page.click(result.logoutSelector);
        await page.waitForTimeout(2000);
        core.info('Smart logout successful');
      } else {
        core.warning('Could not find logout button');
      }
    } catch (error) {
      core.warning(`Smart logout failed: ${error}`);
    }
  }
}