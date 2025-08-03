/**
 * LLM-Driven Browser Automation Agent
 * Uses Claude to generate Playwright actions from natural language instructions
 */

import { Page, ElementHandle } from 'playwright';
import { Anthropic } from '@anthropic-ai/sdk';
import config from '../config';
import { createModuleLogger, createTryCatch } from '../core/error/ErrorHandlerFactory';
import { ErrorSeverity, ErrorCategory } from '../core';

const logger = createModuleLogger({
  module: 'LLMBrowserAgent',
  defaultCategory: ErrorCategory.AI
});

const tryCatch = createTryCatch(logger);

export interface BrowserAction {
  action: 'click' | 'fill' | 'goto' | 'press' | 'wait_for' | 'wait' | 'screenshot';
  selector?: string;
  value?: string;
  timeout?: number;
}

export interface DOMSnapshot {
  url: string;
  title: string;
  elements: DOMElement[];
}

export interface DOMElement {
  tag: string;
  text?: string;
  attributes: Record<string, string>;
  visible: boolean;
  interactive: boolean;
  path: string; // CSS path for unique identification
}

export class LLMBrowserAgent {
  private claude: Anthropic;

  constructor(private apiKey: string) {
    this.claude = new Anthropic({ apiKey });
  }

  /**
   * Execute a natural language task on the page
   */
  async executeTask(page: Page, task: string, debug?: boolean): Promise<boolean> {
    const log = createModuleLogger({ 
      module: 'LLMBrowserAgent', 
      debug,
      defaultCategory: ErrorCategory.AI 
    });
    
    try {
      log.debug(`🤖 Executing task: ${task}`);

      // Step 1: Capture DOM snapshot
      const snapshot = await this.captureDOMSnapshot(page);
      log.debug(`📸 Captured DOM snapshot with ${snapshot.elements.length} elements`);

      // Step 2: Generate actions using LLM
      const actions = await this.generateActions(task, snapshot, debug);
      log.debug(`🎯 Generated ${actions.length} actions:`, actions);

      // Step 3: Execute actions
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        log.debug(`\n⚡ Executing action ${i + 1}/${actions.length}:`, action);
        
        try {
          await this.executeAction(page, action);
          log.debug(`  ✅ Action completed`);
        } catch (error) {
          await log.error(error as Error, {
            userAction: 'Execute browser action',
            severity: ErrorSeverity.MEDIUM,
            metadata: { action, index: i, totalActions: actions.length }
          });
          throw error;
        }
      }

      return true;
    } catch (error) {
      await log.error(error as Error, {
        userAction: 'Execute LLM browser task',
        severity: ErrorSeverity.HIGH,
        metadata: { task, url: page.url() }
      });
      return false;
    }
  }

  /**
   * Capture a simplified DOM snapshot
   */
  async captureDOMSnapshot(page: Page): Promise<DOMSnapshot> {
    const snapshot = await page.evaluate(() => {
      // Helper to get CSS selector path
      function getCSSPath(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el === document.body) return 'body';
        
        const siblings = Array.from(el.parentNode?.children || []);
        const index = siblings.indexOf(el) + 1;
        const tag = el.tagName.toLowerCase();
        const path = getCSSPath(el.parentElement as Element);
        
        return `${path} > ${tag}:nth-child(${index})`;
      }

      // Get all potentially interactive elements
      const elements: DOMElement[] = [];
      const interactiveSelectors = [
        'input', 'button', 'a', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[onclick]',
        'label'
      ];

      interactiveSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && 
                           (el as HTMLElement).offsetParent !== null;

          // Get relevant attributes
          const attributes: Record<string, string> = {};
          ['id', 'name', 'type', 'placeholder', 'aria-label', 'role', 'href', 'value'].forEach(attr => {
            const value = el.getAttribute(attr);
            if (value) attributes[attr] = value;
          });

          // Get class (simplified)
          if (el.className) {
            attributes.class = typeof el.className === 'string' 
              ? el.className.split(' ').slice(0, 3).join(' ') // First 3 classes only
              : '';
          }

          elements.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().substring(0, 100), // Limit text length
            attributes,
            visible: isVisible,
            interactive: true,
            path: getCSSPath(el)
          });
        });
      });

      // Also get some context elements (headings, labels)
      ['h1', 'h2', 'h3', 'label', '.error', '.alert'].forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          const existing = elements.find(e => e.path === getCSSPath(el));
          if (!existing) {
            elements.push({
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').trim().substring(0, 100),
              attributes: {},
              visible: true,
              interactive: false,
              path: getCSSPath(el)
            });
          }
        });
      });

      return {
        url: window.location.href,
        title: document.title,
        elements: elements.filter(el => el.visible) // Only visible elements
      };
    });

    return snapshot;
  }

  /**
   * Generate Playwright actions using Claude
   */
  async generateActions(task: string, snapshot: DOMSnapshot, debug?: boolean): Promise<BrowserAction[]> {
    // Prepare the DOM snapshot in a concise format
    const simplifiedElements = snapshot.elements.map(el => {
      const parts: string[] = [];
      
      // Tag and key attributes
      parts.push(el.tag);
      if (el.attributes.type) parts.push(`[type="${el.attributes.type}"]`);
      if (el.attributes.name) parts.push(`[name="${el.attributes.name}"]`);
      if (el.attributes.id) parts.push(`#${el.attributes.id}`);
      if (el.attributes.placeholder) parts.push(`[placeholder="${el.attributes.placeholder}"]`);
      if (el.attributes['aria-label']) parts.push(`[aria-label="${el.attributes['aria-label']}"]`);
      
      // Text content
      if (el.text && el.text.length > 0) {
        parts.push(`"${el.text}"`);
      }
      
      return parts.join(' ');
    }).join('\n');

    const prompt = `You are an expert web automation agent.

Your task is to generate Playwright browser actions to accomplish the user's goal.

IMPORTANT: Return ONLY a JSON array of actions. No explanations, no markdown, just the JSON array.

Task: ${task}

Current page: ${snapshot.url}
Page title: ${snapshot.title}

Available elements:
${simplifiedElements}

Valid actions:
- fill: Fill an input field (requires: selector, value)
- click: Click an element (requires: selector)
- press: Press a key (requires: selector or just value for global key press)
- wait: Wait for a duration (requires: value in milliseconds)
- goto: Navigate to URL (requires: value as URL)

Example response format:
[
  {"action": "fill", "selector": "input[name='email']", "value": "user@example.com"},
  {"action": "fill", "selector": "input[type='password']", "value": "password123"},
  {"action": "click", "selector": "button[type='submit']"}
]

Generate the actions needed to: ${task}`;

    try {
      const response = await this.claude.messages.create({
        model: config.get('ai.claude.models.navigation'),
        max_tokens: config.get('ai.claude.maxTokens.navigation'),
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0].type === 'text' ? response.content[0].text : '';
      
      // Extract JSON from the response
      let actions: BrowserAction[] = [];
      
      // First try to find JSON in markdown code block
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          actions = JSON.parse(jsonMatch[1]) as BrowserAction[];
        } catch (e) {
          logger.debug('Failed to parse JSON from code block:', e);
        }
      }
      
      // If no code block, try to parse the entire response as JSON
      if (actions.length === 0) {
        try {
          const parsed = JSON.parse(content);
          // Handle both array format and object with 'actions' property
          if (Array.isArray(parsed)) {
            actions = parsed as BrowserAction[];
          } else if (parsed.actions && Array.isArray(parsed.actions)) {
            actions = parsed.actions as BrowserAction[];
          }
        } catch (e) {
          // Last attempt: try to find any JSON array in the content
          const arrayMatch = content.match(/\[[\s\S]*?\]/);
          if (arrayMatch) {
            try {
              actions = JSON.parse(arrayMatch[0]) as BrowserAction[];
            } catch (e2) {
              logger.debug('Failed to parse JSON array:', e2);
            }
          }
        }
      }
      
      if (actions.length === 0) {
        throw new Error('No valid actions found in LLM response');
      }
      
      return actions;

    } catch (error) {
      await logger.error(error as Error, {
        userAction: 'Generate browser actions from LLM',
        severity: ErrorSeverity.HIGH,
        metadata: { task, url: snapshot.url, elementCount: snapshot.elements.length }
      });
      throw error;
    }
  }

  /**
   * Escape CSS special characters in selectors
   */
  private escapeCSSelector(selector: string): string {
    // If selector starts with #: (like React dynamic IDs), escape the colon
    if (selector.match(/^#:[^:]+:$/)) {
      // For selectors like #:r2:, we need to escape the colons
      return selector.replace(/:/g, '\\:');
    }
    // Return selector as-is for other cases (xpath, regular CSS, etc.)
    return selector;
  }

  /**
   * Execute a single browser action
   */
  async executeAction(page: Page, action: BrowserAction): Promise<void> {
    switch (action.action) {
      case 'click':
        // Escape CSS special characters in selector if needed
        const clickSelector = this.escapeCSSelector(action.selector!);
        await page.click(clickSelector, { timeout: action.timeout || config.get('auth.selectorTimeout') });
        break;

      case 'fill':
        // Escape CSS special characters in selector if needed
        const fillSelector = this.escapeCSSelector(action.selector!);
        await page.fill(fillSelector, action.value || '', { timeout: action.timeout || config.get('auth.selectorTimeout') });
        break;

      case 'goto':
        await page.goto(action.value!, { waitUntil: 'networkidle' });
        break;

      case 'press':
        if (action.selector) {
          await page.press(action.selector, action.value || 'Enter');
        } else {
          await page.keyboard.press(action.value || 'Enter');
        }
        break;

      case 'wait':
        await page.waitForTimeout(action.timeout || parseInt(action.value || '1000'));
        break;

      case 'wait_for':
        await page.waitForSelector(action.selector!, { timeout: action.timeout || config.get('browser.defaultTimeout') });
        break;

      case 'screenshot':
        await page.screenshot({ path: action.value || 'screenshot.png', fullPage: true });
        break;

      default:
        throw new Error(`Unknown action: ${action.action}`);
    }
  }
}

