/**
 * LLM-Driven Browser Automation Agent
 * Uses Claude to generate Playwright actions from natural language instructions
 */

import { Page, ElementHandle } from 'playwright';
import { Anthropic } from '@anthropic-ai/sdk';

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
    try {
      if (debug) console.log(`🤖 Executing task: ${task}`);

      // Step 1: Capture DOM snapshot
      const snapshot = await this.captureDOMSnapshot(page);
      if (debug) console.log(`📸 Captured DOM snapshot with ${snapshot.elements.length} elements`);

      // Step 2: Generate actions using LLM
      const actions = await this.generateActions(task, snapshot, debug);
      if (debug) console.log(`🎯 Generated ${actions.length} actions:`, actions);

      // Step 3: Execute actions
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (debug) console.log(`\n⚡ Executing action ${i + 1}/${actions.length}:`, action);
        
        try {
          await this.executeAction(page, action);
          if (debug) console.log(`  ✅ Action completed`);
        } catch (error) {
          if (debug) console.log(`  ❌ Action failed:`, error.message);
          throw error;
        }
      }

      return true;
    } catch (error) {
      if (debug) console.error('❌ Task execution failed:', error);
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

Your goal is to generate a list of DOM-based browser actions to accomplish the user's task using Playwright.  
You are given:

1. A user-defined task
2. A simplified snapshot of the current web page's structure (visible text, DOM elements, attributes)

### Rules:
- Output actions as JSON only, no other text.
- Use Playwright-compatible selectors like \`text=\`, \`input[name=]\`, \`button:has-text()\`, \`[role=]\`, \`[aria-label=]\`.
- Do not guess URLs unless given.
- Each action must include:
  - \`action\`: one of \`click\`, \`fill\`, \`goto\`, \`press\`, \`wait\`
  - \`selector\`: DOM selector (unless \`goto\` or \`wait\`)
  - \`value\`: (for \`fill\` or \`press\` actions)

---

### 📌 Task:
${task}

### 🌐 Page Snapshot:
URL: ${snapshot.url}
Title: ${snapshot.title}

Elements:
${simplifiedElements}

### ✅ Output Format:
\`\`\`json
[
  {
    "action": "fill",
    "selector": "input[name='username']",
    "value": "my-email@example.com"
  },
  {
    "action": "click",
    "selector": "button:has-text('Sign in')"
  }
]
\`\`\``;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0].type === 'text' ? response.content[0].text : '';
      
      // Extract JSON from the response
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const actions = JSON.parse(jsonMatch[1]) as BrowserAction[];
      return actions;

    } catch (error) {
      if (debug) console.error('Failed to generate actions:', error);
      throw error;
    }
  }

  /**
   * Execute a single browser action
   */
  async executeAction(page: Page, action: BrowserAction): Promise<void> {
    switch (action.action) {
      case 'click':
        await page.click(action.selector!, { timeout: action.timeout || 10000 });
        break;

      case 'fill':
        await page.fill(action.selector!, action.value || '', { timeout: action.timeout || 10000 });
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
        await page.waitForSelector(action.selector!, { timeout: action.timeout || 30000 });
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
  if (!apiKey) {
    if (debug) console.log('⚠️ No Claude API key provided, skipping LLM authentication');
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
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
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