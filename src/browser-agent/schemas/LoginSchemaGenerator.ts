import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { ComponentTreeAnalyzer, LoginFormStructure } from './ComponentTreeAnalyzer';
import { DeterministicSelectorGenerator } from './DeterministicSelectorGenerator';

/**
 * Login Schema - Generated from source code analysis using Babel AST
 * This schema is used for deterministic, fast login without LLM calls
 * Works with any framework: React, Vue, Angular, plain HTML
 *
 * NEW: Uses pure Babel AST analysis - NO LLM needed for selector generation!
 */
export interface LoginSchema {
  /** Metadata about schema generation */
  meta: {
    /** When the schema was generated */
    generatedAt: string;
    /** Source files analyzed */
    sourceFiles: string[];
    /** Version for cache invalidation */
    version: string;
    /** Detected UI library/framework */
    detectedLibrary?: 'MUI' | 'Ant' | 'Chakra' | 'Plain' | 'Custom' | 'Unknown';
    /** How components wrap inputs */
    wrapperPattern?: 'wrapper-div' | 'direct' | 'shadow-dom' | 'unknown';
  };

  /** Form field selectors in priority order (try first to last) */
  fields: {
    email: FieldSelector[];
    password: FieldSelector[];
  };

  /** Submit button selectors in priority order */
  submit: FieldSelector[];

  /** Expected validation patterns */
  validation?: {
    emailRequired?: boolean;
    passwordRequired?: boolean;
    emailFormat?: string;
  };

  /** Expected navigation after login */
  successIndicators: {
    urlPattern?: string;
    urlNotContains?: string;
    elementPresent?: string;
  };
}

export interface FieldSelector {
  /** Selector type */
  type: 'data-testid' | 'name' | 'label' | 'aria-label' | 'placeholder' | 'css';
  /** Selector value */
  value: string;
  /** Priority (1 = highest) */
  priority: number;
  /** Human-readable description */
  description: string;
}

/**
 * Generates login schema by analyzing React source code using Claude
 */
export class LoginSchemaGenerator {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Generate schema from source files using Babel AST analysis
   * Works with any framework: React, Vue, Angular, plain HTML
   */
  async generateFromSource(
    sourceFiles: string[],
    options: {
      loginUrl?: string;
      model?: string;
      version?: string;
    } = {}
  ): Promise<LoginSchema> {
    console.log('🧠 Analyzing source code with Babel AST...');

    // Step 1: Parse component tree with Babel (like route-impact-analyzer)
    const analyzer = new ComponentTreeAnalyzer();
    const structure = await analyzer.analyzeLoginForm(sourceFiles);

    console.log(`📊 AST analysis complete:`);
    console.log(`   Library: ${structure.detectedLibrary}`);
    console.log(`   Input wrappers: ${structure.inputWrappers.length}`);
    console.log(`   Email field found: ${!!structure.emailField}`);
    console.log(`   Password field found: ${!!structure.passwordField}`);
    console.log(`   Submit button found: ${!!structure.submitButton}`);

    // Step 2: Generate selectors deterministically (NO LLM!)
    const selectorGenerator = new DeterministicSelectorGenerator();
    const schema = selectorGenerator.generateSchema(structure);

    // Step 3: Add metadata
    const fullSchema: LoginSchema = {
      meta: {
        generatedAt: new Date().toISOString(),
        sourceFiles: sourceFiles.map((f) => path.basename(f)),
        version: options.version || '1.0.0',
        detectedLibrary: structure.detectedLibrary,
        wrapperPattern: structure.inputWrappers.length > 0 ? 'wrapper-div' : 'direct'
      },
      ...schema
    };

    console.log('✅ Schema generated successfully (NO LLM)!');
    console.log(`   Email selectors: ${fullSchema.fields.email.length}`);
    console.log(`   Password selectors: ${fullSchema.fields.password.length}`);
    console.log(`   Submit selectors: ${fullSchema.submit.length}`);
    console.log(`   Generation time: <1s (vs 20s+ with LLM)`);
    console.log(`   Cost: FREE (vs $0.01+ per generation)`);

    return fullSchema;
  }

