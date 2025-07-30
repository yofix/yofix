import * as core from '@actions/core';
import { Page } from 'playwright';
import { Agent } from '../browser-agent/core/Agent';
import { authMonitor } from '../monitoring/AuthMetrics';

export interface AuthConfig {
  loginUrl: string;
  email: string;
  password: string;
  successIndicator?: string;
}

/**
 * Smart Authentication Handler - Powered by Browser Agent
 * 
 * This replaces the complex 342-line SmartAuthHandler with a simple
 * browser-agent implementation that's more reliable and maintainable.
 */
export class SmartAuthHandler {
  private authConfig: AuthConfig;
  private claudeApiKey: string;

  constructor(authConfig: AuthConfig, claudeApiKey: string) {
    this.authConfig = authConfig;
    this.claudeApiKey = claudeApiKey;
  }

  /**
   * Perform login using browser-agent's smart authentication
   */
  async login(page: Page, baseUrl: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      let loginUrl = this.authConfig.loginUrl;
      
      // Auto-detect login URL if needed
      if (loginUrl === 'auto-detect' || !loginUrl) {
        core.info('🔍 Auto-detecting login page...');
        loginUrl = await this.autoDetectLoginUrl(baseUrl);
        core.info(`✅ Detected login URL: ${loginUrl}`);
      }
      
      core.info(`🤖 Smart login: Using browser-agent for ${baseUrl}${loginUrl}`);
      
      // Close the existing page since agent will create its own
      const browserContext = page.context();
      const browser = browserContext.browser();
      
      if (!browser) {
        throw new Error('No browser context available');
      }
      
      // Create browser agent with authentication task
      const loginTask = `
        1. Navigate to ${baseUrl}${loginUrl}
        2. Use smart_login with email="${this.authConfig.email}" password="${this.authConfig.password}"
        3. Verify login was successful by checking for dashboard or profile elements
      `;
      
      const agent = new Agent(loginTask, {
        headless: true,
        maxSteps: 10,
        llmProvider: 'anthropic'
      });
      
      // Set API key
      process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
      
      await agent.initialize();
      const result = await agent.run();
      
      // Get the final state
      const finalUrl = result.finalUrl;
      const success = result.success && !finalUrl.includes('/login') && !finalUrl.includes('/signin');
      
      // Record metrics
      authMonitor.recordAttempt({
        success,
        method: 'browser-agent',
        url: `${baseUrl}${this.authConfig.loginUrl}`,
        duration: Date.now() - startTime
      });
      
      if (success) {
        core.info(`✅ Browser-agent login successful. Final URL: ${finalUrl}`);
      } else {
        core.warning(`⚠️ Browser-agent login may have failed. Final URL: ${finalUrl}`);
      }
      
      await agent.cleanup();
      return success;
      
    } catch (error) {
      core.error(`❌ Browser-agent login failed: ${error}`);
      
      // Record failure metrics
      authMonitor.recordAttempt({
        success: false,
        method: 'browser-agent',
        url: `${baseUrl}${this.authConfig.loginUrl}`,
        errorType: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      return false;
    }
  }

  /**
   * Smart logout using browser-agent
   */
  async logout(page: Page): Promise<void> {
    try {
      core.info('🤖 Smart logout: Using browser-agent');
      
      const browserContext = page.context();
      const browser = browserContext.browser();
      
      if (!browser) {
        throw new Error('No browser context available');
      }
      
      const logoutTask = 'Find and click the logout button to sign out of the application';
      
      const agent = new Agent(logoutTask, {
        headless: true,
        maxSteps: 5,
        llmProvider: 'anthropic'
      });
      
      process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
      
      await agent.initialize();
      await agent.run();
      await agent.cleanup();
      
      core.info('✅ Browser-agent logout completed');
      
    } catch (error) {
      core.warning(`⚠️ Browser-agent logout failed: ${error}`);
    }
  }

  /**
   * Auto-detect the login URL for a website
   */
  private async autoDetectLoginUrl(baseUrl: string): Promise<string> {
    try {
      const detectionTask = `
        Navigate to ${baseUrl} and find the login page:
        
        1. Look for common login indicators:
           - Links with text like "Login", "Sign In", "Log In", "Sign Up"
           - Buttons with login/signin text
           - Navigation items for authentication
           - User account icons or profile links
           
        2. Check common login URLs by visiting them:
           - /login
           - /signin  
           - /auth/login
           - /user/login
           - /account/login
           - /auth
           - /sign-in
           
        3. If you find a login link or button, click on it to get the actual login page URL
        
        4. Look for pages with login forms (username/email and password fields)
        
        5. Save the final login page URL to /detected-login-url.txt
        
        6. If no login is found, save "/login" as fallback to /detected-login-url.txt
        
        Focus on finding the actual login page where users enter credentials.
      `;
      
      const agent = new Agent(detectionTask, {
        headless: true,
        maxSteps: 15,
        llmProvider: 'anthropic',
        viewport: { width: 1920, height: 1080 }
      });
      
      process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
      
      await agent.initialize();
      const result = await agent.run();
      
      // Get detected URL
      const agentState = agent.getState();
      const detectedUrl = agentState.fileSystem.get('/detected-login-url.txt');
      
      await agent.cleanup();
      
      if (detectedUrl) {
        let loginUrl = detectedUrl.trim();
        
        // If it's a full URL, extract just the path
        try {
          const url = new URL(loginUrl);
          loginUrl = url.pathname;
        } catch (e) {
          // If not a full URL, assume it's already a path
          if (!loginUrl.startsWith('/')) {
            loginUrl = '/' + loginUrl;
          }
        }
        
        return loginUrl;
      }
      
      // Fallback to common login URLs
      return '/login';
      
    } catch (error) {
      core.warning(`Login URL auto-detection failed: ${error.message}`);
      return '/login';
    }
  }
}

/**
 * Factory function to create the appropriate auth handler
 * This allows gradual migration from old to new implementation
 */
export function createAuthHandler(
  authConfig: AuthConfig, 
  claudeApiKey: string
) {
  return new SmartAuthHandler(authConfig, claudeApiKey);
}