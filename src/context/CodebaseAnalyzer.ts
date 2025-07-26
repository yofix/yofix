import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { 
  CodebaseContext, 
  FileTree, 
  Route, 
  Component, 
  Dependency,
  Pattern 
} from './types';

/**
 * Analyzes repository structure and extracts context for better fix generation
 */
export class CodebaseAnalyzer {
  private context: CodebaseContext;
  private rootPath: string;

  constructor(rootPath: string = process.cwd()) {
    this.rootPath = rootPath;
    this.context = this.initializeContext();
  }

  /**
   * Analyze the repository and build context
   */
  async analyzeRepository(): Promise<CodebaseContext> {
    core.info('🔍 Analyzing codebase structure...');
    
    try {
      // 1. Detect framework and build tools
      await this.detectFramework();
      
      // 2. Build file tree
      this.context.structure = await this.buildFileTree(this.rootPath);
      
      // 3. Extract routes
      this.context.routes = await this.extractRoutes();
      
      // 4. Map components
      this.context.components = await this.mapComponents();
      
      // 5. Extract style patterns
      this.context.patterns = await this.extractPatterns();
      
      // 6. Analyze dependencies
      this.context.dependencies = await this.analyzeDependencies();
      
      // Update metadata
      this.context.lastUpdated = Date.now();
      
      core.info(`✅ Codebase analysis complete: ${this.context.routes.length} routes, ${this.context.components.length} components found`);
      
      return this.context;
      
    } catch (error) {
      core.warning(`Codebase analysis failed: ${error.message}`);
      return this.context;
    }
  }

  /**
   * Initialize empty context
   */
  private initializeContext(): CodebaseContext {
    return {
      repository: {
        name: path.basename(this.rootPath),
        owner: '',
        defaultBranch: 'main'
      },
      framework: 'unknown',
      styleSystem: 'css',
      buildTool: 'unknown',
      structure: { name: 'root', path: '/', type: 'directory' },
      routes: [],
      components: [],
      patterns: [],
      dependencies: [],
      lastUpdated: Date.now(),
      version: '1.0.0'
    };
  }

