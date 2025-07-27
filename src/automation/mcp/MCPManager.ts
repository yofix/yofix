import * as core from '@actions/core';
import { Page, Browser, BrowserContext } from 'playwright';
import { BrowserSecuritySandbox } from '../security/BrowserSecuritySandbox';
import { MCPOptions, MCPState, MCPAction, MCPResult, ElementInfo, ConsoleMessage, NetworkRequest } from './types';

/**
 * Model Context Protocol (MCP) Manager for browser automation
 * Provides a unified interface for AI models to control browsers
 */
export class MCPManager {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected actions: MCPAction[] = [];
  protected state: MCPState;
  protected securitySandbox: BrowserSecuritySandbox;

  constructor() {
    this.state = {
      url: '',
      title: '',
      elements: new Map(),
      viewport: { width: 1920, height: 1080 },
      cookies: [],
      localStorage: {},
      sessionStorage: {},
      console: [],
      network: []
    };
    this.securitySandbox = new BrowserSecuritySandbox();
  }

  /**
   * Initialize browser with MCP controls
   */
  async initialize(options?: MCPOptions): Promise<void> {
    const { chromium } = await import('playwright');
    
    this.browser = await chromium.launch({
      headless: options?.headless ?? true,
      args: options?.browserArgs || [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    });
    
    this.context = await this.browser.newContext({
      viewport: options?.viewport || { width: 1920, height: 1080 },
      userAgent: options?.userAgent || 'YoFix MCP Browser/1.0',
      // Security: Disable permissions that could be exploited
      permissions: [],
      // Disable geolocation
      geolocation: undefined,
      // Clear cookies and storage
      storageState: undefined,
      ...options?.contextOptions
    });
    
    this.page = await this.context.newPage();
    
    // Set up event listeners
    this.setupEventListeners();
    
    core.info('MCP browser initialized');
  }

  /**
   * Execute a natural language command
   */
  async executeCommand(command: string): Promise<MCPResult> {
    try {
      const action = await this.parseCommand(command);
      return await this.executeAction(action);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        state: this.state
      };
    }
  }

  /**
   * Execute a structured MCP action
   */
  async executeAction(action: MCPAction): Promise<MCPResult> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    // Validate action with security sandbox
    const validation = await this.securitySandbox.validateAction(action);
    if (!validation.valid) {
      return {
        success: false,
        error: `Security validation failed: ${validation.error}`,
        state: this.state
      };
    }
    
    // Log action for audit
    this.actions.push(action);
    
    try {
      switch (action.type) {
        case 'navigate':
          await this.navigate(action.params.url);
          break;
          
        case 'click':
          await this.click(action.params.selector);
          break;
          
        case 'type':
          await this.type(action.params.selector, action.params.text);
          break;
          
        case 'hover':
          await this.hover(action.params.selector);
          break;
          
        case 'scroll':
          await this.scroll(action.params);
          break;
          
        case 'screenshot':
          return await this.screenshot(action.params);
          
        case 'extract':
          return await this.extract(action.params);
          
        case 'wait':
          await this.wait(action.params);
          break;
          
        case 'evaluate':
          return await this.evaluate(action.params.script);
          
        case 'select':
          await this.select(action.params.selector, action.params.value);
          break;
          
        case 'upload':
          await this.upload(action.params.selector, action.params.files);
          break;
          
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
      
      // Update state after action
      await this.updateState();
      
      // Actions that return data have already done so in the switch cases
      
      return {
        success: true,
        data: undefined, // Data is returned directly by actions that produce it
        state: this.state
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        state: this.state
      };
    }
  }

