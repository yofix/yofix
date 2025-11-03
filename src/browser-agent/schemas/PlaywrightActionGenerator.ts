import Anthropic from '@anthropic-ai/sdk';
import { LoginFormStructure } from './ComponentTreeAnalyzer';
import { Page, chromium } from 'playwright';

/**
 * Playwright action schema
 * Structured format for login actions
 */
export interface PlaywrightAction {
  type: 'fill' | 'click' | 'waitForURL' | 'wait';
  selector?: string;
  value?: string;
  condition?: string;
  timeout?: number;
  description: string;
}

export interface LoginBaseline {
  loginUrl: string;
  generatedAt: string;
  sourceFiles: string[];
  detectedLibrary: string;
  actions: PlaywrightAction[];
  validated: boolean;
  validationDetails?: {
    emailFilled: boolean;
    passwordFilled: boolean;
    buttonClicked: boolean;
    loginSucceeded: boolean;
  };
}

/**
 * Generates Playwright actions using LLM + Browser Validation
 *
 * APPROACH:
 * 1. Send structured component data to LLM (not raw source code)
 * 2. LLM generates Playwright action schema
 * 3. Validate in browser with real credentials
 * 4. Return validated baseline
 */
export class PlaywrightActionGenerator {
  private anthropic: Anthropic;

  constructor(claudeApiKey: string) {
    this.anthropic = new Anthropic({ apiKey: claudeApiKey });
  }

  /**
   * Generate and validate Playwright actions for login
   */
  async generateLoginActions(
    structure: LoginFormStructure,
    options: {
      loginUrl: string;
      sourceFiles: string[];
      testCredentials?: { email: string; password: string };
      model?: string;
      headless?: boolean;
    }
  ): Promise<LoginBaseline> {
    console.log('🧠 Generating Playwright actions with LLM...');

    // Step 1: Build structured prompt
    const prompt = this.buildPrompt(structure, options.loginUrl);

    // Step 2: Call LLM
    const actions = await this.callLLM(prompt, options.model || 'claude-sonnet-4-5-20250929');

    console.log(`✅ Generated ${actions.length} actions`);
    actions.forEach((action, idx) => {
      console.log(`   ${idx + 1}. ${action.type}: ${action.description}`);
    });

    // Step 3: Browser validation (if credentials provided)
    let validated = false;
    let validationDetails;

    if (options.testCredentials) {
      console.log('\\n🧪 Validating actions in browser...');
      const validation = await this.validateInBrowser(
        actions,
        options.loginUrl,
        options.testCredentials,
        options.headless !== false // Default to true unless explicitly set to false
      );
      validated = validation.success;
      validationDetails = validation.details;

      if (validated) {
        console.log('✅ Actions validated successfully!');
      } else {
        console.log('⚠️  Validation failed - actions may need adjustment');
      }
    }

    return {
      loginUrl: options.loginUrl,
      generatedAt: new Date().toISOString(),
      sourceFiles: options.sourceFiles,
      detectedLibrary: structure.detectedLibrary,
      actions,
      validated,
      validationDetails
    };
  }

  /**
   * Build structured prompt for LLM
   * Send component data, not raw source code
   */
  private buildPrompt(structure: LoginFormStructure, loginUrl: string): string {
    const emailField = structure.emailField;
    const passwordField = structure.passwordField;
    const submitButton = structure.submitButton;

    return `You are a Playwright automation expert. Generate a login action sequence based on the analyzed component structure.

**Login Form Structure:**
- UI Library: ${structure.detectedLibrary}
- Login URL: ${loginUrl}

**Email Field:**
- Component: ${emailField?.component || 'Unknown'}
- Props: ${JSON.stringify(emailField?.props || {}, null, 2)}
- Final Element: ${emailField?.finalElement || 'input'}
- Selector Path: ${emailField?.selectorPath.join(' > ') || 'unknown'}

**Password Field:**
- Component: ${passwordField?.component || 'Unknown'}
- Props: ${JSON.stringify(passwordField?.props || {}, null, 2)}
- Final Element: ${passwordField?.finalElement || 'input'}
- Selector Path: ${passwordField?.selectorPath.join(' > ') || 'unknown'}

**Submit Button:**
- Component: ${submitButton?.component || 'Unknown'}
- Props: ${JSON.stringify(submitButton?.props || {}, null, 2)}
- Text: ${submitButton?.text || 'Not specified'}

**Task:**
Generate a Playwright action sequence as JSON array. Each action should have:
- type: "fill" | "click" | "waitForURL" | "wait"
- selector: CSS selector (required for fill/click)
- value: "{email}" or "{password}" for fill actions
- condition: For waitForURL, describe the condition
- timeout: Optional timeout in ms
- description: Clear description of what this action does

**Important:**
- For ${structure.detectedLibrary} library, ensure selectors account for wrapper elements
- Provide fallback selectors if primary might fail
- Include wait for navigation after login
- Be specific and deterministic

Return ONLY a valid JSON array of actions, no explanation.`;
  }

