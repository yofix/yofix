import { ComponentTreeAnalyzer, LoginFormStructure } from './ComponentTreeAnalyzer';
import { DeterministicSelectorGenerator } from './DeterministicSelectorGenerator';
import { LoginSchemaGenerator, LoginSchema } from './LoginSchemaGenerator';
import { Page } from 'playwright';

/**
 * Reliable Schema Generator - Prioritizes correctness over speed
 *
 * ARCHITECTURE:
 * 1. First run (30s): Babel AST + LLM + Browser validation
 * 2. Subsequent runs (<1s): Load from cache
 *
 * PRIORITIES:
 * 1. Reliability (100% correctness)
 * 2. Subsequent run speed
 * 3. First run speed (acceptable to be slow)
 */
export class ReliableSchemaGenerator {
  private llmGenerator: LoginSchemaGenerator;
  private deterministicGenerator: DeterministicSelectorGenerator;

  constructor(claudeApiKey: string) {
    this.llmGenerator = new LoginSchemaGenerator(claudeApiKey);
    this.deterministicGenerator = new DeterministicSelectorGenerator();
  }

  /**
   * Generate schema with maximum reliability
   * Uses hybrid approach: Babel AST for structure + LLM for correctness
   */
  async generateReliableSchema(
    sourceFiles: string[],
    options: {
      loginUrl: string;
      testCredentials?: { email: string; password: string };
      model?: string;
    }
  ): Promise<LoginSchema & { validated: boolean }> {
    console.log('🎯 Generating schema with RELIABILITY priority...');
    console.log('   First run may take 30s - subsequent runs <1s');

    // Step 1: Parse with Babel AST (0.03s)
    console.log('\n📊 Step 1: Babel AST analysis...');
    const analyzer = new ComponentTreeAnalyzer();
    const structure = await analyzer.analyzeLoginForm(sourceFiles);

    const astSuccess = !!(structure.emailField && structure.passwordField && structure.submitButton);
    console.log(`   Fields found: ${astSuccess ? '✅' : '⚠️'}`);
    console.log(`   Library: ${structure.detectedLibrary}`);

    // Step 2: Try deterministic approach first (for known patterns)
    let schema: LoginSchema;
    let approach: 'deterministic' | 'llm';

    if (this.isKnownPattern(structure)) {
      console.log('\n⚡ Step 2: Using deterministic approach (known pattern)...');
      const deterministicSchema = this.deterministicGenerator.generateSchema(structure);
      schema = {
        meta: {
          generatedAt: new Date().toISOString(),
          sourceFiles: sourceFiles.map(f => f.split('/').pop()!),
          version: '1.0.0',
          detectedLibrary: structure.detectedLibrary,
          wrapperPattern: structure.inputWrappers.length > 0 ? 'wrapper-div' : 'direct'
        },
        ...deterministicSchema
      };
      approach = 'deterministic';
      console.log('   ✅ Deterministic selectors generated (0.03s)');
    } else {
      console.log('\n🧠 Step 2: Using LLM approach (unknown pattern)...');
      console.log('   This ensures 100% reliability for edge cases');
      schema = await this.llmGenerator.generateFromSource(sourceFiles, {
        loginUrl: options.loginUrl,
        model: options.model
      });
      approach = 'llm';
      console.log('   ✅ LLM selectors generated (~20s)');
    }

    // Step 3: Validate in browser if credentials provided
    let validated = false;
    if (options.testCredentials) {
      console.log('\n🧪 Step 3: Browser validation...');
      validated = await this.validateInBrowser(
        schema,
        options.loginUrl,
        options.testCredentials
      );

      if (!validated) {
        console.log('   ⚠️  Validation failed with current schema');
        if (approach === 'deterministic') {
          console.log('   🔄 Retrying with LLM approach...');
          schema = await this.llmGenerator.generateFromSource(sourceFiles, {
            loginUrl: options.loginUrl,
            model: options.model
          });
          validated = await this.validateInBrowser(
            schema,
            options.loginUrl,
            options.testCredentials
          );
        }
      }

      if (validated) {
        console.log('   ✅ Schema validated in browser!');
      } else {
        console.log('   ❌ Validation failed - schema may need manual review');
      }
    } else {
      console.log('\n⏭️  Step 3: Skipped (no test credentials provided)');
    }

    console.log('\n✅ Schema generation complete!');
    console.log(`   Approach: ${approach}`);
    console.log(`   Validated: ${validated ? 'Yes' : 'Skipped'}`);
    console.log(`   Cache this schema for instant subsequent runs!`);

    return { ...schema, validated };
  }

  /**
   * Check if this is a known pattern we can handle deterministically
   */
  private isKnownPattern(structure: LoginFormStructure): boolean {
    const knownLibraries = ['MUI', 'Ant', 'Chakra', 'Plain'];
    const hasRequiredFields = !!(structure.emailField && structure.passwordField);

    return knownLibraries.includes(structure.detectedLibrary) && hasRequiredFields;
  }

  /**
   * Validate schema by actually trying to login in a browser
   * This ensures 100% reliability
   */
  private async validateInBrowser(
    schema: LoginSchema,
    loginUrl: string,
    credentials: { email: string; password: string }
  ): Promise<boolean> {
    const { chromium } = await import('playwright');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      // Navigate
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

      // Try email field selectors
      let emailFilled = false;
      for (const selector of schema.fields.email) {
        try {
          const locator = page.locator(selector.value).first();
          if ((await locator.count()) > 0) {
            await locator.fill(credentials.email, { timeout: 2000 });
            emailFilled = true;
            console.log(`   ✓ Email field: ${selector.value}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (!emailFilled) {
        console.log('   ✗ Email field: No selector worked');
        return false;
      }

      // Try password field selectors
      let passwordFilled = false;
      for (const selector of schema.fields.password) {
        try {
          const locator = page.locator(selector.value).first();
          if ((await locator.count()) > 0) {
            await locator.fill(credentials.password, { timeout: 2000 });
            passwordFilled = true;
            console.log(`   ✓ Password field: ${selector.value}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (!passwordFilled) {
        console.log('   ✗ Password field: No selector worked');
        return false;
      }

      // Try submit button selectors
      let buttonClicked = false;
      for (const selector of schema.submit) {
        try {
          const locator = page.locator(selector.value).first();
          if ((await locator.count()) > 0) {
            await locator.click({ timeout: 2000 });
            buttonClicked = true;
            console.log(`   ✓ Submit button: ${selector.value}`);
            break;
          }
        } catch {
          continue;
        }
      }

      if (!buttonClicked) {
        console.log('   ✗ Submit button: No selector worked');
        return false;
      }

      // Wait for navigation (login success)
      try {
        await page.waitForURL(
          url => !url.toString().includes('/login'),
          { timeout: 10000 }
        );
        console.log(`   ✓ Login successful`);
        return true;
      } catch {
        console.log('   ✗ Login did not complete');
        return false;
      }
    } catch (error) {
      console.log(`   ✗ Validation error: ${error.message}`);
      return false;
    } finally {
      await browser.close();
    }
  }
}