  /**
   * Detect framework and build tools
   */
  private async detectFramework(): Promise<void> {
    const packageJsonPath = path.join(this.rootPath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return;
    }
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      // Detect framework
      if (deps['next']) {
        this.context.framework = 'nextjs';
        this.context.buildTool = 'nextjs';
      } else if (deps['react']) {
        this.context.framework = 'react';
        if (deps['vite']) {
          this.context.buildTool = 'vite';
        } else if (deps['react-scripts']) {
          this.context.buildTool = 'cra';
        } else {
          this.context.buildTool = 'webpack';
        }
      } else if (deps['vue']) {
        this.context.framework = 'vue';
        this.context.buildTool = deps['vite'] ? 'vite' : 'webpack';
      } else if (deps['@angular/core']) {
        this.context.framework = 'angular';
      }
      
      // Detect style system
      if (deps['tailwindcss']) {
        this.context.styleSystem = 'tailwind';
      } else if (deps['styled-components']) {
        this.context.styleSystem = 'styled-components';
      } else if (deps['sass'] || deps['node-sass']) {
        this.context.styleSystem = 'sass';
      }
      
    } catch (error) {
      core.warning(`Failed to parse package.json: ${error.message}`);
    }
  }

  /**
   * Build file tree structure
   */
  private async buildFileTree(dirPath: string, relativePath: string = ''): Promise<FileTree> {
    const name = path.basename(dirPath);
    const tree: FileTree = {
      name,
      path: relativePath || '/',
      type: 'directory',
      children: []
    };
    
    // Skip node_modules and hidden directories
    if (name === 'node_modules' || name.startsWith('.')) {
      return tree;
    }
    
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const itemRelativePath = path.join(relativePath, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          const subTree = await this.buildFileTree(itemPath, itemRelativePath);
          tree.children?.push(subTree);
        } else if (stats.isFile()) {
          const ext = path.extname(item);
          if (['.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.sass'].includes(ext)) {
            tree.children?.push({
              name: item,
              path: itemRelativePath,
              type: 'file',
              language: this.getLanguageFromExt(ext),
              size: stats.size
            });
          }
        }
      }
    } catch (error) {
      core.warning(`Failed to read directory ${dirPath}: ${error.message}`);
    }
    
    return tree;
  }

  /**
   * Extract routes based on framework
   */
  private async extractRoutes(): Promise<Route[]> {
    const routes: Route[] = [];
    
    switch (this.context.framework) {
      case 'nextjs':
        routes.push(...await this.extractNextJsRoutes());
        break;
      case 'react':
        routes.push(...await this.extractReactRouterRoutes());
        break;
      case 'vue':
        routes.push(...await this.extractVueRoutes());
        break;
    }
    
    // Always include root route
    if (!routes.find(r => r.path === '/')) {
      routes.push({
        path: '/',
        component: 'App',
        file: this.findMainFile()
      });
    }
    
    return routes;
  }

  /**
   * Extract Next.js routes from pages or app directory
   */
  private async extractNextJsRoutes(): Promise<Route[]> {
    const routes: Route[] = [];
    
    // Check for app directory (Next.js 13+)
    const appDir = path.join(this.rootPath, 'app');
    if (fs.existsSync(appDir)) {
      await this.extractNextJsAppRoutes(appDir, '', routes);
    }
    
    // Check for pages directory
    const pagesDir = path.join(this.rootPath, 'pages');
    if (fs.existsSync(pagesDir)) {
      await this.extractNextJsPagesRoutes(pagesDir, '', routes);
    }
    
    return routes;
  }

  /**
   * Extract routes from Next.js app directory
   */
  private async extractNextJsAppRoutes(dir: string, basePath: string, routes: Route[]): Promise<void> {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        if (!item.startsWith('_') && !item.startsWith('.')) {
          const routePath = basePath + '/' + item.replace(/\[(.+)\]/, ':$1');
          await this.extractNextJsAppRoutes(itemPath, routePath, routes);
        }
      } else if (stats.isFile() && (item === 'page.tsx' || item === 'page.js')) {
        routes.push({
          path: basePath || '/',
          component: `Page${basePath.replace(/\//g, '')}`,
          file: path.relative(this.rootPath, itemPath),
          dynamic: basePath.includes(':')
        });
      }
    }
  }

  /**
   * Extract routes from Next.js pages directory
   */
  private async extractNextJsPagesRoutes(dir: string, basePath: string, routes: Route[]): Promise<void> {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        if (!item.startsWith('_') && !item.startsWith('.')) {
          const routePath = basePath + '/' + item.replace(/\[(.+)\]/, ':$1');
          await this.extractNextJsPagesRoutes(itemPath, routePath, routes);
        }
      } else if (stats.isFile() && ['.tsx', '.jsx', '.js'].includes(path.extname(item))) {
        const name = path.basename(item, path.extname(item));
        if (name !== '_app' && name !== '_document') {
          const routePath = basePath + (name === 'index' ? '' : `/${name.replace(/\[(.+)\]/, ':$1')}`);
          routes.push({
            path: routePath || '/',
            component: `Page${routePath.replace(/[/:]/g, '')}`,
            file: path.relative(this.rootPath, itemPath),
            dynamic: routePath.includes(':')
          });
        }
      }
    }
  }

  /**
   * Extract React Router routes
   */
  private async extractReactRouterRoutes(): Promise<Route[]> {
    const routes: Route[] = [];
    const routeFiles = await this.findFilesContaining(['Route', 'Router', 'createBrowserRouter']);
    
    for (const file of routeFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const ast = parse(content, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript']
        });
        
        const self = this;
        traverse(ast, {
          JSXElement(nodePath) {
            if (t.isJSXIdentifier(nodePath.node.openingElement.name) && 
                nodePath.node.openingElement.name.name === 'Route') {
              const pathAttr = nodePath.node.openingElement.attributes.find(attr =>
                t.isJSXAttribute(attr) && attr.name.name === 'path'
              );
              
              const componentAttr = nodePath.node.openingElement.attributes.find(attr =>
                t.isJSXAttribute(attr) && 
                (attr.name.name === 'component' || attr.name.name === 'element')
              );
              
              if (pathAttr && t.isJSXAttribute(pathAttr) && pathAttr.value) {
                let routePath = '';
                if (t.isStringLiteral(pathAttr.value)) {
                  routePath = pathAttr.value.value;
                } else if (t.isJSXExpressionContainer(pathAttr.value) && 
                          t.isStringLiteral(pathAttr.value.expression)) {
                  routePath = pathAttr.value.expression.value;
                }
                
                if (routePath) {
                  routes.push({
                    path: routePath,
                    component: 'Component',
                    file: path.relative(self.rootPath, file),
                    dynamic: routePath.includes(':')
                  });
                }
              }
            }
          }
        });
      } catch (error) {
        core.warning(`Failed to parse ${file}: ${error.message}`);
      }
    }
    
    return routes;
  }

  /**
   * Extract Vue routes
   */
  private async extractVueRoutes(): Promise<Route[]> {
    // TODO: Implement Vue router extraction
    return [];
  }

  /**
   * Map components in the codebase
   */
  private async mapComponents(): Promise<Component[]> {
    const components: Component[] = [];
    const componentFiles = await this.findComponentFiles();
    
    for (const file of componentFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const component = await this.analyzeComponent(file, content);
        if (component) {
          components.push(component);
        }
      } catch (error) {
        core.warning(`Failed to analyze component ${file}: ${error.message}`);
      }
    }
    
    return components;
  }

  /**
   * Analyze a single component file
   */
  private async analyzeComponent(filePath: string, content: string): Promise<Component | null> {
    const ext = path.extname(filePath);
    const name = path.basename(filePath, ext);
    
    // Skip test files
    if (name.includes('.test') || name.includes('.spec')) {
      return null;
    }
    
    const component: Component = {
      name,
      type: 'unknown',
      file: path.relative(this.rootPath, filePath),
      dependencies: [],
      hasStyles: false
    };
    
    try {
      const ast = parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });
      
      traverse(ast, {
        // Detect function components
        FunctionDeclaration(path) {
          if (path.node.id && /^[A-Z]/.test(path.node.id.name)) {
            component.name = path.node.id.name;
            component.type = 'functional';
          }
        },
        
        // Detect arrow function components
        VariableDeclarator(path) {
          if (t.isIdentifier(path.node.id) && /^[A-Z]/.test(path.node.id.name) &&
              (t.isArrowFunctionExpression(path.node.init) || 
               t.isFunctionExpression(path.node.init))) {
            component.name = path.node.id.name;
            component.type = 'functional';
          }
        },
        
        // Detect class components
        ClassDeclaration(path) {
          if (path.node.id && /^[A-Z]/.test(path.node.id.name)) {
            component.name = path.node.id.name;
            component.type = 'class';
          }
        },
        
        // Detect imports
        ImportDeclaration(path) {
          const source = path.node.source.value;
          if (!source.startsWith('.') && !source.startsWith('@/')) {
            component.dependencies.push(source);
          }
        }
      });
      
      // Check for styles
      if (content.includes('styled-components') || 
          content.includes('.module.css') ||
          content.includes('makeStyles') ||
          content.includes('sx=')) {
        component.hasStyles = true;
      }
      
    } catch (error) {
      // Fallback for non-parseable files
    }
    
    return component.type !== 'unknown' ? component : null;
  }

  /**
   * Extract common patterns from the codebase
   */
  private async extractPatterns(): Promise<Pattern[]> {
    const patterns: Pattern[] = [];
    const styleFiles = await this.findStyleFiles();
    
    for (const file of styleFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const filePatterns = this.extractStylePatterns(content, file);
        patterns.push(...filePatterns);
      } catch (error) {
        core.warning(`Failed to extract patterns from ${file}: ${error.message}`);
      }
    }
    
    return patterns;
  }

  /**
   * Extract style patterns from CSS/SCSS files
   */
  private extractStylePatterns(content: string, filePath: string): Pattern[] {
    const patterns: Pattern[] = [];
    
    // Extract positioning patterns
    const positioningRegex = /position:\s*(fixed|absolute|sticky)[^}]+}/gs;
    const positioningMatches = content.matchAll(positioningRegex);
    
    for (const match of positioningMatches) {
      patterns.push({
        id: `pos-${patterns.length}`,
        type: 'positioning',
        description: 'Positioning pattern',
        code: match[0],
        usage: path.basename(filePath),
        files: [filePath]
      });
    }
    
    // Extract responsive patterns
    const mediaQueryRegex = /@media[^{]+{[^}]+}/gs;
    const mediaMatches = content.matchAll(mediaQueryRegex);
    
    for (const match of mediaMatches) {
      patterns.push({
        id: `resp-${patterns.length}`,
        type: 'responsive',
        description: 'Responsive pattern',
        code: match[0],
        usage: 'media query',
        files: [filePath]
      });
    }
    
    return patterns;
  }

  /**
   * Analyze package dependencies
   */
  private async analyzeDependencies(): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    const packageJsonPath = path.join(this.rootPath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return dependencies;
    }
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      
      // Production dependencies
      for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
        dependencies.push({
          name,
          version: version as string,
          type: 'production',
          isUILibrary: this.isUILibrary(name)
        });
      }
      
      // Dev dependencies
      for (const [name, version] of Object.entries(packageJson.devDependencies || {})) {
        dependencies.push({
          name,
          version: version as string,
          type: 'development',
          isUILibrary: this.isUILibrary(name)
        });
      }
      
    } catch (error) {
      core.warning(`Failed to analyze dependencies: ${error.message}`);
    }
    
    return dependencies;
  }

  /**
   * Helper: Find files containing specific keywords
   */
  private async findFilesContaining(keywords: string[]): Promise<string[]> {
    const files: string[] = [];
    
    const searchDir = (dir: string) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory() && !item.includes('node_modules') && !item.startsWith('.')) {
          searchDir(itemPath);
        } else if (stats.isFile() && ['.js', '.jsx', '.ts', '.tsx'].includes(path.extname(item))) {
          try {
            const content = fs.readFileSync(itemPath, 'utf-8');
            if (keywords.some(keyword => content.includes(keyword))) {
              files.push(itemPath);
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    };
    
    searchDir(this.rootPath);
    return files;
  }

  /**
   * Helper: Find component files
   */
  private async findComponentFiles(): Promise<string[]> {
    const files: string[] = [];
    const componentDirs = ['src/components', 'components', 'src', 'app'];
    
    for (const dir of componentDirs) {
      const dirPath = path.join(this.rootPath, dir);
      if (fs.existsSync(dirPath)) {
        this.findFilesInDir(dirPath, ['.jsx', '.tsx'], files);
      }
    }
    
    return files;
  }

  /**
   * Helper: Find style files
   */
  private async findStyleFiles(): Promise<string[]> {
    const files: string[] = [];
    this.findFilesInDir(this.rootPath, ['.css', '.scss', '.sass'], files);
    return files;
  }

  /**
   * Helper: Recursively find files with extensions
   */
  private findFilesInDir(dir: string, extensions: string[], results: string[]): void {
    if (dir.includes('node_modules') || path.basename(dir).startsWith('.')) {
      return;
    }
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          this.findFilesInDir(itemPath, extensions, results);
        } else if (stats.isFile() && extensions.includes(path.extname(item))) {
          results.push(itemPath);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  /**
   * Helper: Get language from file extension
   */
  private getLanguageFromExt(ext: string): string {
    const map: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass'
    };
    return map[ext] || 'unknown';
  }

  /**
   * Helper: Find main application file
   */
  private findMainFile(): string {
    const candidates = [
      'src/App.tsx',
      'src/App.jsx',
      'src/App.js',
      'src/index.tsx',
      'src/index.jsx',
      'src/index.js',
      'pages/_app.tsx',
      'pages/_app.js',
      'app/layout.tsx',
      'app/layout.js'
    ];
    
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(this.rootPath, candidate))) {
        return candidate;
      }
    }
    
    return 'src/App.js';
  }

  /**
   * Helper: Check if dependency is a UI library
   */
  private isUILibrary(name: string): boolean {
    const uiLibraries = [
      'react', 'vue', 'angular',
      '@mui/material', 'antd', 'bootstrap',
      'tailwindcss', 'styled-components',
      '@chakra-ui/react', 'semantic-ui-react'
    ];
    return uiLibraries.includes(name);
  }

  /**
   * Get the analyzed context
   */
  getContext(): CodebaseContext {
    return this.context;
  }
}