  /**
   * Call LLM to generate action sequence
   */
  private async callLLM(prompt: string, model: string): Promise<PlaywrightAction[]> {
    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 4000,
      temperature: 0, // Deterministic output
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Expected text response from Claude');
    }

    // Parse JSON response
    const text = content.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error(`Could not extract JSON array from response: ${text.substring(0, 200)}`);
    }

    const actions: PlaywrightAction[] = JSON.parse(jsonMatch[0]);

    // Validate action structure
    actions.forEach((action, idx) => {
      if (!action.type || !action.description) {
        throw new Error(`Action ${idx} missing required fields: ${JSON.stringify(action)}`);
      }
      if ((action.type === 'fill' || action.type === 'click') && !action.selector) {
        throw new Error(`Action ${idx} type ${action.type} requires selector`);
      }
    });

    return actions;
  }

  /**
   * Validate actions in browser
   * Returns detailed validation results
   */
  private async validateInBrowser(
    actions: PlaywrightAction[],
    loginUrl: string,
    credentials: { email: string; password: string },
    headless: boolean = true
  ): Promise<{
    success: boolean;
    details: {
      emailFilled: boolean;
      passwordFilled: boolean;
      buttonClicked: boolean;
      loginSucceeded: boolean;
    };
  }> {
    const browser = await chromium.launch({
      headless,
      slowMo: headless ? 0 : 500 // Slow down actions in headed mode for visibility
    });
    const page = await browser.newPage();

    const details = {
      emailFilled: false,
      passwordFilled: false,
      buttonClicked: false,
      loginSucceeded: false
    };

    try {
      // Navigate to login page
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      console.log(`   ✓ Navigated to ${loginUrl}`);

      // Execute actions
      for (const action of actions) {
        try {
          await this.executeAction(page, action, credentials);

          // Track what succeeded
          if (action.type === 'fill' && action.value === '{email}') {
            details.emailFilled = true;
            console.log(`   ✓ ${action.description}`);
          } else if (action.type === 'fill' && action.value === '{password}') {
            details.passwordFilled = true;
            console.log(`   ✓ ${action.description}`);
          } else if (action.type === 'click') {
            details.buttonClicked = true;
            console.log(`   ✓ ${action.description}`);
          } else if (action.type === 'waitForURL') {
            details.loginSucceeded = true;
            console.log(`   ✓ ${action.description}`);
          }
        } catch (error) {
          console.log(`   ✗ ${action.description}: ${error.message}`);
        }
      }

      return {
        success: details.emailFilled && details.passwordFilled && details.buttonClicked && details.loginSucceeded,
        details
      };
    } catch (error) {
      console.log(`   ✗ Validation error: ${error.message}`);
      return { success: false, details };
    } finally {
      await browser.close();
    }
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    page: Page,
    action: PlaywrightAction,
    credentials: { email: string; password: string }
  ): Promise<void> {
    const timeout = action.timeout || 5000;

    switch (action.type) {
      case 'fill':
        if (!action.selector || !action.value) {
          throw new Error('Fill action requires selector and value');
        }
        const fillValue = action.value === '{email}'
          ? credentials.email
          : action.value === '{password}'
          ? credentials.password
          : action.value;

        await page.locator(action.selector).first().fill(fillValue, { timeout });
        break;

      case 'click':
        if (!action.selector) {
          throw new Error('Click action requires selector');
        }
        await page.locator(action.selector).first().click({ timeout });
        break;

      case 'waitForURL':
        await page.waitForURL(
          url => !url.toString().includes('/login'),
          { timeout }
        );
        break;

      case 'wait':
        await page.waitForTimeout(action.timeout || 1000);
        break;

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }
}