  /**
   * Parse natural language command into MCP action
   */
  private async parseCommand(command: string): Promise<MCPAction> {
    const lowerCommand = command.toLowerCase();
    
    // Navigation commands
    if (lowerCommand.includes('go to') || lowerCommand.includes('navigate to')) {
      const urlMatch = command.match(/(?:go to|navigate to)\s+(.+)/i);
      if (urlMatch) {
        return {
          type: 'navigate',
          params: { url: urlMatch[1].trim() }
        };
      }
    }
    
    // Click commands
    if (lowerCommand.includes('click')) {
      const patterns = [
        /click (?:on |the )?(.+)/i,
        /click (.+) button/i,
        /press (.+)/i
      ];
      
      for (const pattern of patterns) {
        const match = command.match(pattern);
        if (match) {
          const selector = await this.findSelector(match[1].trim());
          return {
            type: 'click',
            params: { selector }
          };
        }
      }
    }
    
    // Type commands
    if (lowerCommand.includes('type') || lowerCommand.includes('enter') || lowerCommand.includes('fill')) {
      const patterns = [
        /(?:type|enter) ["'](.+)["'] (?:in|into) (.+)/i,
        /fill (.+) with ["'](.+)["']/i
      ];
      
      for (const pattern of patterns) {
        const match = command.match(pattern);
        if (match) {
          const text = match[1];
          const selector = await this.findSelector(match[2].trim());
          return {
            type: 'type',
            params: { selector, text }
          };
        }
      }
    }
    
    // Screenshot commands
    if (lowerCommand.includes('screenshot') || lowerCommand.includes('capture')) {
      const fullPage = lowerCommand.includes('full');
      return {
        type: 'screenshot',
        params: { fullPage }
      };
    }
    
    // Scroll commands
    if (lowerCommand.includes('scroll')) {
      if (lowerCommand.includes('down')) {
        return {
          type: 'scroll',
          params: { direction: 'down', amount: 500 }
        };
      } else if (lowerCommand.includes('up')) {
        return {
          type: 'scroll',
          params: { direction: 'up', amount: 500 }
        };
      } else if (lowerCommand.includes('to bottom')) {
        return {
          type: 'scroll',
          params: { direction: 'bottom' }
        };
      }
    }
    
    // Wait commands
    if (lowerCommand.includes('wait')) {
      const timeMatch = command.match(/wait (?:for )?(\d+)/i);
      if (timeMatch) {
        return {
          type: 'wait',
          params: { timeout: parseInt(timeMatch[1]) * 1000 }
        };
      }
      
      const selectorMatch = command.match(/wait (?:for|until) (.+)/i);
      if (selectorMatch) {
        const selector = await this.findSelector(selectorMatch[1].trim());
        return {
          type: 'wait',
          params: { selector }
        };
      }
    }
    
    throw new Error(`Could not parse command: ${command}`);
  }

  /**
   * Find selector from natural language description
   */
  private async findSelector(description: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');
    
    // Check if it's already a valid selector
    if (description.startsWith('.') || description.startsWith('#') || description.includes('[')) {
      return description;
    }
    
    // Try to find by text content
    const textSelector = `text=${description}`;
    const hasText = await this.page.locator(textSelector).count() > 0;
    if (hasText) {
      return textSelector;
    }
    
    // Try to find by placeholder
    const placeholderSelector = `[placeholder*="${description}"]`;
    const hasPlaceholder = await this.page.locator(placeholderSelector).count() > 0;
    if (hasPlaceholder) {
      return placeholderSelector;
    }
    
    // Try to find by aria-label
    const ariaSelector = `[aria-label*="${description}"]`;
    const hasAria = await this.page.locator(ariaSelector).count() > 0;
    if (hasAria) {
      return ariaSelector;
    }
    
    // Try to find by title
    const titleSelector = `[title*="${description}"]`;
    const hasTitle = await this.page.locator(titleSelector).count() > 0;
    if (hasTitle) {
      return titleSelector;
    }
    
    // Use AI to find the best selector
    return await this.findSelectorWithAI(description);
  }

  /**
   * Use AI to find selector from page context
   */
  private async findSelectorWithAI(description: string): Promise<string> {
    // This would use Claude to analyze the page and find the best selector
    // For now, throw an error
    throw new Error(`Could not find element matching: ${description}`);
  }

  /**
   * Navigation action
   */
  private async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    // Handle relative URLs
    if (!url.startsWith('http')) {
      if (this.state.url) {
        const base = new URL(this.state.url);
        url = new URL(url, base).toString();
      } else {
        url = `https://${url}`;
      }
    }
    
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }

  /**
   * Click action
   */
  private async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.click(selector);
  }

  /**
   * Type action
   */
  private async type(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.fill(selector, text);
  }

  /**
   * Hover action
   */
  private async hover(selector: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.hover(selector);
  }

