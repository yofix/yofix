import { ActionDefinition, ActionResult, AgentContext, AuthCredentials, AuthResult, DOMElement, IndexedDOM } from '../types';
import { ActionHandler } from '../core/ActionRegistry';
import { Page } from 'playwright';
import { DOMIndexer } from '../core/DOMIndexer';
import * as core from '@actions/core';
import { authenticateWithLLM } from '../../modules/llm-browser-agent';
import { errorHandler, ErrorCategory, ErrorSeverity } from '../../core';

const domIndexer = new DOMIndexer();

export const authActions: Array<{ definition: ActionDefinition; handler: ActionHandler }> = [
  {
    definition: {
      name: 'smart_login',
      description: 'Intelligently login to any website by understanding the login form',
      parameters: {
        username: { type: 'string', required: false, description: 'Username or email' },
        email: { type: 'string', required: false, description: 'Email address' },
        password: { type: 'string', required: true, description: 'Password' },
        url: { type: 'string', required: false, description: 'Login page URL (if not already there)' },
        totpSecret: { type: 'string', required: false, description: 'TOTP secret for 2FA' }
      },
      examples: [
        'smart_login email="user@example.com" password="secret123"',
        'smart_login username="johndoe" password="pass123" url="/login"',
        'smart_login email="user@test.com" password="pwd" totpSecret="JBSWY3DPEHPK3PXP"'
      ]
    },
    handler: async (params: AuthCredentials & { url?: string }, context: AgentContext): Promise<AuthResult> => {
      const startTime = Date.now();
      
      try {
        const { page, dom, state } = context;
        
        // Navigate to login page if URL provided
        if (params.url) {
          await page.goto(params.url, { waitUntil: 'domcontentloaded' });
          await domIndexer.indexPage(page); // Re-index after navigation
        }
        
        // Analyze the page to find login elements
        const loginElements = analyzeLoginForm(dom, domIndexer);
        
        if (!loginElements.usernameField && !loginElements.emailField) {
          return {
            success: false,
            error: 'Could not find username/email field',
            method: 'smart',
            loginTime: Date.now() - startTime
          };
        }
        
        if (!loginElements.passwordField) {
          return {
            success: false,
            error: 'Could not find password field',
            method: 'smart',
            loginTime: Date.now() - startTime
          };
        }
        
        // Fill username/email field
        const usernameValue = params.email || params.username || '';
        const usernameField = loginElements.emailField || loginElements.usernameField;
        
        if (usernameField) {
          core.info(`Filling username field at index ${usernameField.index}`);
          await page.fill(`xpath=${usernameField.xpath}`, usernameValue);
          await page.waitForTimeout(500);
        }
        
        // Fill password field
        core.info(`Filling password field at index ${loginElements.passwordField.index}`);
        await page.fill(`xpath=${loginElements.passwordField.xpath}`, params.password);
        await page.waitForTimeout(500);
        
        // Handle "Remember me" checkbox if found
        if (loginElements.rememberCheckbox) {
          await page.click(`xpath=${loginElements.rememberCheckbox.xpath}`);
        }
        
        // Submit the form
        if (loginElements.submitButton) {
          core.info(`Clicking submit button at index ${loginElements.submitButton.index}`);
          await page.click(`xpath=${loginElements.submitButton.xpath}`);
        } else {
          // Try pressing Enter
          core.info('No submit button found, pressing Enter');
          await page.keyboard.press('Enter');
        }
        
        // Wait for navigation with fallback strategy
        try {
          // First try domcontentloaded (faster, more reliable)
          await page.waitForNavigation({ 
            waitUntil: 'domcontentloaded', 
            timeout: 5000 
          });
          
          // Then wait a bit for any client-side rendering
          await page.waitForTimeout(500);
        } catch (error) {
          // Navigation might have already happened or be client-side only
          // Check if we're no longer on the login page
          const currentUrl = page.url();
          if (currentUrl === loginUrl || currentUrl.includes('/login')) {
            // Still on login page, might be client-side routing
            // Wait for URL change or max 2 seconds
            try {
              await page.waitForFunction(
                (originalUrl) => window.location.href !== originalUrl,
                { timeout: 2000 },
                loginUrl
              );
            } catch {
              // URL didn't change, but login might still have worked
              // Check for common post-login indicators
              const hasLogoutButton = await page.$('[aria-label*="logout"], button:has-text("Logout"), a:has-text("Sign out")').catch(() => null);
              if (!hasLogoutButton) {
                // Still appears to be on login page
                await page.waitForTimeout(1000);
              }
            }
          }
        }
        
        // Check for 2FA
        if (params.totpSecret) {
          const needs2FA = await check2FARequired(page);
          if (needs2FA) {
            core.info('2FA detected, handling...');
            await handle2FA(page, params.totpSecret);
          }
        }
        
        // Verify login success
        const success = await verifyLoginSuccess(page, usernameValue);
        
        // Save credentials to memory if successful
        if (success) {
          state.memory.set('auth_credentials', {
            site: new URL(page.url()).hostname,
            username: usernameValue,
            timestamp: Date.now()
          });
        }
        
        return {
          success,
          method: 'smart',
          loginTime: Date.now() - startTime,
          verificationMethod: success ? 'profile-detected' : 'login-form-still-visible',
          data: {
            finalUrl: page.url(),
            usedFields: {
              username: usernameField?.tag,
              password: loginElements.passwordField.tag,
              submit: loginElements.submitButton?.tag
            }
          }
        };
        
      } catch (error) {
        await errorHandler.handleError(error as Error, {
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.AUTHENTICATION,
          userAction: 'Smart login attempt',
          metadata: {
            method: 'smart',
            hasUsername: !!(params.email || params.username),
            hasUrl: !!params.url,
            has2FA: !!params.totpSecret
          },
          recoverable: true
        });
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Smart login failed',
          method: 'smart',
          loginTime: Date.now() - startTime
        };
      }
    }
  },
  
  {
    definition: {
      name: 'logout',
      description: 'Intelligently logout from the current website',
      parameters: {},
      examples: ['logout']
    },
    handler: async (params: {}, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, dom } = context;
        
        // Look for logout elements
        const logoutElements = findLogoutElements(dom, domIndexer);
        
        if (logoutElements.length === 0) {
          // Try opening user menu first
          const userMenuElements = findUserMenuElements(dom, domIndexer);
          
          if (userMenuElements.length > 0) {
            await page.click(`xpath=${userMenuElements[0].xpath}`);
            await page.waitForTimeout(1000);
            
            // Re-index and look for logout again
            const newDom = await domIndexer.indexPage(page);
            const newLogoutElements = findLogoutElements(newDom, domIndexer);
            
            if (newLogoutElements.length > 0) {
              await page.click(`xpath=${newLogoutElements[0].xpath}`);
            }
          }
        } else {
          // Click logout directly
          await page.click(`xpath=${logoutElements[0].xpath}`);
        }
        
        // Wait for logout to complete
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
          page.waitForTimeout(3000)
        ]);
        
        // Clear auth from memory
        context.state.memory.delete('auth_credentials');
        
        return {
          success: true,
          data: { 
            method: logoutElements.length > 0 ? 'direct' : 'menu-navigation',
            finalUrl: page.url()
          }
        };
        
      } catch (error) {
        await errorHandler.handleError(error as Error, {
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.AUTHENTICATION,
          userAction: 'Logout attempt',
          metadata: {
            currentUrl: context.page.url()
          },
          recoverable: true
        });
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Logout failed'
        };
      }
    }
  },
  
  {
    definition: {
      name: 'llm_login',
      description: 'Login using LLM to understand any login form (most reliable)',
      parameters: {
        email: { type: 'string', required: true, description: 'Email address' },
        password: { type: 'string', required: true, description: 'Password' },
        loginUrl: { type: 'string', required: false, description: 'Login page URL' }
      },
      examples: [
        'llm_login email="user@example.com" password="secret123"',
        'llm_login email="test@test.com" password="pass" loginUrl="/login"'
      ]
    },
    handler: async (params: { email: string; password: string; loginUrl?: string }, context: AgentContext): Promise<AuthResult> => {
      const startTime = Date.now();
      
      try {
        const { page, state } = context;
        const claudeApiKey = process.env.CLAUDE_API_KEY || core.getInput('claude-api-key');
        
        if (!claudeApiKey) {
          return {
            success: false,
            error: 'Claude API key not available for LLM authentication',
            method: 'llm',
            loginTime: Date.now() - startTime
          };
        }
        
        core.info('🤖 Using LLM-powered authentication...');
        
        // Use the LLM authentication function
        const success = await authenticateWithLLM(
          page,
          params.email,
          params.password,
          params.loginUrl,
          claudeApiKey,
          core.isDebug()
        );
        
        if (success) {
          // Save credentials in state
          state.memory.set('auth_credentials', {
            username: params.email,
            password: params.password,
            method: 'llm',
            timestamp: Date.now()
          });
          
          return {
            success: true,
            method: 'llm',
            loginTime: Date.now() - startTime
          };
        } else {
          return {
            success: false,
            error: 'LLM authentication failed',
            method: 'llm',
            loginTime: Date.now() - startTime
          };
        }
      } catch (error) {
        await errorHandler.handleError(error as Error, {
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.AUTHENTICATION,
          userAction: 'LLM-powered login attempt',
          metadata: {
            method: 'llm',
            hasLoginUrl: !!params.loginUrl,
            email: params.email.split('@')[1] // Only domain for privacy
          },
          recoverable: true
        });
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'LLM login failed',
          method: 'llm',
          loginTime: Date.now() - startTime
        };
      }
    }
  },
  
  {
    definition: {
      name: 'check_auth_status',
      description: 'Check if currently logged in',
      parameters: {},
      examples: ['check_auth_status']
    },
    handler: async (params: {}, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, state } = context;
        
        // Check memory first
        const savedAuth = state.memory.get('auth_credentials');
        
        // Verify actual login status
        const isLoggedIn = await verifyLoginSuccess(page, savedAuth?.username);
        
        return {
          success: true,
          data: {
            loggedIn: isLoggedIn,
            savedCredentials: !!savedAuth,
            currentUrl: page.url()
          }
        };
        
      } catch (error) {
        await errorHandler.handleError(error as Error, {
          severity: ErrorSeverity.LOW,
          category: ErrorCategory.AUTHENTICATION,
          userAction: 'Check authentication status',
          metadata: {
            currentUrl: context.page.url()
          },
          recoverable: true
        });
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Auth check failed'
        };
      }
    }
  }
];