  /**
   * Build structured prompt from AST analysis
   * This is much more concise than raw source code
   */
  private buildStructuredPrompt(structure: LoginFormStructure, loginUrl?: string): string {
    return `I analyzed login form components with Babel AST. Generate exact Playwright selectors based on this structure:

## Detected Library
${structure.detectedLibrary}

## Login Component
Name: ${structure.loginComponent.name}
File: ${structure.loginComponent.filePath}

## Email Field
${structure.emailField ? `
Component: ${structure.emailField.component}
Props: ${JSON.stringify(structure.emailField.props, null, 2)}
Selector Path: ${structure.emailField.selectorPath.join(' → ')}
Final Element: <${structure.emailField.finalElement}>
` : 'Not found'}

## Password Field
${structure.passwordField ? `
Component: ${structure.passwordField.component}
Props: ${JSON.stringify(structure.passwordField.props, null, 2)}
Selector Path: ${structure.passwordField.selectorPath.join(' → ')}
Final Element: <${structure.passwordField.finalElement}>
` : 'Not found'}

## Submit Button
${structure.submitButton ? `
Component: ${structure.submitButton.component}
Props: ${JSON.stringify(structure.submitButton.props, null, 2)}
Text: ${structure.submitButton.text || 'N/A'}
` : 'Not found'}

## Input Wrappers Detected
${structure.inputWrappers.map(w => `
- ${w.name}:
  Props: ${Object.keys(w.props).join(', ')}
  Renders: ${w.renders.map(r => r.name).join(' → ')}
  Pattern: ${w.patterns.isWrapper ? 'Wrapper' : 'Direct'} ${w.patterns.usesController ? '(react-hook-form)' : ''} ${w.patterns.usesFormik ? '(formik)' : ''}
`).join('')}

${loginUrl ? `## Login URL\n${loginUrl}` : ''}

Based on this AST analysis, generate EXACT Playwright selectors that will work.`;
  }

  /**
   * Save schema to file for caching
   */
  async saveSchema(schema: LoginSchema, outputPath: string): Promise<void> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2), 'utf-8');
    console.log(`💾 Schema saved to: ${outputPath}`);
  }

  /**
   * Load cached schema from file
   */
  static loadSchema(schemaPath: string): LoginSchema | null {
    if (!fs.existsSync(schemaPath)) {
      return null;
    }

    const content = fs.readFileSync(schemaPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Check if cached schema is still valid
   */
  static isSchemaCurrent(
    schema: LoginSchema,
    sourceFiles: string[],
    maxAgeHours: number = 24 * 7 // 1 week default
  ): boolean {
    // Check age
    const generatedAt = new Date(schema.meta.generatedAt);
    const ageHours = (Date.now() - generatedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > maxAgeHours) {
      console.log(`⚠️  Schema is ${ageHours.toFixed(1)} hours old (max: ${maxAgeHours})`);
      return false;
    }

    // Check if source files changed
    const schemaFiles = schema.meta.sourceFiles.map((f) => path.basename(f)).sort();
    const currentFiles = sourceFiles.map((f) => path.basename(f)).sort();

    if (JSON.stringify(schemaFiles) !== JSON.stringify(currentFiles)) {
      console.log('⚠️  Source files changed');
      return false;
    }

    // Could also check file modification times here

    return true;
  }

  private buildSystemPrompt(): string {
    return `You are a selector generator that creates EXACT Playwright selectors from Babel AST analysis.

You receive STRUCTURED component analysis (not raw code). Your task is to generate exact CSS selectors.

IMPORTANT: The component tree has already been analyzed with Babel AST. You receive:
- Detected library (MUI, Ant, Chakra, Plain)
- Component structure and prop flow
- Selector paths (e.g., CustomInput → TextField → input)

LIBRARY-SPECIFIC SELECTOR PATTERNS:

**MUI (Material-UI)**
- Path: CustomInput → TextField → div[data-testid] → input
- Selector: [data-testid='value'] input

**Ant Design**
- Path: Input → input[data-testid]
- Selector: [data-testid='value']

**Chakra UI**
- Path: Input → input#id
- Selector: #id

**Plain HTML**
- Path: input[name]
- Selector: input[name='value']

**Formik**
- Path: Field → input[name]
- Selector: input[name='value']

**react-hook-form**
- Path: Controller → Component → input (NO name attribute)
- Selector: Use data-testid or position

YOUR TASK:
1. Look at "Selector Path" to understand wrapper structure
2. Look at "Props" to see what attributes are available
3. Use "Detected Library" to apply correct pattern
4. Generate PRIMARY selector (most reliable)
5. Generate 2-3 FALLBACK selectors (alternative approaches)

Return JSON in this format:
{
  "fields": {
    "email": [
      {
        "type": "css",
        "value": "[data-testid='login-email'] input",
        "priority": 1,
        "description": "Primary: MUI TextField renders wrapper div with data-testid, input inside"
      },
      {
        "type": "css",
        "value": "input[type='text']:first-of-type",
        "priority": 2,
        "description": "Fallback: First text input on page"
      }
    ],
    "password": [
      {
        "type": "css",
        "value": "[data-testid='login-password'] input",
        "priority": 1,
        "description": "Primary: MUI TextField pattern"
      },
      {
        "type": "css",
        "value": "input[type='password']",
        "priority": 2,
        "description": "Fallback: Password input type"
      }
    ]
  },
  "submit": [
    {
      "type": "css",
      "value": "[data-testid='login-button']",
      "priority": 1,
      "description": "Primary: Button has data-testid directly"
    },
    {
      "type": "css",
      "value": "button:has-text('LOGIN')",
      "priority": 2,
      "description": "Fallback: Button text"
    }
  ],
  "validation": {
    "emailRequired": true,
    "passwordRequired": true
  },
  "successIndicators": {
    "urlNotContains": "/login"
  }
}

IMPORTANT:
- ALL selectors must be "css" type
- Generate 2-3 selectors per field (primary + fallbacks)
- Explain WHY each selector will work based on the component structure provided
- Account for the detected library pattern`;
  }
}
