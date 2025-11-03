import * as babel from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';
import { ImportResolver } from './ImportResolver.util';

/**
 * Structured component information extracted from AST
 * This is what we send to Claude instead of raw source code
 */
export interface ComponentInfo {
  /** Component name */
  name: string;
  /** File path */
  filePath: string;
  /** Props the component accepts */
  props: Record<string, {
    /** Prop type */
    type: string;
    /** Where this prop is applied (which child component/element) */
    appliedTo?: string;
    /** Is it data-testid, id, name, etc? */
    semanticMeaning?: 'testId' | 'id' | 'name' | 'label' | 'placeholder' | 'other';
  }>;
  /** What this component renders */
  renders: {
    /** Type: native element (input, button) or component (TextField, Input) */
    type: 'element' | 'component';
    /** Element/component name */
    name: string;
    /** Props passed down */
    propsFlow: Record<string, string>; // { componentProp: 'childProp' }
  }[];
  /** Imports */
  imports: Record<string, string>; // { TextField: '@mui/material/TextField' }
  /** Detected patterns */
  patterns: {
    isWrapper?: boolean; // Wraps another component
    isFormField?: boolean; // Renders input/textarea/select
    usesController?: boolean; // react-hook-form Controller
    usesFormik?: boolean; // Formik Field
  };
}

/**
 * Login form structure extracted from AST
 */
export interface LoginFormStructure {
  /** Main login component */
  loginComponent: ComponentInfo;
  /** Input wrapper components */
  inputWrappers: ComponentInfo[];
  /** Detected UI library */
  detectedLibrary: 'MUI' | 'Ant' | 'Chakra' | 'Plain' | 'Unknown';
  /** Email field structure */
  emailField?: {
    component: string;
    props: Record<string, any>;
    finalElement: string; // 'input', 'textarea', etc.
    selectorPath: string[]; // ['TextField', 'input']
  };
  /** Password field structure */
  passwordField?: {
    component: string;
    props: Record<string, any>;
    finalElement: string;
    selectorPath: string[];
  };
  /** Submit button structure */
  submitButton?: {
    component: string;
    props: Record<string, any>;
    text?: string;
  };
}

/**
 * Analyzes component tree using Babel AST
 * Similar to route-impact-analyzer approach
 */
export class ComponentTreeAnalyzer {
  private componentsCache: Map<string, ComponentInfo> = new Map();

  /**
   * Recursively resolve all component imports starting from a root file
   * Returns all component files in the dependency tree
   */
  async resolveComponentTree(rootFile: string, visited: Set<string> = new Set()): Promise<string[]> {
    if (visited.has(rootFile) || !fs.existsSync(rootFile)) {
      return [];
    }

    visited.add(rootFile);
    const allFiles: string[] = [rootFile];

    try {
      const content = fs.readFileSync(rootFile, 'utf-8');
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      });

      // Extract all imports
      const imports: string[] = [];
      traverse(ast, {
        ImportDeclaration: (path) => {
          const source = path.node.source.value;
          // Only follow relative imports (project files, not node_modules)
          if (source.startsWith('.')) {
            imports.push(source);
          }
        }
      });

