import { Action, ActionDefinition, ActionResult } from '../types';
import { Page } from 'playwright';
import { LoginBaseline, PlaywrightAction } from '../schemas/PlaywrightActionGenerator';
import * as core from '@actions/core';

/**
 * Executes login using validated baseline (new approach)
 * Uses Playwright actions generated from source code + LLM + browser validation
 *
 * This is the new approach that combines:
 * - Babel AST analysis
 * - LLM action generation
 * - Browser validation
 * - Aggressive caching
 */
export class BaselineLoginAction implements Action {
  name = 'baseline_login';
  description = 'Login using validated baseline from source code analysis';

  private baseline: LoginBaseline;

  constructor(baseline: LoginBaseline) {
    this.baseline = baseline;
  }

  /**
   * Execute login using baseline actions
   */
  async execute(page: Page, parameters: {
    email: string;
    password: string;
    loginUrl?: string;
  }): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      core.info(`🎯 Baseline login starting...`);
      core.info(`   Generated: ${this.baseline.generatedAt}`);
      core.info(`   Library: ${this.baseline.detectedLibrary}`);
      core.info(`   Validated: ${this.baseline.validated ? 'Yes' : 'No'}`);
      core.info(`   Actions: ${this.baseline.actions.length}`);

      // Execute each action in sequence
      for (let i = 0; i < this.baseline.actions.length; i++) {
        const action = this.baseline.actions[i];
        core.info(`\n${i + 1}/${this.baseline.actions.length} ${action.description}`);

        await this.executeAction(page, action, parameters);
      }

      const duration = Date.now() - startTime;
      core.info(`\n✅ Baseline login successful in ${(duration / 1000).toFixed(2)}s`);
      core.info(`📍 Final URL: ${page.url()}`);

      return {
        success: true,
        data: {
          method: 'baseline',
          duration,
          finalUrl: page.url(),
          baselineVersion: this.baseline.generatedAt,
          validated: this.baseline.validated
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      core.error(`❌ Baseline login failed: ${error.message}`);

      return {
        success: false,
        error: error.message,
        data: {
          method: 'baseline',
          duration,
          baselineVersion: this.baseline.generatedAt
        }
      };
    }
  }

  /**
   * Execute a single Playwright action
   */
  private async executeAction(
    page: Page,
    action: PlaywrightAction,
    credentials: { email: string; password: string; loginUrl?: string }
  ): Promise<void> {
    const timeout = action.timeout || 5000;

    switch (action.type) {
      case 'fill':
        if (!action.selector || !action.value) {
          throw new Error('Fill action requires selector and value');
        }

        // Replace credential placeholders
        const fillValue = action.value === '{email}'
          ? credentials.email
          : action.value === '{password}'
          ? credentials.password
          : action.value;

        core.debug(`   Selector: ${action.selector}`);
        core.debug(`   Value: ${action.value === '{password}' ? '***' : fillValue}`);

        await page.locator(action.selector).first().fill(fillValue, { timeout });
        core.info(`   ✓ ${action.description}`);
        break;

      case 'click':
        if (!action.selector) {
          throw new Error('Click action requires selector');
        }

        core.debug(`   Selector: ${action.selector}`);
        await page.locator(action.selector).first().click({ timeout });
        core.info(`   ✓ ${action.description}`);
        break;

      case 'waitForURL':
        core.debug(`   Condition: ${action.condition || 'URL changes from /login'}`);
        await page.waitForURL(
          url => !url.toString().includes('/login'),
          { timeout }
        );
        core.info(`   ✓ ${action.description}`);
        break;

      case 'wait':
        const waitTime = action.timeout || 1000;
        core.debug(`   Duration: ${waitTime}ms`);
        await page.waitForTimeout(waitTime);
        core.info(`   ✓ ${action.description}`);
        break;

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  /**
   * Get action definition for registration
   */
  static getDefinition(): ActionDefinition {
    return {
      name: 'baseline_login',
      description: 'Login using validated baseline from source code analysis. Combines Babel AST + LLM + browser validation with aggressive caching.',
      parameters: {
        email: {
          type: 'string',
          description: 'Login email address',
          required: true
        },
        password: {
          type: 'string',
          description: 'Login password',
          required: true
        },
        loginUrl: {
          type: 'string',
          description: 'URL of login page (optional, baseline may include navigation)',
          required: false
        }
      },
      examples: [
        'Authenticate using baseline_login with email="user@example.com" password="secret123"',
        'baseline_login email="admin@site.com" password="pass"'
      ]
    };
  }
}
