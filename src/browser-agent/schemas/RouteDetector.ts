import * as fs from 'fs';
import * as path from 'path';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { glob } from 'glob';
import { ImportResolver } from './ImportResolver.util';

/**
 * Detects which component file handles a specific route
 *
 * TODO: Replace with route-impact-analyzer method when exposed
 * This is a minimal fallback implementation
 */
export class RouteDetector {
  private repositoryRoot: string;

  constructor(repositoryRoot: string) {
    this.repositoryRoot = repositoryRoot;
  }

  /**
   * Find the component file that handles a specific URL path
   * @param url Full URL or path like "https://app.tryloop.ai/login/password" or "/login/password"
   * @returns Absolute path to the component file
   */
  async findRouteComponent(url: string): Promise<string | null> {
    // Extract path from URL
    const urlPath = this.extractPath(url);
    console.log(`🔍 Finding component for path: ${urlPath}`);

    // Strategy 1: Check for React Router routes
    const reactRouterComponent = await this.findReactRouterComponent(urlPath);
    if (reactRouterComponent) {
      console.log(`✅ Found via React Router: ${reactRouterComponent}`);
      return reactRouterComponent;
    }

    // Strategy 2: Convention-based search (works for many patterns)
    const conventionComponent = await this.findByConvention(urlPath);
    if (conventionComponent) {
      console.log(`✅ Found via convention: ${conventionComponent}`);
      return conventionComponent;
    }

    // Strategy 3: File-based routing (Next.js, Remix)
    const fileBasedComponent = await this.findFileBasedRoute(urlPath);
    if (fileBasedComponent) {
      console.log(`✅ Found via file-based routing: ${fileBasedComponent}`);
      return fileBasedComponent;
    }

    console.log(`⚠️  Could not find component for ${urlPath}`);
    return null;
  }

