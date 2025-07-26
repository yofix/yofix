# YoFix MCP Integration

## Overview

YoFix integrates with Model Context Protocol (MCP) to enable advanced browser automation for on-demand testing through bot commands. This allows users to create custom tests via GitHub comments.

## MCP Architecture

### Why MCP?

1. **Flexibility**: Run custom browser automation scripts on-demand
2. **Power**: Access to full Playwright/Puppeteer APIs
3. **Safety**: Sandboxed execution environment
4. **Extensibility**: Easy to add new browser capabilities

### Supported MCP Providers

```yaml
# .yofix.yml
mcp:
  provider: playwright  # or puppeteer
  options:
    headless: true
    timeout: 30000
    viewport:
      width: 1920
      height: 1080
```

## Bot Command Structure

### Basic Commands

```bash
# Simple navigation test
@yofix test "go to /products and check if .product-grid exists"

# Multi-step test
@yofix test "login > navigate to /dashboard > click .settings-btn > verify .settings-panel"

# Custom viewport test
@yofix test mobile "go to /home and check responsive menu"
```

### Advanced Commands

```bash
# Complex user flow
@yofix test """
1. Go to /products
2. Click first product
3. Add to cart
4. Go to checkout
5. Verify total price
"""

# Visual regression test
@yofix compare "/dashboard" with baseline

# Performance test
@yofix test performance "/home" --metrics LCP,FID,CLS
```

## MCP Implementation

### Core MCP Manager

```typescript
// src/mcp/MCPManager.ts
import { PlaywrightMCP } from './PlaywrightMCP';
import { PuppeteerMCP } from './PuppeteerMCP';

export class MCPManager {
  private playwright: PlaywrightMCP;
  private puppeteer: PuppeteerMCP;
  private activeSession: MCPSession | null = null;
  
  async createSession(options: MCPOptions): Promise<MCPSession> {
    const provider = options.provider || 'playwright';
    
    if (provider === 'playwright') {
      this.activeSession = await this.playwright.createSession(options);
    } else {
      this.activeSession = await this.puppeteer.createSession(options);
    }
    
    return this.activeSession;
  }
  
  async executeCommand(command: string): Promise<TestResult> {
    if (!this.activeSession) {
      throw new Error('No active MCP session');
    }
    
    const parser = new CommandParser();
    const steps = parser.parse(command);
    
    const results = [];
    for (const step of steps) {
      const result = await this.activeSession.execute(step);
      results.push(result);
      
      if (result.error) {
        break;
      }
    }
    
    return {
      success: results.every(r => !r.error),
      steps: results,
      screenshots: results.map(r => r.screenshot).filter(Boolean)
    };
  }
}
```

### Playwright MCP Adapter

```typescript
// src/mcp/PlaywrightMCP.ts
import { chromium, Page, Browser } from 'playwright';

export class PlaywrightMCP {
  private browser: Browser | null = null;
  private page: Page | null = null;
  
  async createSession(options: MCPOptions): Promise<MCPSession> {
    this.browser = await chromium.launch({
      headless: options.headless ?? true
    });
    
    const context = await this.browser.newContext({
      viewport: options.viewport,
      userAgent: options.userAgent
    });
    
    this.page = await context.newPage();
    
    return {
      execute: this.execute.bind(this),
      close: this.close.bind(this)
    };
  }
  
  async execute(step: TestStep): Promise<StepResult> {
    if (!this.page) throw new Error('No page available');
    
    try {
      switch (step.action) {
        case 'navigate':
          await this.page.goto(step.url, { 
            waitUntil: 'networkidle' 
          });
          break;
          
        case 'click':
          await this.page.click(step.selector);
          break;
          
        case 'fill':
          await this.page.fill(step.selector, step.value);
          break;
          
        case 'check':
          const exists = await this.page.locator(step.selector).count() > 0;
          if (!exists && step.shouldExist) {
            throw new Error(`Element ${step.selector} not found`);
          }
          break;
          
        case 'wait':
          await this.page.waitForSelector(step.selector, {
            timeout: step.timeout || 5000
          });
          break;
          
        case 'screenshot':
          const screenshot = await this.page.screenshot({
            fullPage: step.fullPage
          });
          return { screenshot, success: true };
          
        default:
          // Execute custom JavaScript
          const result = await this.page.evaluate(step.script);
          return { result, success: true };
      }
      
      return { success: true };
      
    } catch (error) {
      const screenshot = await this.page.screenshot().catch(() => null);
      return {
        success: false,
        error: error.message,
        screenshot
      };
    }
  }
  
  async close(): Promise<void> {
    await this.browser?.close();
  }
}
```

