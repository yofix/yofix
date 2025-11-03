import { LoginFormStructure } from './ComponentTreeAnalyzer';
import { LoginSchema, FieldSelector } from './LoginSchemaGenerator';

/**
 * Pure deterministic selector generator
 * NO LLM needed - generates exact selectors from Babel AST analysis
 *
 * This is the RIGHT approach when you have source code access:
 * 1. Parse JSX with Babel
 * 2. Extract exact props (dataTestId, name, id, etc.)
 * 3. Apply library-specific patterns (MUI vs Ant vs Chakra)
 * 4. Generate working selectors
 *
 * Result: 100% reliable, instant, free!
 */
export class DeterministicSelectorGenerator {
  /**
   * Generate schema from AST structure - NO LLM!
   */
  generateSchema(structure: LoginFormStructure): Omit<LoginSchema, 'meta'> {
    console.log('⚡ Generating selectors deterministically (NO LLM)...');

    return {
      fields: {
        email: this.generateFieldSelectors(structure.emailField, structure.detectedLibrary, 'email'),
        password: this.generateFieldSelectors(structure.passwordField, structure.detectedLibrary, 'password')
      },
      submit: this.generateButtonSelectors(structure.submitButton, structure.detectedLibrary),
      validation: {
        emailRequired: true,
        passwordRequired: true
      },
      successIndicators: {
        urlNotContains: '/login'
      }
    };
  }

  /**
   * Generate field selectors based on detected library and extracted props
   */
  private generateFieldSelectors(
    field: LoginFormStructure['emailField'],
    library: LoginFormStructure['detectedLibrary'],
    fieldType: 'email' | 'password'
  ): FieldSelector[] {
    if (!field) {
      console.warn(`⚠️  ${fieldType} field not found in AST`);
      return [];
    }

    const selectors: FieldSelector[] = [];
    let priority = 1;

    // Extract props
    const { dataTestId, name, id, label } = field.props;

    console.log(`  ${fieldType}: dataTestId="${dataTestId}", name="${name}", library=${library}`);

    // PRIMARY: data-testid (most reliable)
    if (dataTestId) {
      const selector = this.buildSelector(library, 'data-testid', dataTestId, field.selectorPath);
      selectors.push({
        type: 'css',
        value: selector,
        priority: priority++,
        description: `Primary: ${library} - dataTestId="${dataTestId}" on ${field.component}, ${this.explainPattern(library)}`
      });
    }

    // FALLBACK 1: name attribute
    if (name) {
      selectors.push({
        type: 'css',
        value: `input[name='${name}']`,
        priority: priority++,
        description: `Fallback: name attribute (works with Formik, some react-hook-form setups)`
      });
    }

    // FALLBACK 2: id attribute
    if (id) {
      selectors.push({
        type: 'css',
        value: `#${id}`,
        priority: priority++,
        description: `Fallback: id attribute`
      });
    }

    // FALLBACK 3: input type
    const inputType = fieldType === 'email' ? 'text' : 'password';
    const typeSelector = fieldType === 'email'
      ? 'input[type="text"]:first-of-type'
      : 'input[type="password"]';

    selectors.push({
      type: 'css',
      value: typeSelector,
      priority: priority++,
      description: `Fallback: ${inputType} input type`
    });

    console.log(`  Generated ${selectors.length} selectors for ${fieldType}`);
    return selectors;
  }

  /**
   * Generate button selectors
   */
  private generateButtonSelectors(
    button: LoginFormStructure['submitButton'],
    library: LoginFormStructure['detectedLibrary']
  ): FieldSelector[] {
    if (!button) {
      console.warn('⚠️  Submit button not found in AST');
      return [];
    }

    const selectors: FieldSelector[] = [];
    let priority = 1;

    const { 'data-testid': dataTestId, type } = button.props;
    const { text } = button;

    console.log(`  button: dataTestId="${dataTestId}", text="${text}", type="${type}"`);

    // PRIMARY: data-testid
    if (dataTestId) {
      selectors.push({
        type: 'css',
        value: `[data-testid='${dataTestId}']`,
        priority: priority++,
        description: `Primary: Button with data-testid="${dataTestId}"`
      });
    }

    // FALLBACK 1: button text
    if (text) {
      selectors.push({
        type: 'css',
        value: `button:has-text("${text}")`,
        priority: priority++,
        description: `Fallback: Button with text "${text}"`
      });
    }

    // FALLBACK 2: submit type
    if (type === 'submit') {
      selectors.push({
        type: 'css',
        value: 'button[type="submit"]',
        priority: priority++,
        description: 'Fallback: Submit button type'
      });
    }

    console.log(`  Generated ${selectors.length} selectors for button`);
    return selectors;
  }

  /**
   * Build selector based on library-specific pattern
   */
  private buildSelector(
    library: LoginFormStructure['detectedLibrary'],
    attrType: string,
    attrValue: string,
    selectorPath: string[]
  ): string {
    const attr = attrType === 'data-testid' ? `[data-testid='${attrValue}']` : `#${attrValue}`;

    switch (library) {
      case 'MUI':
        // MUI renders: <div data-testid="..."><input /></div>
        return `${attr} input`;

      case 'Ant':
        // Ant renders data-testid directly on input
        return attr;

      case 'Chakra':
        // Chakra uses id on input
        return attr;

      case 'Plain':
        // Plain HTML
        return attr;

      default:
        // Unknown - check selector path
        if (selectorPath.length > 1) {
          // Has wrapper
          return `${attr} input`;
        }
        return attr;
    }
  }

  /**
   * Explain the pattern for documentation
   */
  private explainPattern(library: LoginFormStructure['detectedLibrary']): string {
    switch (library) {
      case 'MUI':
        return 'TextField renders wrapper <div data-testid>, input is nested inside';
      case 'Ant':
        return 'Input has data-testid directly on <input> element';
      case 'Chakra':
        return 'Input has id/data-testid on <input> element';
      case 'Plain':
        return 'Standard HTML input';
      default:
        return 'Pattern detected from component tree';
    }
  }
}