  /**
   * Extract path from full URL
   */
  private extractPath(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      // Already a path
      return url.startsWith('/') ? url : `/${url}`;
    }
  }

  /**
   * Find component by parsing React Router configuration
   */
  private async findReactRouterComponent(urlPath: string): Promise<string | null> {
    // Find routing files (App.tsx, routes.tsx, Router.tsx, etc.)
    const routingFiles = await glob('**/{App,app,Router,router,routes,Routes}.{tsx,jsx,ts,js}', {
      cwd: this.repositoryRoot,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      absolute: true
    });

    for (const file of routingFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const ast = parser.parse(content, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript']
        });

        let foundPath: string | null = null;

        traverse(ast, {
          JSXElement(path) {
            const openingElement = path.node.openingElement;
            const elementName = openingElement.name;

            // Check for <Route path="..." element={<Component />} />
            if (t.isJSXIdentifier(elementName) && elementName.name === 'Route') {
              const pathAttr = openingElement.attributes.find(
                (attr): attr is t.JSXAttribute =>
                  t.isJSXAttribute(attr) &&
                  t.isJSXIdentifier(attr.name) &&
                  attr.name.name === 'path'
              );

              if (pathAttr && t.isStringLiteral(pathAttr.value)) {
                const routePath = pathAttr.value.value;

                // Match route path
                if (this.matchRoutePath(urlPath, routePath)) {
                  // Find element or component attribute
                  const elementAttr = openingElement.attributes.find(
                    (attr): attr is t.JSXAttribute =>
                      t.isJSXAttribute(attr) &&
                      t.isJSXIdentifier(attr.name) &&
                      (attr.name.name === 'element' || attr.name.name === 'component')
                  );

                  if (elementAttr && t.isJSXExpressionContainer(elementAttr.value)) {
                    const expression = elementAttr.value.expression;

                    // Extract component name
                    let componentName: string | null = null;

                    if (t.isJSXElement(expression)) {
                      const compName = expression.openingElement.name;
                      if (t.isJSXIdentifier(compName)) {
                        componentName = compName.name;
                      }
                    } else if (t.isIdentifier(expression)) {
                      componentName = expression.name;
                    }

                    if (componentName) {
                      // Find import for this component
                      const componentFile = this.findComponentImport(ast, componentName, file);
                      if (componentFile) {
                        foundPath = componentFile;
                      }
                    }
                  }
                }
              }
            }
          }
        });

        if (foundPath) {
          return foundPath;
        }
      } catch (error) {
        console.debug(`Failed to parse ${file}: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Match URL path against route pattern (supports params like :id, *)
   */
  private matchRoutePath(urlPath: string, routePath: string): boolean {
    // Exact match
    if (urlPath === routePath) return true;

    // Convert route pattern to regex
    const pattern = routePath
      .replace(/:[^/]+/g, '[^/]+') // :id -> any segment
      .replace(/\*/g, '.*'); // * -> anything

    const regex = new RegExp(`^${pattern}$`);
    return regex.test(urlPath);
  }

  /**
   * Find component import in AST
   */
  private findComponentImport(ast: any, componentName: string, currentFile: string): string | null {
    let importPath: string | null = null;

    traverse(ast, {
      ImportDeclaration(path) {
        const specifiers = path.node.specifiers;
        const source = path.node.source.value;

        for (const specifier of specifiers) {
          if (
            (t.isImportDefaultSpecifier(specifier) || t.isImportSpecifier(specifier)) &&
            t.isIdentifier(specifier.local) &&
            specifier.local.name === componentName
          ) {
            // Use shared ImportResolver
            const currentDir = path.dirname(currentFile);
            importPath = ImportResolver.resolveImport(source, currentDir);
            break;
          }
        }
      }
    });

    return importPath;
  }

  /**
   * Find component by convention (path matches file structure)
   * e.g., /login/password -> src/pages/Login/Password.tsx or src/pages/login/password.tsx
   */
  private async findByConvention(urlPath: string): Promise<string | null> {
    // Clean up path
    const pathSegments = urlPath.split('/').filter(s => s);

    // Common patterns to try
    const patterns = [
      // PascalCase: /login/password -> LoginPassword.tsx
      `**/${pathSegments.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}.{tsx,jsx}`,
      // Nested PascalCase: /login/password -> Login/Password.tsx
      `**/${pathSegments.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('/')}.{tsx,jsx}`,
      // kebab-case: /login/password -> login-password.tsx
      `**/${pathSegments.join('-')}.{tsx,jsx}`,
      // Direct match: /login/password -> login/password.tsx
      `**/${pathSegments.join('/')}.{tsx,jsx}`,
      // With "Page" suffix: /login/password -> login/PasswordPage.tsx
      `**/${pathSegments.slice(0, -1).join('/')}/${pathSegments[pathSegments.length - 1].charAt(0).toUpperCase() + pathSegments[pathSegments.length - 1].slice(1)}Page.{tsx,jsx}`
    ];

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: this.repositoryRoot,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        absolute: true
      });

      if (files.length > 0) {
        // Prefer files in pages/ or routes/ directories
        const preferredFile = files.find(f => f.includes('/pages/') || f.includes('/routes/'));
        return preferredFile || files[0];
      }
    }

    return null;
  }

  /**
   * Find component via file-based routing (Next.js, Remix)
   */
  private async findFileBasedRoute(urlPath: string): Promise<string | null> {
    const pathSegments = urlPath.split('/').filter(s => s);

    // Next.js pages directory
    const nextPagesPath = path.join(this.repositoryRoot, 'pages', ...pathSegments) + '.tsx';
    if (fs.existsSync(nextPagesPath)) {
      return nextPagesPath;
    }

    // Next.js app directory
    const nextAppPath = path.join(this.repositoryRoot, 'app', ...pathSegments, 'page.tsx');
    if (fs.existsSync(nextAppPath)) {
      return nextAppPath;
    }

    return null;
  }
}