interface LoginElements {
  usernameField: DOMElement | null;
  emailField: DOMElement | null;
  passwordField: DOMElement | null;
  submitButton: DOMElement | null;
  rememberCheckbox: DOMElement | null;
}

/**
 * Analyze login form to find fields
 */
function analyzeLoginForm(dom: IndexedDOM, indexer: DOMIndexer): LoginElements {
  const elements: LoginElements = {
    usernameField: null,
    emailField: null,
    passwordField: null,
    submitButton: null,
    rememberCheckbox: null
  };
  
  // Find input fields
  for (const [id, element] of dom.elements) {
    if (!element.isVisible) continue;
    
    // Email field
    if (element.tag === 'input' && 
        (element.attributes.type === 'email' || 
         element.attributes.name?.includes('email') ||
         element.attributes.placeholder?.toLowerCase().includes('email'))) {
      elements.emailField = element;
    }
    
    // Username field
    else if (element.tag === 'input' && 
             (element.attributes.type === 'text' || element.attributes.type === 'username') &&
             (element.attributes.name?.includes('user') ||
              element.attributes.placeholder?.toLowerCase().includes('username') ||
              element.attributes['aria-label']?.toLowerCase().includes('username'))) {
      elements.usernameField = element;
    }
    
    // Password field
    else if (element.tag === 'input' && element.attributes.type === 'password') {
      elements.passwordField = element;
    }
    
    // Submit button
    else if ((element.tag === 'button' || element.attributes.type === 'submit') &&
             (element.text?.toLowerCase().includes('log') ||
              element.text?.toLowerCase().includes('sign') ||
              element.text?.toLowerCase().includes('submit'))) {
      elements.submitButton = element;
    }
    
    // Remember me checkbox
    else if (element.tag === 'input' && element.attributes.type === 'checkbox' &&
             (element.attributes.name?.includes('remember') ||
              element.text?.toLowerCase().includes('remember'))) {
      elements.rememberCheckbox = element;
    }
  }
  
  // Fallback: find any text input before password field
  if (!elements.usernameField && !elements.emailField && elements.passwordField) {
    const passwordIndex = Array.from(dom.elements.values()).findIndex(e => e === elements.passwordField);
    const textInputs = Array.from(dom.elements.values())
      .slice(0, passwordIndex)
      .filter((e: DOMElement) => e.tag === 'input' && (e.attributes.type === 'text' || !e.attributes.type));
    
    if (textInputs.length > 0) {
      elements.usernameField = textInputs[textInputs.length - 1];
    }
  }
  
  return elements;
}

