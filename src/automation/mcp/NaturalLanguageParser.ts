import * as core from '@actions/core';
import { MCPAction } from './MCPManager';

/**
 * Natural Language Parser for YoFix commands
 * Converts natural language instructions into structured MCP actions
 */
export class NaturalLanguageParser {
  private commandPatterns: Map<string, RegExp[]>;
  private routeCache: Map<string, string>;

  constructor() {
    this.commandPatterns = new Map();
    this.routeCache = new Map();
    this.initializePatterns();
  }

  /**
   * Initialize command patterns for natural language parsing
   */
  private initializePatterns(): void {
    // Navigation patterns
    this.commandPatterns.set('navigate', [
      /(?:go to|navigate to|open|visit)\s+(.+)/i,
      /check\s+(?:the\s+)?(.+?)(?:\s+page)?$/i,
      /look at\s+(?:the\s+)?(.+?)(?:\s+page)?$/i
    ]);

    // Click patterns
    this.commandPatterns.set('click', [
      /click\s+(?:on\s+)?(?:the\s+)?(.+)/i,
      /press\s+(?:the\s+)?(.+?)(?:\s+button)?$/i,
      /tap\s+(?:on\s+)?(?:the\s+)?(.+)/i,
      /select\s+(?:the\s+)?(.+)/i
    ]);

    // Type/Input patterns
    this.commandPatterns.set('type', [
      /(?:type|enter|input)\s+["'](.+?)["']\s+(?:in|into)\s+(?:the\s+)?(.+)/i,
      /fill\s+(?:in\s+)?(?:the\s+)?(.+?)\s+with\s+["'](.+?)["']/i,
      /set\s+(?:the\s+)?(.+?)\s+to\s+["'](.+?)["']/i
    ]);

    // Scroll patterns
    this.commandPatterns.set('scroll', [
      /scroll\s+(?:down|up)\s*(?:by\s+)?(\d+)?(?:\s*pixels)?/i,
      /scroll\s+to\s+(?:the\s+)?(?:bottom|top|end|beginning)/i,
      /scroll\s+to\s+(?:the\s+)?(.+)/i
    ]);

    // Visual check patterns
    this.commandPatterns.set('visual', [
      /(?:check|verify|ensure)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:looks|appears)\s+(.+)/i,
      /(?:the\s+)?(.+?)\s+should\s+(?:be\s+)?(.+)/i,
      /(?:check|verify)\s+visual\s+(?:appearance|layout|design)/i
    ]);

    // Wait patterns
    this.commandPatterns.set('wait', [
      /wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|ms|milliseconds?)?/i,
      /wait\s+(?:for|until)\s+(?:the\s+)?(.+?)\s+(?:appears|loads|is visible)/i,
      /pause\s+(?:for\s+)?(\d+)/i
    ]);

    // Hover patterns
    this.commandPatterns.set('hover', [
      /hover\s+(?:over|on)\s+(?:the\s+)?(.+)/i,
      /move\s+(?:mouse\s+)?(?:to|over)\s+(?:the\s+)?(.+)/i
    ]);

    // Screenshot patterns
    this.commandPatterns.set('screenshot', [
      /(?:take|capture)\s+(?:a\s+)?screenshot/i,
      /screenshot\s+(?:the\s+)?(.+)/i,
      /capture\s+(?:the\s+)?(?:current\s+)?(?:page|screen|view)/i
    ]);

    // Form patterns
    this.commandPatterns.set('form', [
      /fill\s+(?:out|in)\s+(?:the\s+)?form/i,
      /submit\s+(?:the\s+)?form/i,
      /complete\s+(?:the\s+)?(.+?)\s+form/i
    ]);

    // Login patterns
    this.commandPatterns.set('login', [
      /log\s*in\s+(?:with\s+)?(?:email\s+)?["']?(.+?)["']?\s+(?:and\s+)?(?:password\s+)?["']?(.+?)["']?/i,
      /sign\s*in\s+(?:as\s+)?["']?(.+?)["']?/i,
      /authenticate\s+(?:with\s+)?["']?(.+?)["']?/i
    ]);
  }

  /**
   * Parse natural language command into structured MCP actions
   */
  async parse(command: string): Promise<MCPAction[]> {
    const actions: MCPAction[] = [];
    const normalizedCommand = command.trim().toLowerCase();

    // Check for compound commands (commands with "and", "then", etc.)
    const segments = this.splitCompoundCommand(command);
    
    for (const segment of segments) {
      const action = await this.parseSegment(segment);
      if (action) {
        actions.push(action);
      }
    }

    // If no actions were parsed, try to infer from context
    if (actions.length === 0) {
      const inferredAction = await this.inferFromContext(command);
      if (inferredAction) {
        actions.push(inferredAction);
      }
    }

    return actions;
  }

  /**
   * Parse a single command segment
   */
  private async parseSegment(segment: string): Promise<MCPAction | null> {
    const trimmedSegment = segment.trim();

    // Check navigation patterns
    const navAction = this.matchPattern('navigate', trimmedSegment);
    if (navAction) {
      return {
        type: 'navigate',
        params: { url: this.resolveUrl(navAction.groups[1]) }
      };
    }

    // Check click patterns
    const clickAction = this.matchPattern('click', trimmedSegment);
    if (clickAction) {
      return {
        type: 'click',
        params: { selector: await this.findSelector(clickAction.groups[1]) }
      };
    }

    // Check type patterns
    const typeAction = this.matchPattern('type', trimmedSegment);
    if (typeAction) {
      const text = typeAction.groups[1] || typeAction.groups[2];
      const target = typeAction.groups[2] || typeAction.groups[1];
      return {
        type: 'type',
        params: {
          selector: await this.findSelector(target),
          text: text
        }
      };
    }

    // Check scroll patterns
    const scrollAction = this.matchPattern('scroll', trimmedSegment);
    if (scrollAction) {
      return this.parseScrollAction(trimmedSegment);
    }

    // Check wait patterns
    const waitAction = this.matchPattern('wait', trimmedSegment);
    if (waitAction) {
      return this.parseWaitAction(waitAction);
    }

    // Check hover patterns
    const hoverAction = this.matchPattern('hover', trimmedSegment);
    if (hoverAction) {
      return {
        type: 'hover',
        params: { selector: await this.findSelector(hoverAction.groups[1]) }
      };
    }

    // Check screenshot patterns
    const screenshotAction = this.matchPattern('screenshot', trimmedSegment);
    if (screenshotAction) {
      return {
        type: 'screenshot',
        params: { fullPage: trimmedSegment.includes('full') }
      };
    }

    // Check form patterns
    const formAction = this.matchPattern('form', trimmedSegment);
    if (formAction) {
      return this.parseFormAction(trimmedSegment);
    }

    // Check login patterns
    const loginAction = this.matchPattern('login', trimmedSegment);
    if (loginAction) {
      return this.parseLoginAction(loginAction);
    }

    // Check visual patterns
    const visualAction = this.matchPattern('visual', trimmedSegment);
    if (visualAction) {
      return this.parseVisualAction(trimmedSegment);
    }

    return null;
  }

  /**
   * Match command against patterns
   */
  private matchPattern(type: string, command: string): { groups: string[] } | null {
    const patterns = this.commandPatterns.get(type);
    if (!patterns) return null;

    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match) {
        return { groups: match.slice(1) };
      }
    }

    return null;
  }

  /**
   * Split compound commands
   */
  private splitCompoundCommand(command: string): string[] {
    // Split by common conjunctions and sequence words
    const separators = /(?:\s+(?:and|then|after that|next|finally)\s+)/i;
    const segments = command.split(separators);
    
    // Also split by punctuation that indicates sequence
    const finalSegments: string[] = [];
    for (const segment of segments) {
      const subSegments = segment.split(/[.;,]\s*/);
      finalSegments.push(...subSegments.filter(s => s.trim()));
    }

    return finalSegments;
  }

  /**
   * Parse scroll action with direction and amount
   */
  private parseScrollAction(command: string): MCPAction {
    const downMatch = command.match(/down(?:\s+by\s+)?(\d+)?/i);
    const upMatch = command.match(/up(?:\s+by\s+)?(\d+)?/i);
    const bottomMatch = command.match(/bottom|end/i);
    const topMatch = command.match(/top|beginning/i);

    if (bottomMatch) {
      return {
        type: 'scroll',
        params: { direction: 'bottom' }
      };
    } else if (topMatch) {
      return {
        type: 'scroll',
        params: { direction: 'top' }
      };
    } else if (downMatch) {
      return {
        type: 'scroll',
        params: { 
          direction: 'down', 
          amount: downMatch[1] ? parseInt(downMatch[1]) : 500 
        }
      };
    } else if (upMatch) {
      return {
        type: 'scroll',
        params: { 
          direction: 'up', 
          amount: upMatch[1] ? parseInt(upMatch[1]) : 500 
        }
      };
    }

    // Default to scroll down
    return {
      type: 'scroll',
      params: { direction: 'down', amount: 500 }
    };
  }

  /**
   * Parse wait action
   */
  private parseWaitAction(match: { groups: string[] }): MCPAction {
    const timeMatch = match.groups[0];
    if (timeMatch && /^\d+$/.test(timeMatch)) {
      // Convert to milliseconds
      const value = parseInt(timeMatch);
      const timeout = value < 100 ? value * 1000 : value; // Assume seconds if < 100
      return {
        type: 'wait',
        params: { timeout }
      };
    }

    // Wait for element
    return {
      type: 'wait',
      params: { selector: match.groups[0] || match.groups[1] }
    };
  }

  /**
   * Parse form action
   */
  private parseFormAction(command: string): MCPAction {
    if (command.includes('submit')) {
      return {
        type: 'click',
        params: { selector: 'button[type="submit"], input[type="submit"]' }
      };
    }

    // Return a compound action for form filling
    return {
      type: 'evaluate',
      params: {
        script: `
          // Auto-fill form fields with test data
          document.querySelectorAll('input[type="text"]').forEach(input => {
            if (!input.value) input.value = 'Test Value';
          });
          document.querySelectorAll('input[type="email"]').forEach(input => {
            if (!input.value) input.value = 'test@example.com';
          });
          document.querySelectorAll('input[type="tel"]').forEach(input => {
            if (!input.value) input.value = '555-0123';
          });
          document.querySelectorAll('textarea').forEach(textarea => {
            if (!textarea.value) textarea.value = 'Test description';
          });
        `
      }
    };
  }

  /**
   * Parse login action
   */
  private parseLoginAction(match: { groups: string[] }): MCPAction {
    const email = match.groups[0];
    const password = match.groups[1] || 'password123';

    return {
      type: 'evaluate',
      params: {
        script: `
          // Fill login form
          const emailInput = document.querySelector('input[type="email"], input[name*="email"], input[name*="username"]');
          const passwordInput = document.querySelector('input[type="password"]');
          
          if (emailInput) emailInput.value = '${email}';
          if (passwordInput) passwordInput.value = '${password}';
          
          // Try to submit
          const submitButton = document.querySelector('button[type="submit"], button:contains("Login"), button:contains("Sign In")');
          if (submitButton) submitButton.click();
        `
      }
    };
  }

  /**
   * Parse visual action
   */
  private parseVisualAction(command: string): MCPAction {
    // For visual checks, take a screenshot and let the analyzer handle it
    return {
      type: 'screenshot',
      params: { 
        fullPage: false,
        visual: true,
        description: command 
      }
    };
  }

  /**
   * Try to infer action from context
   */
  private async inferFromContext(command: string): Promise<MCPAction | null> {
    const lowerCommand = command.toLowerCase();

    // Common UI element references
    if (lowerCommand.includes('button') || lowerCommand.includes('submit')) {
      const buttonText = this.extractQuotedText(command) || command;
      return {
        type: 'click',
        params: { selector: `button:contains("${buttonText}")` }
      };
    }

    // Form field references
    if (lowerCommand.includes('field') || lowerCommand.includes('input')) {
      const fieldName = this.extractQuotedText(command) || 'input';
      return {
        type: 'click',
        params: { selector: `input[name*="${fieldName}"], input[placeholder*="${fieldName}"]` }
      };
    }

    // Menu/navigation references
    if (lowerCommand.includes('menu') || lowerCommand.includes('nav')) {
      return {
        type: 'click',
        params: { selector: 'nav, [role="navigation"], .menu, .nav' }
      };
    }

    return null;
  }

  /**
   * Find selector from natural language description
   */
  private async findSelector(description: string): Promise<string> {
    const desc = description.trim().toLowerCase();

    // Common UI elements mapping
    const elementMap: Record<string, string> = {
      'submit button': 'button[type="submit"], input[type="submit"]',
      'login button': 'button:contains("Login"), button:contains("Sign In")',
      'signup button': 'button:contains("Sign Up"), button:contains("Register")',
      'close button': 'button[aria-label="Close"], .close, button:contains("Close")',
      'menu': 'nav, [role="navigation"], .menu',
      'header': 'header, [role="banner"], .header',
      'footer': 'footer, [role="contentinfo"], .footer',
      'sidebar': 'aside, [role="complementary"], .sidebar',
      'search': 'input[type="search"], input[placeholder*="Search"]',
      'email field': 'input[type="email"], input[name*="email"]',
      'password field': 'input[type="password"]',
      'name field': 'input[name*="name"], input[placeholder*="Name"]'
    };

    // Check if it matches a known element
    for (const [key, selector] of Object.entries(elementMap)) {
      if (desc.includes(key)) {
        return selector;
      }
    }

    // Check if it's already a selector
    if (desc.startsWith('#') || desc.startsWith('.') || desc.includes('[')) {
      return description;
    }

    // Try to build a text-based selector
    const quotedText = this.extractQuotedText(description);
    if (quotedText) {
      return `text="${quotedText}"`;
    }

    // Default to searching by text content
    return `text="${description}"`;
  }

  /**
   * Resolve URL from description
   */
  private resolveUrl(urlOrPath: string): string {
    const normalized = urlOrPath.trim();

    // Check if it's already a full URL
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      return normalized;
    }

    // Check route cache
    if (this.routeCache.has(normalized)) {
      return this.routeCache.get(normalized)!;
    }

    // Common page mappings
    const pageMap: Record<string, string> = {
      'home': '/',
      'homepage': '/',
      'dashboard': '/dashboard',
      'profile': '/profile',
      'settings': '/settings',
      'login': '/login',
      'signup': '/signup',
      'register': '/register',
      'about': '/about',
      'contact': '/contact'
    };

    const lowerNormalized = normalized.toLowerCase();
    for (const [key, path] of Object.entries(pageMap)) {
      if (lowerNormalized.includes(key)) {
        return path;
      }
    }

    // If it looks like a path, return as-is
    if (normalized.startsWith('/')) {
      return normalized;
    }

    // Otherwise, assume it's a path without leading slash
    return `/${normalized}`;
  }

  /**
   * Extract quoted text from string
   */
  private extractQuotedText(text: string): string | null {
    const match = text.match(/["']([^"']+)["']/);
    return match ? match[1] : null;
  }

  /**
   * Update route cache with discovered routes
   */
  updateRouteCache(routes: Map<string, string>): void {
    this.routeCache = new Map([...this.routeCache, ...routes]);
  }
}