/**
 * Specific authentication helper using the LLM agent
 */
export async function authenticateWithLLM(
  page: Page,
  email: string,
  password: string,
  loginUrl?: string,
  apiKey?: string,
  debug?: boolean
): Promise<boolean> {
  const log = createModuleLogger({ 
    module: 'LLMBrowserAgent.authenticate', 
    debug,
    defaultCategory: ErrorCategory.AUTHENTICATION 
  });
  
  if (!apiKey) {
    log.warn('⚠️ No Claude API key provided, skipping LLM authentication');
    return false;
  }

  const agent = new LLMBrowserAgent(apiKey);

  // Navigate to login page if URL provided
  if (loginUrl) {
    await page.goto(loginUrl, { waitUntil: 'networkidle' });
  }

  // Create the authentication task
  const task = `Log in to this website with the following credentials:
- Email/Username: ${email}
- Password: ${password}

Find the email/username input field, fill it with the email.
Find the password input field, fill it with the password.
Click the submit/login button to complete authentication.`;

  const success = await agent.executeTask(page, task, debug);

  if (success) {
    // Wait for navigation
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: config.get('testing.defaultWaitTime') * 2.5 });
    } catch {
      await page.waitForTimeout(2000);
    }

    // Check if still on login page
    const currentUrl = page.url();
    const stillOnLogin = currentUrl.includes('/login') || currentUrl.includes('/signin');
    
    return !stillOnLogin;
  }

  return false;
}

/**
 * Generic task executor for extensibility
 */
export async function executeNaturalLanguageTask(
  page: Page,
  task: string,
  apiKey: string,
  debug?: boolean
): Promise<boolean> {
  const agent = new LLMBrowserAgent(apiKey);
  return await agent.executeTask(page, task, debug);
}