### Command Parser

```typescript
// src/mcp/CommandParser.ts
export class CommandParser {
  parse(command: string): TestStep[] {
    const steps: TestStep[] = [];
    
    // Handle multi-line commands
    const lines = command.split(/[>\n]/).map(l => l.trim()).filter(Boolean);
    
    for (const line of lines) {
      const step = this.parseLine(line);
      if (step) {
        steps.push(step);
      }
    }
    
    return steps;
  }
  
  private parseLine(line: string): TestStep | null {
    // Navigation patterns
    const navMatch = line.match(/(?:go to|navigate to|visit)\s+(.+)/i);
    if (navMatch) {
      return {
        action: 'navigate',
        url: navMatch[1].trim()
      };
    }
    
    // Click patterns
    const clickMatch = line.match(/click\s+(.+)/i);
    if (clickMatch) {
      return {
        action: 'click',
        selector: clickMatch[1].trim()
      };
    }
    
    // Check patterns
    const checkMatch = line.match(/(?:check|verify)\s+(?:if\s+)?(.+?)\s+exists/i);
    if (checkMatch) {
      return {
        action: 'check',
        selector: checkMatch[1].trim(),
        shouldExist: true
      };
    }
    
    // Fill patterns
    const fillMatch = line.match(/(?:fill|type|enter)\s+"([^"]+)"\s+(?:in|into)\s+(.+)/i);
    if (fillMatch) {
      return {
        action: 'fill',
        value: fillMatch[1],
        selector: fillMatch[2].trim()
      };
    }
    
    // Wait patterns
    const waitMatch = line.match(/wait\s+(?:for\s+)?(.+)/i);
    if (waitMatch) {
      return {
        action: 'wait',
        selector: waitMatch[1].trim()
      };
    }
    
    // Custom script
    if (line.startsWith('eval:') || line.startsWith('script:')) {
      return {
        action: 'eval',
        script: line.substring(line.indexOf(':') + 1).trim()
      };
    }
    
    return null;
  }
}
```

## Bot Integration

### Enhanced Bot Commands

```typescript
// src/bot/CommandHandler.ts
class CommandHandler {
  private mcpManager: MCPManager;
  
  async handleTestCommand(
    command: BotCommand,
    context: BotContext
  ): Promise<BotResponse> {
    // Parse test instruction
    const testScript = command.args;
    const viewport = command.options.viewport || 'desktop';
    
    try {
      // Create MCP session
      const session = await this.mcpManager.createSession({
        viewport: this.getViewportSize(viewport),
        baseUrl: context.previewUrl
      });
      
      // Execute test
      const result = await this.mcpManager.executeCommand(testScript);
      
      // Analyze results
      const analysis = await this.analyzeTestResults(result);
      
      // Format response
      return {
        success: result.success,
        message: this.formatTestResults(result, analysis)
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Test failed: ${error.message}`
      };
    }
  }
}
```

## Advanced MCP Features

### 1. Visual Regression Testing

```typescript
@yofix test visual """
1. Go to /home
2. Take screenshot as "home-current"
3. Compare with baseline
4. Highlight differences
"""
```

### 2. Performance Testing

```typescript
@yofix test performance """
1. Go to /products
2. Measure LCP
3. Click .load-more
4. Measure response time
5. Check if LCP < 2.5s
"""
```

### 3. Accessibility Testing

```typescript
@yofix test a11y """
1. Go to /checkout
2. Run axe-core
3. Check WCAG 2.1 AA compliance
4. Report violations
"""
```

### 4. API Testing

```typescript
@yofix test api """
1. Intercept /api/products
2. Go to /products
3. Verify API response
4. Check data rendering
"""
```

## Security & Sandboxing

### Execution Sandbox

```typescript
// src/mcp/Sandbox.ts
export class MCPSandbox {
  private allowedActions = [
    'navigate', 'click', 'fill', 'check', 
    'wait', 'screenshot', 'measure'
  ];
  