/**
 * Check if 2FA is required
 */
async function check2FARequired(page: Page): Promise<boolean> {
  const content = await page.textContent('body');
  const keywords = ['verification code', 'two-factor', '2fa', 'authenticator', 'verify your identity'];
  
  return keywords.some(keyword => content.toLowerCase().includes(keyword));
}

/**
 * Handle 2FA with TOTP
 */
async function handle2FA(page: Page, totpSecret: string): Promise<void> {
  // Would need to import a TOTP library in production
  // For now, just demonstrate the pattern
  core.info('2FA handling would generate TOTP code here');
  
  // Find OTP input field
  const otpInput = await page.$('input[type="text"][maxlength="6"], input[type="number"][maxlength="6"]');
  if (otpInput) {
    // In production: const code = generateTOTP(totpSecret);
    const code = '123456'; // Placeholder
    await otpInput.fill(code);
    
    // Submit OTP
    const submitButton = await page.$('button[type="submit"], button:has-text("Verify")');
    if (submitButton) {
      await submitButton.click();
    } else {
      await page.keyboard.press('Enter');
    }
  }
}

/**
 * Verify login was successful
 */
async function verifyLoginSuccess(page: Page, username?: string): Promise<boolean> {
  const url = page.url();
  const content = await page.textContent('body');
  
  // Check URL changed from login
  if (url.includes('/login') || url.includes('/signin')) {
    return false;
  }
  
  // Look for success indicators
  const successIndicators = [
    'dashboard', 'home', 'profile', 'account', 'welcome',
    'logout', 'sign out', 'settings'
  ];
  
  const hasSuccessIndicator = successIndicators.some(indicator => 
    content.toLowerCase().includes(indicator)
  );
  
  // Check for username in page
  if (username && content.includes(username)) {
    return true;
  }
  
  // Check for user menu elements
  const userElements = await page.$$('[class*="user"], [class*="avatar"], [class*="profile"]');
  
  return hasSuccessIndicator || userElements.length > 0;
}

/**
 * Find logout elements
 */
function findLogoutElements(dom: IndexedDOM, indexer: DOMIndexer): DOMElement[] {
  const logoutElements: DOMElement[] = [];
  
  for (const [id, element] of dom.elements) {
    if (!element.isVisible || !element.isInteractive) continue;
    
    const text = (element.text || '').toLowerCase();
    const href = (element.attributes.href || '').toLowerCase();
    
    if (text.includes('logout') || text.includes('log out') || 
        text.includes('sign out') || href.includes('logout')) {
      logoutElements.push(element);
    }
  }
  
  return logoutElements;
}

/**
 * Find user menu elements
 */
function findUserMenuElements(dom: IndexedDOM, indexer: DOMIndexer): DOMElement[] {
  const menuElements: DOMElement[] = [];
  
  for (const [id, element] of dom.elements) {
    if (!element.isVisible || !element.isInteractive) continue;
    
    const classes = element.attributes.class || '';
    const role = element.attributes.role || '';
    
    if (classes.includes('avatar') || classes.includes('user') || 
        classes.includes('profile') || role === 'menu') {
      menuElements.push(element);
    }
  }
  
  return menuElements;
}