      // Resolve each import using shared ImportResolver
      const rootDir = path.dirname(rootFile);
      for (const importPath of imports) {
        const resolved = ImportResolver.resolveImport(importPath, rootDir);
        if (resolved) {
          const childFiles = await this.resolveComponentTree(resolved, visited);
          allFiles.push(...childFiles);
        }
      }
    } catch (error) {
      console.warn(`Failed to resolve imports for ${rootFile}: ${error.message}`);
    }

    return allFiles;
  }

  /**
   * Analyze login form from source files
   */
  async analyzeLoginForm(sourceFiles: string[]): Promise<LoginFormStructure> {
    console.log('🔍 Analyzing component tree with Babel AST...');

    // Parse all files
    const components: ComponentInfo[] = [];
    for (const file of sourceFiles) {
      const info = await this.analyzeComponent(file);
      if (info) {
        components.push(info);
        this.componentsCache.set(info.name, info);
      }
    }

    // Detect UI library from imports
    const detectedLibrary = this.detectLibrary(components);
    console.log(`📚 Detected library: ${detectedLibrary}`);

    // Find login form fields
    const structure: LoginFormStructure = {
      loginComponent: components.find(c =>
        c.name.toLowerCase().includes('login') ||
        c.filePath.toLowerCase().includes('login')
      ) || components[0],
      inputWrappers: components.filter(c => c.patterns.isWrapper),
      detectedLibrary,
    };

    // Trace email field - search ALL files, not just login component!
    structure.emailField = this.traceFieldInAllFiles(components, sourceFiles, 'email');
    structure.passwordField = this.traceFieldInAllFiles(components, sourceFiles, 'password');
    structure.submitButton = this.traceButtonInAllFiles(sourceFiles);

    console.log('✅ Component tree analyzed');
    console.log(`   Input wrappers: ${structure.inputWrappers.length}`);
    console.log(`   Email field: ${structure.emailField?.component || 'not found'}`);
    console.log(`   Password field: ${structure.passwordField?.component || 'not found'}`);

    return structure;
  }

  /**
   * Parse and analyze a single component file
   */
  private async analyzeComponent(filePath: string): Promise<ComponentInfo | null> {
    const content = fs.readFileSync(filePath, 'utf-8');

    try {
      // Parse with Babel (handles TS, JSX, etc.)
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      });

      const info: ComponentInfo = {
        name: path.basename(filePath, path.extname(filePath)),
        filePath,
        props: {},
        renders: [],
        imports: {},
        patterns: {}
      };

      // Traverse AST
      traverse(ast, {
        // Extract imports
        ImportDeclaration: (path) => {
          path.node.specifiers.forEach(spec => {
            if (t.isImportDefaultSpecifier(spec) || t.isImportSpecifier(spec)) {
              info.imports[spec.local.name] = path.node.source.value;
            }
          });
        },

        // Find component definition
        FunctionDeclaration: (path) => {
          if (path.node.id?.name) {
            this.analyzeComponentFunction(path, info);
          }
        },

        VariableDeclarator: (path) => {
          if (t.isArrowFunctionExpression(path.node.init) ||
              t.isFunctionExpression(path.node.init)) {
            this.analyzeComponentFunction(path, info);
          }
        }
      });

      return info;

    } catch (error) {
      console.warn(`Failed to parse ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze a component function to extract props and render structure
   */
  private analyzeComponentFunction(path: any, info: ComponentInfo): void {
    // Extract props from function parameters
    const params = path.node.params || (path.node.init ? path.node.init.params : []);
    if (params[0]) {
      this.extractProps(params[0], info);
    }

    // Analyze what this component renders
    traverse(path.node, {
      JSXElement: (jsxPath) => {
        this.analyzeJSXElement(jsxPath.node, info);
      }
    }, path.scope, path.state);

    // Detect patterns
    if (info.renders.some(r => r.type === 'element' && ['input', 'textarea', 'select'].includes(r.name))) {
      info.patterns.isFormField = true;
    }

    if (info.renders.some(r => r.type === 'component')) {
      info.patterns.isWrapper = true;
    }

    if (Object.values(info.imports).some(imp => imp.includes('react-hook-form'))) {
      info.patterns.usesController = true;
    }

    if (Object.values(info.imports).some(imp => imp.includes('formik'))) {
      info.patterns.usesFormik = true;
    }
  }

  /**
   * Extract props from function parameter
   */
  private extractProps(param: any, info: ComponentInfo): void {
    if (t.isObjectPattern(param)) {
      param.properties.forEach((prop: any) => {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
          const propName = prop.key.name;
          info.props[propName] = {
            type: 'unknown',
            semanticMeaning: this.detectSemanticMeaning(propName)
          };
        }
      });
    }
  }

  /**
   * Analyze JSX element to understand what it renders
   */
  private analyzeJSXElement(node: any, info: ComponentInfo): void {
    const elementName = t.isJSXIdentifier(node.openingElement.name)
      ? node.openingElement.name.name
      : null;

    if (!elementName) return;

    const isElement = elementName.toLowerCase() === elementName;
    const propsFlow: Record<string, string> = {};

    // Track prop flow
    node.openingElement.attributes.forEach((attr: any) => {
      if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
        const attrName = attr.name.name;
        // Check if this is a prop being passed down
        if (t.isJSXExpressionContainer(attr.value)) {
          const expr = attr.value.expression;
          if (t.isIdentifier(expr) && info.props[expr.name]) {
            propsFlow[expr.name] = attrName;
            info.props[expr.name].appliedTo = elementName;
          }
        }
      }
    });

    info.renders.push({
      type: isElement ? 'element' : 'component',
      name: elementName,
      propsFlow
    });
  }

  /**
   * Detect semantic meaning of prop name
   */
  private detectSemanticMeaning(propName: string): ComponentInfo['props'][string]['semanticMeaning'] {
    const lower = propName.toLowerCase();
    if (lower.includes('testid') || lower.includes('data-testid')) return 'testId';
    if (lower === 'id') return 'id';
    if (lower === 'name') return 'name';
    if (lower.includes('label')) return 'label';
    if (lower.includes('placeholder')) return 'placeholder';
    return 'other';
  }

  /**
   * Detect UI library from imports
   */
  private detectLibrary(components: ComponentInfo[]): LoginFormStructure['detectedLibrary'] {
    const allImports = components.flatMap(c => Object.values(c.imports));

    if (allImports.some(imp => imp.includes('@mui') || imp.includes('material-ui'))) {
      return 'MUI';
    }
    if (allImports.some(imp => imp.includes('antd'))) {
      return 'Ant';
    }
    if (allImports.some(imp => imp.includes('@chakra-ui'))) {
      return 'Chakra';
    }
    if (allImports.length === 0) {
      return 'Plain';
    }
    return 'Unknown';
  }

  /**
   * Trace a field by searching ALL source files
   * NO guessing - extract EXACT props from JSX!
   */
  private traceFieldInAllFiles(components: ComponentInfo[], sourceFiles: string[], fieldName: string): LoginFormStructure['emailField'] {
    // Search through ALL files to find the field
    for (const filePath of sourceFiles) {
      const fieldInfo = this.traceFieldInFile(filePath, components, fieldName);
      if (fieldInfo) {
        return fieldInfo;
      }
    }
    return undefined;
  }

  /**
   * Trace a field in a specific file
   * Extract EXACT props from JSX - NO guessing!
   */
  private traceFieldInFile(filePath: string, components: ComponentInfo[], fieldName: string): LoginFormStructure['emailField'] {
    // Re-parse the file to extract EXACT JSX
    const content = fs.readFileSync(filePath, 'utf-8');

    try {
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      });

      let fieldInfo: LoginFormStructure['emailField'] | undefined;

      // Find JSX element with name="email" or name="password" or label="Email"/"Password"
      traverse(ast, {
        JSXElement: (path) => {
          const openingElement = path.node.openingElement;
          const elementName = t.isJSXIdentifier(openingElement.name)
            ? openingElement.name.name
            : null;

          if (!elementName) return;

          // Extract ALL attributes
          const attrs: Record<string, any> = {};
          openingElement.attributes.forEach((attr: any) => {
            if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
              const attrName = attr.name.name;
              let attrValue: any;

              if (t.isStringLiteral(attr.value)) {
                attrValue = attr.value.value;
              } else if (t.isJSXExpressionContainer(attr.value)) {
                const expr = attr.value.expression;
                if (t.isStringLiteral(expr)) {
                  attrValue = expr.value;
                } else if (t.isIdentifier(expr)) {
                  attrValue = `{${expr.name}}`;
                }
              }

              attrs[attrName] = attrValue;
            }
          });

          // Check if this is our field
          const matchesEmail =
            attrs.name === 'email' ||
            attrs.dataTestId?.includes('email') ||
            attrs.label === 'Email';

          const matchesPassword =
            attrs.name === 'password' ||
            attrs.dataTestId?.includes('password') ||
            attrs.label === 'Password';

          if ((fieldName === 'email' && matchesEmail) || (fieldName === 'password' && matchesPassword)) {
            // Find wrapper component
            const wrapper = components.find(w => w.name === elementName);
            const finalElement = wrapper?.renders.find(r => r.type === 'element');

            fieldInfo = {
              component: elementName,
              props: attrs,
              finalElement: finalElement?.name || 'input',
              selectorPath: wrapper
                ? [elementName, finalElement?.name || 'input']
                : [elementName]
            };

            path.stop(); // Stop traversal once found
          }
        }
      });

      return fieldInfo;
    } catch (error) {
      console.warn(`Failed to trace ${fieldName} field: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Trace submit button by searching all files
   */
  private traceButtonInAllFiles(sourceFiles: string[]): LoginFormStructure['submitButton'] {
    for (const filePath of sourceFiles) {
      const buttonInfo = this.traceButtonInFile(filePath);
      if (buttonInfo) {
        return buttonInfo;
      }
    }
    return undefined;
  }

  /**
   * Trace submit button in a specific file - extract EXACT props from JSX
   */
  private traceButtonInFile(filePath: string): LoginFormStructure['submitButton'] {
    const content = fs.readFileSync(filePath, 'utf-8');

    try {
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      });

      let buttonInfo: LoginFormStructure['submitButton'] | undefined;

      traverse(ast, {
        JSXElement: (path) => {
          const openingElement = path.node.openingElement;
          const elementName = t.isJSXIdentifier(openingElement.name)
            ? openingElement.name.name
            : null;

          if (!elementName || (elementName.toLowerCase() !== 'button' && elementName !== 'Button')) {
            return;
          }

          // Extract attributes
          const attrs: Record<string, any> = {};
          openingElement.attributes.forEach((attr: any) => {
            if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
              const attrName = attr.name.name;
              let attrValue: any;

              if (t.isStringLiteral(attr.value)) {
                attrValue = attr.value.value;
              } else if (t.isJSXExpressionContainer(attr.value)) {
                const expr = attr.value.expression;
                if (t.isStringLiteral(expr)) {
                  attrValue = expr.value;
                } else if (t.isIdentifier(expr)) {
                  attrValue = `{${expr.name}}`;
                }
              }

              attrs[attrName] = attrValue;
            }
          });

          // Extract button text
          let text: string | undefined;
          if (path.node.children) {
            for (const child of path.node.children) {
              if (t.isJSXText(child)) {
                text = child.value.trim();
                break;
              }
            }
          }

          // Check if this is likely the submit button (NOT back button!)
          const isBackButton = text?.toLowerCase().includes('back');
          const isLoginButton =
            attrs['data-testid']?.includes('login') ||
            attrs.type === 'submit' ||
            text?.toLowerCase().includes('login') ||
            text?.toLowerCase().includes('sign');

          if (isLoginButton && !isBackButton) {
            buttonInfo = {
              component: elementName,
              props: attrs,
              text
            };

            path.stop();
          }
        }
      });

      return buttonInfo;
    } catch (error) {
      console.warn(`Failed to trace button: ${error.message}`);
      return undefined;
    }
  }
}
