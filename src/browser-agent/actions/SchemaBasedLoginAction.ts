import { Action, ActionDefinition, ActionResult } from '../types';
import { Page } from 'playwright';
import { LoginSchema, FieldSelector } from '../schemas/LoginSchemaGenerator';
import * as core from '@actions/core';

/**
 * Fast, deterministic login using pre-generated schema
 * NO LLM calls during execution - schema was analyzed once from source code
 */
export class SchemaBasedLoginAction implements Action {
  name = 'schema_login';
  description = 'Fast login using pre-analyzed schema from source code';

  private schema: LoginSchema;

  constructor(schema: LoginSchema) {
    this.schema = schema;
  }

  /**
   * Execute fast login using schema selectors
   */
  async execute(page: Page, parameters: {
    email: string;
    password: string;
    loginUrl?: string;
  }): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      core.info(`🔐 Schema-based login starting...`);
      core.debug(`   Schema version: ${this.schema.meta.version}`);
      core.debug(`   Generated: ${this.schema.meta.generatedAt}`);

      // Navigate to login page if URL provided
      if (parameters.loginUrl) {
        core.info(`1️⃣  Navigating to ${parameters.loginUrl}...`);
        await page.goto(parameters.loginUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000); // Allow form to render
      }

      // Step 1: Fill email field
      core.info(`2️⃣  Filling email field...`);
      const emailFilled = await this.fillField(page, this.schema.fields.email, parameters.email);
      if (!emailFilled) {
        throw new Error('Could not find email field using any selector from schema');
      }
      core.info(`    ✓ Email field filled`);

      // Step 2: Fill password field
      core.info(`3️⃣  Filling password field...`);
      const passwordFilled = await this.fillField(page, this.schema.fields.password, parameters.password);
      if (!passwordFilled) {
        throw new Error('Could not find password field using any selector from schema');
      }
      core.info(`    ✓ Password field filled`);

      // Step 3: Click submit button
      core.info(`4️⃣  Clicking submit button...`);
      const submitted = await this.clickSubmit(page, this.schema.submit);
      if (!submitted) {
        throw new Error('Could not find submit button using any selector from schema');
      }
      core.info(`    ✓ Submit button clicked`);

      // Step 4: Wait for success indicators
      core.info(`5️⃣  Waiting for authentication...`);
      await this.waitForSuccess(page, this.schema.successIndicators);

      const duration = Date.now() - startTime;
      core.info(`✅ Login successful in ${(duration / 1000).toFixed(2)}s`);
      core.info(`📍 Final URL: ${page.url()}`);

      return {
        success: true,
        data: {
          method: 'schema-based',
          duration,
          finalUrl: page.url(),
          schemaVersion: this.schema.meta.version
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      core.error(`❌ Schema-based login failed: ${error.message}`);

      return {
        success: false,
        error: error.message,
        data: {
          method: 'schema-based',
          duration,
          schemaVersion: this.schema.meta.version
        }
      };
    }
  }

  /**
   * Try to fill a field using schema selectors (priority order)
   */
  private async fillField(
    page: Page,
    selectors: FieldSelector[],
    value: string
  ): Promise<boolean> {
    // Sort by priority
    const sortedSelectors = [...selectors].sort((a, b) => a.priority - b.priority);

    for (const selector of sortedSelectors) {
      try {
        const playwrightSelector = this.toPlaywrightSelector(selector);
        core.debug(`   Trying ${selector.type}: ${playwrightSelector}`);

        const locator = page.locator(playwrightSelector).first();
        const count = await locator.count();

        if (count > 0) {
          await locator.fill(value);
          core.debug(`   ✓ Success with ${selector.type}`);
          return true;
        }
      } catch (error) {
        core.debug(`   ✗ Failed: ${error.message}`);
        continue;
      }
    }

    return false;
  }

  /**
   * Try to click submit button using schema selectors
   */
  private async clickSubmit(page: Page, selectors: FieldSelector[]): Promise<boolean> {
    const sortedSelectors = [...selectors].sort((a, b) => a.priority - b.priority);

    for (const selector of sortedSelectors) {
      try {
        const playwrightSelector = this.toPlaywrightSelector(selector);
        core.debug(`   Trying ${selector.type}: ${playwrightSelector}`);

        const locator = page.locator(playwrightSelector).first();
        const count = await locator.count();

        if (count > 0) {
          await locator.click();
          core.debug(`   ✓ Success with ${selector.type}`);
          return true;
        }
      } catch (error) {
        core.debug(`   ✗ Failed: ${error.message}`);
        continue;
      }
    }

    return false;
  }

  /**
   * Convert schema selector to Playwright selector
   * Schema selectors are already exact and generated from source code analysis
   */
  private toPlaywrightSelector(selector: FieldSelector): string {
    // All selectors from schema are now 'css' type and are exact
    // No manual transformations needed - LLM traced through component tree
    return selector.value;
  }

  /**
   * Wait for login success based on schema indicators
   */
  private async waitForSuccess(
    page: Page,
    indicators: LoginSchema['successIndicators']
  ): Promise<void> {
    const timeout = 10000;

    // Strategy 1: URL does not contain pattern
    if (indicators.urlNotContains) {
      await page.waitForURL(
        (url) => !url.toString().includes(indicators.urlNotContains!),
        { timeout }
      );
      return;
    }

    // Strategy 2: URL matches pattern
    if (indicators.urlPattern) {
      await page.waitForURL(indicators.urlPattern, { timeout });
      return;
    }

    // Strategy 3: Element present
    if (indicators.elementPresent) {
      await page.waitForSelector(indicators.elementPresent, { timeout });
      return;
    }

    // Default: just wait a bit
    await page.waitForTimeout(2000);
  }

  /**
   * Get action definition for registration
   */
  static getDefinition(): ActionDefinition {
    return {
      name: 'schema_login',
      description: 'Fast, deterministic login using pre-analyzed schema from source code. Much faster than llm_login (2-3s vs 10-15s).',
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
          description: 'URL of login page (optional if already on page)',
          required: false
        }
      },
      examples: [
        'Authenticate using schema_login with email="user@example.com" password="secret123"',
        'schema_login email="admin@site.com" password="pass" loginUrl="https://site.com/login"'
      ]
    };
  }
}