  /**
   * Scroll action
   */
  private async scroll(params: any): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    if (params.direction === 'bottom') {
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    } else if (params.direction === 'top') {
      await this.page.evaluate(() => window.scrollTo(0, 0));
    } else {
      const amount = params.amount || 500;
      const direction = params.direction === 'up' ? -amount : amount;
      await this.page.evaluate((y) => window.scrollBy(0, y), direction);
    }
  }

  /**
   * Screenshot action
   */
  private async screenshot(params: any): Promise<MCPResult> {
    if (!this.page) throw new Error('Page not initialized');
    
    const screenshot = await this.page.screenshot({
      fullPage: params.fullPage || false
    });
    
    return {
      success: true,
      data: {
        type: 'screenshot',
        buffer: screenshot,
        timestamp: Date.now()
      },
      state: this.state
    };
  }

  /**
   * Extract data from page
   */
  private async extract(params: any): Promise<MCPResult> {
    if (!this.page) throw new Error('Page not initialized');
    
    const data = await this.page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      
      return {
        text: element.textContent,
        html: element.innerHTML,
        attributes: Array.from(element.attributes).reduce((acc: Record<string, string>, attr: Attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {})
      };
    }, params.selector);
    
    return {
      success: true,
      data,
      state: this.state
    };
  }

  /**
   * Wait action
   */
  private async wait(params: any): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    if (params.selector) {
      await this.page.waitForSelector(params.selector, {
        timeout: params.timeout || 30000
      });
    } else if (params.timeout) {
      await this.page.waitForTimeout(params.timeout);
    }
  }

  /**
   * Evaluate JavaScript
   */
  private async evaluate(script: string): Promise<MCPResult> {
    if (!this.page) throw new Error('Page not initialized');
    
    // Wrap script in safe context
    const safeScript = this.securitySandbox.createSafeContext().replace(
      '// Your code here',
      script
    );
    
    const result = await this.page.evaluate(safeScript);
    
    return {
      success: true,
      data: result,
      state: this.state
    };
  }

  /**
   * Select dropdown option
   */
  private async select(selector: string, value: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.selectOption(selector, value);
  }

  /**
   * Upload files
   */
  private async upload(selector: string, files: string[]): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.setInputFiles(selector, files);
  }

  /**
   * Update state after action
   */
  private async updateState(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    this.state.url = this.page.url();
    this.state.title = await this.page.title();
    
    // Update viewport
    const viewport = this.page.viewportSize();
    if (viewport) {
      this.state.viewport = viewport;
    }
    
    // Get visible elements
    const elements = await this.page.evaluate(() => {
      const els = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
      return Array.from(els).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim() || '',
        type: (el as any).type || '',
        placeholder: (el as any).placeholder || '',
        href: (el as any).href || '',
        id: el.id || '',
        class: el.className || ''
      }));
    });
    
    this.state.elements.clear();
    elements.forEach((el: any, index: number) => {
      const elementInfo: ElementInfo = {
        selector: `element-${index}`,
        text: el.text,
        attributes: {
          tag: el.tag,
          type: el.type,
          placeholder: el.placeholder,
          href: el.href,
          id: el.id,
          class: el.class
        },
        visible: true,
        clickable: ['button', 'a', 'input'].includes(el.tag)
      };
      this.state.elements.set(`element-${index}`, elementInfo);
    });
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    if (!this.page) return;
    
    // Console messages
    this.page.on('console', msg => {
      const msgType = msg.type();
      // Map Playwright console types to our ConsoleMessage types
      const type: ConsoleMessage['type'] = 
        msgType === 'error' ? 'error' :
        msgType === 'warning' ? 'warning' :
        msgType === 'info' ? 'info' : 'log';
        
      this.state.console.push({
        type,
        text: msg.text(),
        timestamp: Date.now()
      });
    });
    
    // Network requests
    this.page.on('request', request => {
      this.state.network.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: Date.now(),
        type: 'request'
      });
    });
    
    this.page.on('response', response => {
      const existingRequest = this.state.network.find(r => r.url === response.url() && !r.status);
      if (existingRequest) {
        existingRequest.status = response.status();
        existingRequest.responseHeaders = response.headers();
      } else {
        this.state.network.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          headers: response.request().headers(),
          responseHeaders: response.headers(),
          timestamp: Date.now(),
          type: 'response'
        });
      }
    });
  }

  /**
   * Get data from action result
   */
  private async getActionData(action: MCPAction): Promise<any> {
    // Implementation depends on action type
    return null;
  }

  /**
   * Get current state
   */
  getState(): MCPState {
    return { ...this.state };
  }

  /**
   * Get action history
   */
  getHistory(): MCPAction[] {
    return [...this.actions];
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}

// Re-export types from types.ts
export { MCPOptions, MCPState, MCPAction, MCPResult } from './types';