  private blockedPatterns = [
    /file:\/\//,
    /localhost:(22|3306|5432)/, // Block SSH, MySQL, PostgreSQL
    /\.(env|key|pem)$/
  ];
  
  async validateCommand(command: TestStep): Promise<void> {
    // Check allowed actions
    if (!this.allowedActions.includes(command.action)) {
      throw new Error(`Action '${command.action}' not allowed`);
    }
    
    // Check URL restrictions
    if (command.url) {
      for (const pattern of this.blockedPatterns) {
        if (pattern.test(command.url)) {
          throw new Error(`URL pattern blocked: ${command.url}`);
        }
      }
    }
    
    // Validate selectors (prevent XSS)
    if (command.selector && command.selector.includes('javascript:')) {
      throw new Error('JavaScript URLs not allowed in selectors');
    }
  }
}
```

### Rate Limiting

```yaml
# .yofix.yml
mcp:
  rateLimits:
    perUser: 10        # Max tests per user per hour
    perPR: 50          # Max tests per PR
    concurrent: 3      # Max concurrent sessions
```

## Examples

### E-commerce Flow Test

```bash
@yofix test """
1. Go to /products
2. Click .product-card:first-child
3. Click button[data-action="add-to-cart"]
4. Go to /cart
5. Verify .cart-item exists
6. Check if .total-price contains "$"
"""
```

### Form Validation Test

```bash
@yofix test """
1. Go to /contact
2. Fill "test@example" in input[name="email"]
3. Click button[type="submit"]
4. Check if .error-message exists
5. Fill "test@example.com" in input[name="email"]
6. Click button[type="submit"]
7. Check if .success-message exists
"""
```

### Responsive Design Test

```bash
@yofix test mobile """
1. Go to /home
2. Check if .mobile-menu-button is visible
3. Click .mobile-menu-button
4. Verify .mobile-menu is visible
5. Take screenshot as "mobile-menu-open"
"""
```

## Best Practices

### 1. Keep Tests Simple

```bash
# Good - Clear and simple
@yofix test "go to /about and check if .team-section exists"

# Bad - Too complex
@yofix test "navigate to about page then scroll down 500px and wait 2 seconds then check if the third team member card has an image that loaded correctly"
```

### 2. Use Semantic Selectors

```bash
# Good - Semantic selectors
@yofix test "click button[aria-label='Add to cart']"

# Bad - Brittle selectors
@yofix test "click .btn-3.xs-full.mt-2"
```

### 3. Add Context

```bash
# Good - Explains purpose
@yofix test "Testing mobile menu toggle: go to /home > click .menu-toggle > verify .nav-menu is visible"

# Bad - No context
@yofix test "click button > check div"
```

## Troubleshooting

### Common Issues

1. **Timeout Errors**
   ```bash
   @yofix test "go to /slow-page" --timeout 30000
   ```

2. **Element Not Found**
   ```bash
   @yofix test "wait for .dynamic-content > click .button"
   ```

3. **Authentication Required**
   ```bash
   @yofix test "login first > go to /dashboard > check .user-profile"
   ```

### Debug Mode

```bash
# Enable debug screenshots
@yofix test "..." --debug --screenshot-on-error

# Verbose logging
@yofix test "..." --verbose
```