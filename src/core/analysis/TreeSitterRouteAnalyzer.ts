import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript/typescript';
import TSX from 'tree-sitter-typescript/tsx';
import JavaScript from 'tree-sitter-javascript';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { ComponentRouteMapper } from './ComponentRouteMapper';
import { StorageProvider } from '../baseline/types';
import { StorageFactory } from '../../providers/storage/StorageFactory';
import { LoggerHook, LoggerFactory } from '../hooks/LoggerHook';
import { ErrorCategory, ErrorSeverity, SimpleErrorHandler, ErrorHandlerFactory } from '../hooks/ErrorHook';

interface ImportNode {
  source: string;
  specifiers: string[];
  line: number;
}

interface RouteDefinition {
  path: string;
  component: string;
  file: string;
  line: number;
}

interface FileNode {
  path: string;
  imports: ImportNode[];
  exports: string[];
  routes: RouteDefinition[];
  hash: string;
  lastModified: number;
}

interface ImportGraphNode {
  file: string;
  importedBy: Set<string>;
  imports: Set<string>;
  isRouteFile: boolean;
  isEntryPoint: boolean;
}

/**
 * High-performance route analyzer using Tree-sitter
 * 10-100x faster than Babel-based parsing
 */
export class TreeSitterRouteAnalyzer {
  private parser: Parser;
  private tsParser: Parser;
  private tsxParser: Parser;
  private jsParser: Parser;
  private logger: LoggerHook;
  private errorHandler: SimpleErrorHandler;
  
  // Multi-level caching
  private astCache: Map<string, { tree: Parser.Tree; hash: string }> = new Map();
  private fileCache: Map<string, FileNode> = new Map();
  private importGraph: Map<string, ImportGraphNode> = new Map();
  private routeCache: Map<string, string[]> = new Map();
  
  // Component to route mapping
  private componentRouteMapper: ComponentRouteMapper;
  private componentToRoutes: Map<string, Set<string>> = new Map();
  
  // Persistent storage
  private storageProvider: StorageProvider | null = null;
  private cacheKey: string;
  
  // Framework detection
  private frameworkType: 'nextjs' | 'react-router' | 'vuejs' | 'unknown' = 'unknown';
  
  constructor(private rootPath: string = process.cwd(), storageProvider?: StorageProvider) {
    // Initialize logger
    this.logger = LoggerFactory.getLogger();
    this.errorHandler = ErrorHandlerFactory.getErrorHandler(this.logger);
    
    // Initialize TypeScript parser
    this.tsParser = new Parser();
    this.tsParser.setLanguage(TypeScript);
    
    // Initialize TSX parser for TypeScript with JSX
    this.tsxParser = new Parser();
    this.tsxParser.setLanguage(TSX);
    
    // Initialize JavaScript parser
    this.jsParser = new Parser();
    this.jsParser.setLanguage(JavaScript);
    
    // Default to TSX parser
    this.parser = this.tsxParser;
    
    // Initialize component route mapper
    this.componentRouteMapper = new ComponentRouteMapper(rootPath);
    
    // Setup storage
    this.storageProvider = storageProvider || null;
    // Generate cache key based on repository path
    const repoName = path.basename(rootPath);
    this.cacheKey = `yofix-cache/${repoName}/import-graph.json`;
  }
  
  /**
   * Clear all caches (both in-memory and persistent)
   */
  async clearCache(): Promise<void> {
    this.logger.info('🗑️ Clearing all route analysis caches...');
    
    // Clear in-memory caches
    this.astCache.clear();
    this.fileCache.clear();
    this.importGraph.clear();
    this.routeCache.clear();
    this.componentToRoutes.clear();
    
    // Clear persistent cache
    try {
      if (this.storageProvider) {
        // Delete from storage provider
        await (this.storageProvider as any).deleteFile?.(this.cacheKey);
        this.logger.info(`✅ Cleared cache from storage: ${this.cacheKey}`);
      } else {
        // Delete local cache
        const localCacheDir = path.join(this.rootPath, '.yofix-cache');
        if (fs.existsSync(localCacheDir)) {
          await fs.promises.rm(localCacheDir, { recursive: true, force: true });
          this.logger.info(`✅ Cleared local cache directory: ${localCacheDir}`);
        }
      }
    } catch (error) {
      this.errorHandler.handle(error as Error, {
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.STORAGE,
        userAction: 'Clear persistent cache',
        metadata: { cacheKey: this.cacheKey },
        recoverable: true,
        skipGitHubPost: true
      });
    }
  }
  
  /**
   * Initialize or load persistent import graph
   */
  /**
   * Detect framework type from package.json
   */
  private async detectFrameworkType(): Promise<'nextjs' | 'react-router' | 'vuejs' | 'unknown'> {
    try {
      const packageJsonPath = path.join(this.rootPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        // Check for React Router first (more specific)
        if (deps['react-router-dom'] || deps['react-router']) {
          return 'react-router';
        }
        
        // Check for Next.js
        if (deps['next']) {
          return 'nextjs';
        }

        if (deps['vue-router'] || deps['vue']) {
          return 'vuejs';
        }
      }
    } catch (error) {
      this.logger.error(`Failed to detect framework type from package.json: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return 'unknown';
  }
  
  async initialize(forceRebuild: boolean = false): Promise<void> {
    const start = Date.now();
    
    // Detect framework type
    this.frameworkType = await this.detectFrameworkType();
    this.logger.info(`Detected framework type: ${this.frameworkType}`);
    
    // Initialize storage provider if not provided
    if (!this.storageProvider) {
      try {
        // Try to create storage provider from inputs
        const storageProviderName = process.env.INPUT_STORAGE_PROVIDER || 'github';
        if (storageProviderName === 'github') {
          // For GitHub provider, we'll use local cache as fallback
          this.logger.info('Using local cache for import graph (GitHub storage)');
        } else {
          this.storageProvider = await StorageFactory.createFromInputs();
        }
      } catch (error) {
        this.logger.warning(`Storage provider initialization failed, using local cache: ${error}`);
      }
    }
    
    // Check if cache should be cleared
    if (forceRebuild) {
      this.logger.info('🔄 Force rebuild requested, clearing cache...');
      await this.clearCache();
    }
    
    // Try to load existing graph
    if (!forceRebuild && await this.loadPersistedGraph()) {
      this.logger.info(`✅ Loaded import graph from cache in ${Date.now() - start}ms`);
      return;
    }
    
    // Build new graph
    this.logger.info('🔨 Building import graph with Tree-sitter...');
    await this.buildImportGraph();
    await this.persistGraph();
    
    this.logger.info(`✅ Built import graph in ${Date.now() - start}ms`);
  }
  
  /**
   * Detect routes affected by file changes
   */
  async detectRoutes(changedFiles: string[]): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();
    
    // Log the changed files
    this.logger.info(`🔍 Analyzing ${changedFiles.length} changed files:`);
    changedFiles.forEach((file, index) => {
      this.logger.info(`  ${index + 1}. ${file}`);
    });
    
    // Update graph for changed files (incremental)
    await this.updateGraphForFiles(changedFiles);
    
    // Use parallel processing for multiple files
    const promises = changedFiles.map(file => 
      this.detectRoutesForFile(file).then(routes => ({ file, routes }))
    );
    
    const fileRoutes = await Promise.all(promises);
    fileRoutes.forEach(({ file, routes }) => {
      if (routes.length > 0) {
        results.set(file, routes);
      }
    });
    
    // Log the impact summary
    this.logger.info('📊 Route Impact Summary:');
    if (results.size === 0) {
      this.logger.info('  ❌ No routes impacted by the changes');
    } else {
      let totalRoutes = 0;
      for (const [file, routes] of results) {
        this.logger.info(`  📄 ${file}:`);
        routes.forEach((route, index) => {
          this.logger.info(`     ${index + 1}. ${route}`);
        });
        totalRoutes += routes.length;
      }
      this.logger.info(`  ✅ Total: ${totalRoutes} routes impacted across ${results.size} files`);
    }
    
    return results;
  }
  
  /**
   * Get detailed route information for files
   */
  async getRouteInfo(changedFiles: string[]): Promise<Map<string, {
    routes: string[];
    isRouteDefiner: boolean;
    importChain: string[];
    routeFileType?: 'primary' | 'test' | 'component-with-routes';
  }>> {
    const results = new Map();
    
    this.logger.info(`🔍 Analyzing route info for ${changedFiles.length} changed files`);
    this.logger.info('📋 Changed files list:');
    changedFiles.forEach((file, index) => {
      this.logger.info(`  ${index + 1}. ${file}`);
    });
    
    for (const file of changedFiles) {
      this.logger.debug(`Processing changed file: ${file}`);
      const routes = await this.detectRoutesForFile(file);
      const node = this.importGraph.get(file);
      const fileNode = this.fileCache.get(file);
      
      // Determine the type of route file
      let routeFileType: 'primary' | 'test' | 'component-with-routes' | undefined;
      if (node?.isRouteFile) {
        routeFileType = this.classifyRouteFile(file);
      }
      
      if (routes.length > 0) {
        this.logger.info(`✅ File ${file} affects ${routes.length} routes: ${routes.join(', ')}`);
      } else {
        this.logger.info(`❌ File ${file} affects no routes`);
      }
      
      results.set(file, {
        routes,
        isRouteDefiner: node?.isRouteFile || false,
        importChain: [], // TODO: Track import chain during traversal
        routeFileType
      });
    }
    
    return results;
  }
  
  /**
   * Build complete import graph using Tree-sitter
   */
  private async buildImportGraph(): Promise<void> {
    const files = await this.getAllCodeFiles();
    const totalFiles = files.length;
    let processed = 0;
    
    // Process files in batches for better performance
    const batchSize = 50;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(file => this.processFile(file)));
      
      processed += batch.length;
      if (processed % 100 === 0) {
        this.logger.info(`Processed ${processed}/${totalFiles} files...`);
      }
    }
    
    // Identify entry points
    this.identifyEntryPoints();
    
    // Connect directory imports to their index files
    this.connectDirectoryImports();
  }
  
  /**
   * Create proper connections between directory imports and their index files
   */
  private connectDirectoryImports(): void {
    const indexVariants = ['/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
    let connectionsCreated = 0;
    
    // For each node in the graph
    for (const [path, node] of this.importGraph) {
      // Check if this looks like a directory import (no file extension)
      const hasExtension = /\.(tsx?|jsx?|vue|svelte)$/.test(path);
      if (!hasExtension) {
        // This might be a directory import, check if it has a corresponding index file
        for (const variant of indexVariants) {
          const indexPath = path + variant;
          const indexNode = this.importGraph.get(indexPath);
          
          if (indexNode) {
            // Found the index file! Connect them bidirectionally
            // Anyone who imports the directory is actually importing the index file
            for (const importer of node.importedBy) {
              indexNode.importedBy.add(importer);
              // Also update the importer's imports to point to the index file
              const importerNode = this.importGraph.get(importer);
              if (importerNode && importerNode.imports.has(path)) {
                importerNode.imports.add(indexPath);
              }
            }
            
            // The directory node should import what the index file imports
            for (const imported of indexNode.imports) {
              node.imports.add(imported);
            }
            
            // Mark the directory node as a route file if the index is a route file
            if (indexNode.isRouteFile) {
              node.isRouteFile = true;
            }
            
            connectionsCreated++;
            this.logger.debug(`Connected directory import ${path} to ${indexPath}`);
            break; // Found the index file, no need to check other variants
          }
        }
      }
    }
    
    this.logger.info(`Created ${connectionsCreated} directory-to-index connections in import graph`);
  }
  
  /**
   * Process a single file with Tree-sitter
   */
  private async processFile(filePath: string): Promise<FileNode> {
    // Check cache first
    const cached = this.getCachedFile(filePath);
    if (cached) return cached;
    
    try {
      const fullPath = path.join(this.rootPath, filePath);
      
      // Check file size first to avoid parsing huge files
      const stats = await fs.promises.stat(fullPath);
      if (stats.size > 1024 * 1024) { // Skip files larger than 1MB
        this.logger.debug(`Skipping large file ${filePath} (${stats.size} bytes)`);
        return {
          path: filePath,
          imports: [],
          exports: [],
          routes: [],
          hash: '',
          lastModified: Date.now()
        };
      }
      
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      
      // Skip files with null bytes (likely binary)
      if (content.includes('\0')) {
        this.logger.debug(`Skipping binary file ${filePath}`);
        return {
          path: filePath,
          imports: [],
          exports: [],
          routes: [],
          hash: '',
          lastModified: Date.now()
        };
      }
      
      const hash = this.getFileHash(content);
      
      // Parse with Tree-sitter - use appropriate parser based on file extension
      let parser: Parser;
      let tree: Parser.Tree;
      
      try {
        if (filePath.endsWith('.tsx')) {
          parser = this.tsxParser;
        } else if (filePath.endsWith('.ts')) {
          parser = this.tsParser;
        } else if (filePath.endsWith('.jsx')) {
          parser = this.tsxParser; // JSX needs TSX parser
        } else {
          parser = this.jsParser;
        }
        tree = parser.parse(content);
      } catch (parseError) {
        // If parsing fails, try with a more permissive parser
        this.logger.debug(`Parse error for ${filePath}: ${parseError}. Trying TSX parser as fallback.`);
        try {
          tree = this.tsxParser.parse(content);
        } catch (fallbackError) {
          this.logger.debug(`Fallback parse also failed for ${filePath}: ${fallbackError}`);
          throw fallbackError;
        }
      }
      
      // Cache AST
      this.astCache.set(filePath, { tree, hash });
      
      // Extract information
      const imports = this.extractImports(tree, filePath, content);
      const exports = this.extractExports(tree, content);
      const routes = this.extractRoutes(tree, filePath, content);
      
      const fileNode: FileNode = {
        path: filePath,
        imports,
        exports,
        routes,
        hash,
        lastModified: Date.now()
      };
      
      // Update caches
      this.fileCache.set(filePath, fileNode);
      this.updateImportGraph(filePath, fileNode);
      
      return fileNode;
    } catch (error: any) {
      // More detailed error logging
      if (error.code === 'ENOENT') {
        // File not found is expected for some cases
        this.logger.debug(`File not found: ${filePath}`);
      } else {
        this.errorHandler.handle(error as Error, {
          severity: ErrorSeverity.LOW,
          category: ErrorCategory.ANALYSIS,
          userAction: 'Parse file with Tree-sitter',
          metadata: { 
            filePath, 
            extension: path.extname(filePath),
            errorCode: error.code,
            isInvalidArgument: error.message?.includes('Invalid argument')
          },
          recoverable: true,
          skipGitHubPost: true
        });
      }
      
      // Return empty file node
      return {
        path: filePath,
        imports: [],
        exports: [],
        routes: [],
        hash: '',
        lastModified: Date.now()
      };
    }
  }
  
  /**
   * Extract imports using Tree-sitter queries
   */
  private extractImports(tree: Parser.Tree, filePath: string, content: string): ImportNode[] {
    const imports: ImportNode[] = [];
    
    // 1. Extract regular import statements
    const importStatements = tree.rootNode.descendantsOfType('import_statement');
    
    for (const node of importStatements) {
      const sourceNode = node.childForFieldName('source');
      if (sourceNode) {
        const source = content.slice(sourceNode.startIndex + 1, sourceNode.endIndex - 1);
        const resolved = this.resolveImportPath(filePath, source);
        
        if (resolved) {
          imports.push({
            source: resolved,
            specifiers: [], // TODO: Extract specifiers if needed
            line: sourceNode.startPosition.row + 1
          });
        }
      }
    }
    
    // 2. Extract dynamic imports (lazy imports)
    const callExpressions = tree.rootNode.descendantsOfType('call_expression');
    
    for (const call of callExpressions) {
      const funcNode = call.childForFieldName('function');
      if (funcNode && content.slice(funcNode.startIndex, funcNode.endIndex) === 'import') {
        // This is a dynamic import: import('path')
        const args = call.childForFieldName('arguments');
        if (args) {
          const stringNodes = args.descendantsOfType('string');
          if (stringNodes.length > 0) {
            const importPath = content.slice(stringNodes[0].startIndex + 1, stringNodes[0].endIndex - 1);
            const resolved = this.resolveImportPath(filePath, importPath);
            
            if (resolved) {
              imports.push({
                source: resolved,
                specifiers: ['default'], // Dynamic imports are default exports
                line: call.startPosition.row + 1
              });
            }
          }
        }
      }
    }
    
    return imports;
  }
  
  /**
   * Extract exports using Tree-sitter
   */
  private extractExports(tree: Parser.Tree, content: string): string[] {
    const exports: string[] = [];
    
    // Find export statements
    const exportNodes = tree.rootNode.descendantsOfType(['export_statement', 'export_specifier']);
    
    for (const node of exportNodes) {
      const text = content.slice(node.startIndex, node.endIndex);
      if (text.includes('export default')) {
        exports.push('default');
      } else {
        // Extract named exports
        const match = text.match(/export\s+(?:const|let|var|function|class)\s+(\w+)/);
        if (match) {
          exports.push(match[1]);
        }
      }
    }
    
    return exports;
  }
  
  /**
   * Extract routes using regex for common patterns
   * This handles cases that are difficult to parse with AST
   */
  private extractRoutesWithRegex(content: string, filePath: string): RouteDefinition[] {
    const routes: RouteDefinition[] = [];
    
    // Remove comments to avoid false positives
    const cleanContent = content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\/\/.*$/gm, ''); // Remove line comments
    
    // Pattern 1: { path: 'route', element: <Component /> }
    const objectRouteRegex = /\{\s*path:\s*['"`]([^'"`]+)['"`]\s*,\s*(?:element|component):\s*<(\w+)[^>]*\/>/g;
    
    let match;
    while ((match = objectRouteRegex.exec(cleanContent)) !== null) {
      const line = content.substring(0, match.index).split('\n').length;
      routes.push({
        path: match[1],
        component: match[2],
        file: filePath,
        line
      });
    }
    
    // Pattern 2: Route arrays with children
    // This helps identify parent-child relationships
    const routeArrayRegex = /\{\s*path:\s*['"`]([^'"`]+)['"`]\s*,\s*children:\s*\[/g;
    while ((match = routeArrayRegex.exec(cleanContent)) !== null) {
      const parentPath = match[1];
      const line = content.substring(0, match.index).split('\n').length;
      
      // Look for child routes within this parent
      const childrenStart = match.index + match[0].length;
      const childrenEnd = this.findBalancedBracket(cleanContent, childrenStart - 1, '[', ']');
      
      if (childrenEnd > childrenStart) {
        const childrenContent = cleanContent.substring(childrenStart, childrenEnd);
        const childRouteRegex = /\{\s*path:\s*['"`]([^'"`]+)['"`]\s*,\s*(?:element|component):\s*<(\w+)[^>]*\/>/g;
        
        let childMatch;
        while ((childMatch = childRouteRegex.exec(childrenContent)) !== null) {
          const childLine = content.substring(0, childrenStart + childMatch.index).split('\n').length;
          const fullPath = parentPath + '/' + childMatch[1];
          routes.push({
            path: fullPath,
            component: childMatch[2],
            file: filePath,
            line: childLine
          });
        }
      }
    }
    
    return routes;
  }
  
  /**
   * Find the closing bracket for a balanced bracket pair
   */
  private findBalancedBracket(content: string, startIndex: number, openChar: string, closeChar: string): number {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      
      // Handle string literals
      if ((char === '"' || char === "'" || char === '`') && content[i - 1] !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }
      
      if (!inString) {
        if (char === openChar) depth++;
        else if (char === closeChar) {
          depth--;
          if (depth === 0) return i;
        }
      }
    }
    
    return -1;
  }
  
  /**
   * Extract routes using Tree-sitter pattern matching
   */
  private extractRoutes(tree: Parser.Tree, filePath: string, content: string): RouteDefinition[] {
    const routes: RouteDefinition[] = [];
    
    // First, try regex-based extraction for route objects
    // This handles { path: 'route', element: <Component /> } patterns reliably
    const regexRoutes = this.extractRoutesWithRegex(content, filePath);
    routes.push(...regexRoutes);
    
    // Then use AST for JSX elements with path props (e.g., <Route path="/" />)
    const jsxElements = tree.rootNode.descendantsOfType('jsx_element');
    
    for (const element of jsxElements) {
      const openingElement = element.childForFieldName('opening_element');
      if (!openingElement) continue;
      
      const attributes = openingElement.descendantsOfType('jsx_attribute');
      
      for (const attr of attributes) {
        const nameNode = attr.childForFieldName('name');
        if (nameNode && content.slice(nameNode.startIndex, nameNode.endIndex) === 'path') {
          const valueNode = attr.childForFieldName('value');
          if (valueNode) {
            const pathValue = this.extractStringValue(valueNode, content);
            if (pathValue) {
              routes.push({
                path: pathValue,
                component: this.extractComponentName(element, attributes, content),
                file: filePath,
                line: element.startPosition.row + 1
              });
            }
          }
        }
      }
    }
    
    // Helper function to extract nested routes recursively
    const extractNestedRoutes = (
      obj: Parser.SyntaxNode, 
      parentPath: string = '',
      isChildRoute: boolean = false
    ): void => {
      let hasPath = false;
      let pathValue = '';
      let hasElement = false;
      let hasChildren = false;
      let childrenNode: Parser.SyntaxNode | null = null;
      let hasIndex = false;
      let componentValue = '';
      
      // Only look at direct children pairs, not nested ones
      const directPairs: Parser.SyntaxNode[] = [];
      for (const child of obj.children) {
        if (child.type === 'pair') {
          directPairs.push(child);
        }
      }
      
      for (const pair of directPairs) {
        const keyNode = pair.childForFieldName('key');
        const valueNode = pair.childForFieldName('value');
        
        if (keyNode && valueNode) {
          const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
          
          if (keyName === 'path') {
            pathValue = this.extractStringValue(valueNode, content) || '';
            hasPath = true;
          } else if (keyName === 'element' || keyName === 'component') {
            hasElement = true;
            // Extract component name from JSX element
            if (valueNode.type === 'jsx_self_closing_element') {
              const identifier = valueNode.childForFieldName('name');
              if (identifier) {
                componentValue = content.slice(identifier.startIndex, identifier.endIndex);
              }
            } else if (valueNode.type === 'jsx_element') {
              const opening = valueNode.childForFieldName('opening_element');
              if (opening) {
                const identifier = opening.childForFieldName('name');
                if (identifier) {
                  componentValue = content.slice(identifier.startIndex, identifier.endIndex);
                }
              }
            }
          } else if (keyName === 'children') {
            hasChildren = true;
            childrenNode = valueNode;
          } else if (keyName === 'index') {
            const indexValue = content.slice(valueNode.startIndex, valueNode.endIndex);
            if (indexValue === 'true') {
              hasIndex = true;
              // Index routes don't have explicit paths
              if (!hasPath) {
                pathValue = '';
              }
            }
          }
        }
      }
      
      // Build the full path for this route
      const fullPath = parentPath && pathValue ? `${parentPath}/${pathValue}` : (parentPath || pathValue);
      
      // Only add leaf routes (routes with element but no children) or routes with element AND children
      // This prevents adding intermediate path segments
      const shouldAddRoute = (hasPath || hasIndex) && hasElement && (!hasChildren || hasElement);
      
      if (shouldAddRoute && fullPath) {
        const routePath = hasIndex && !pathValue ? `${fullPath}/(index)` : fullPath;
        routes.push({
          path: routePath,
          component: componentValue || 'unknown',
          file: filePath,
          line: obj.startPosition.row + 1
        });
        
        // Map component to route for precise impact analysis
        if (componentValue && componentValue !== 'unknown') {
          if (!this.componentToRoutes.has(componentValue)) {
            this.componentToRoutes.set(componentValue, new Set());
          }
          this.componentToRoutes.get(componentValue)!.add(routePath);
          
          // Also track the file this component comes from for lazy imports
          const componentFileNode = this.fileCache.get(filePath);
          if (componentFileNode) {
            for (const imp of componentFileNode.imports) {
              if (imp.specifiers.includes(componentValue) || 
                  (imp.specifiers.includes('default') && imp.source.includes(componentValue))) {
                const importedFile = this.resolveImportPath(imp.source, filePath);
                if (importedFile) {
                  if (!this.componentToRoutes.has(importedFile)) {
                    this.componentToRoutes.set(importedFile, new Set());
                  }
                  this.componentToRoutes.get(importedFile)!.add(routePath);
                }
              }
            }
          }
        }
      }
      
      // Process children routes recursively
      if (hasChildren && childrenNode) {
        // Children is usually an array
        if (childrenNode.type === 'array') {
          for (const child of childrenNode.children) {
            if (child.type === 'object') {
              // Pass the full path to children and mark them as child routes
              extractNestedRoutes(child, fullPath || pathValue, true);
            }
          }
        }
      }
    };
    
    // Find route objects in arrays (e.g., { path: '/', element: <Home /> })
    // This is common in React Router v6 with useRoutes
    const objectExpressions = tree.rootNode.descendantsOfType('object');
    
    for (const obj of objectExpressions) {
      extractNestedRoutes(obj);
    }
    
    // Vue Router pattern detection
    // Vue Router uses: { path: '/foo', component: FooComponent } or { path: '/foo', component: () => import('./Foo.vue') }
    // Also check for Vue 3 composition API: defineComponent({ ... })
    if (filePath.endsWith('.vue') || content.includes('vue-router') || content.includes('createRouter')) {
      // Already handled above - Vue Router uses similar object patterns
      // The object detection above will catch Vue routes
    }
    
    // Angular Router pattern detection
    // Angular uses: { path: 'heroes', component: HeroesComponent }
    if (filePath.endsWith('.ts') && (content.includes('@angular/router') || content.includes('RouterModule'))) {
      // Already handled above - Angular Router uses similar object patterns
    }
    
    // Svelte/SvelteKit pattern detection
    // SvelteKit uses file-based routing in routes/ directory
    if (filePath.includes('/routes/') && filePath.endsWith('.svelte')) {
      // Extract route from file path
      const routeMatch = filePath.match(/routes(\/.+?)(?:\/\+page)?\.svelte$/);
      if (routeMatch) {
        routes.push({
          path: routeMatch[1],
          component: 'SvelteKit Page',
          file: filePath,
          line: 1
        });
      }
    }
    
    // Next.js App Router pattern detection
    // Next.js 13+ uses file-based routing in app/ directory
    if (filePath.includes('/app/') && (filePath.endsWith('/page.tsx') || filePath.endsWith('/page.jsx') || 
        filePath.endsWith('/page.ts') || filePath.endsWith('/page.js'))) {
      // Extract route from file path
      const routeMatch = filePath.match(/app(\/.+?)\/page\.[jt]sx?$/);
      if (routeMatch) {
        let routePath = routeMatch[1];
        // Handle dynamic segments [param] -> :param
        routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');
        // Handle catch-all segments [...param] -> *
        routePath = routePath.replace(/\[\.\.\.([^\]]+)\]/g, '*');
        // Handle optional catch-all [[...param]] -> *
        routePath = routePath.replace(/\[\[\.\.\.([^\]]+)\]\]/g, '*');
        
        routes.push({
          path: routePath,
          component: 'Next.js Page',
          file: filePath,
          line: 1
        });
      }
    }
    
    // Next.js Pages Router pattern detection  
    // Next.js also uses file-based routing in pages/ directory
    // Only apply Next.js file-based routing if this is actually a Next.js project
    if (this.frameworkType === 'nextjs' && filePath.includes('/pages/') && !filePath.includes('_app') && !filePath.includes('_document') &&
        (filePath.endsWith('.tsx') || filePath.endsWith('.jsx') || filePath.endsWith('.ts') || filePath.endsWith('.js'))) {
      // Extract route from file path
      const routeMatch = filePath.match(/pages(\/.+?)\.[jt]sx?$/);
      if (routeMatch) {
        let routePath = routeMatch[1];
        // Remove /index from the path
        routePath = routePath.replace(/\/index$/, '') || '/';
        // Handle dynamic segments [param] -> :param
        routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');
        
        routes.push({
          path: routePath,
          component: 'Next.js Page',
          file: filePath,
          line: 1
        });
      }
    }
    
    return routes;
  }
  
  /**
   * Smart BFS traversal following exact backtracking pattern from docs/import-graph-analysis.md
   */
  private async detectRoutesForFile(filePath: string): Promise<string[]> {
    // Check cache first
    if (this.routeCache.has(filePath)) {
      return this.routeCache.get(filePath)!;
    }
    
    const routes = new Set<string>();
    const visited = new Set<string>();
    const importChain = new Map<string, string[]>(); // Track the import chain for each file
    
    // BFS queue: start from the changed file
    const queue: Array<{ file: string; depth: number; chain: string[] }> = [
      { file: filePath, depth: 0, chain: [filePath] }
    ];
    
    this.logger.debug(`Starting BFS backtracking from ${filePath}`);
    
    while (queue.length > 0) {
      const { file, depth, chain } = queue.shift()!;
      
      if (visited.has(file)) continue;
      visited.add(file);
      
      const node = this.importGraph.get(file);
      if (!node) {
        this.logger.debug(`No import graph node found for: ${file}`);
        this.logger.debug(`Available import graph keys (first 10): ${Array.from(this.importGraph.keys()).slice(0, 10).join(', ')}`);
        
        // Try normalizing the path and looking again
        const normalizedFile = path.resolve(this.rootPath, file);
        const relativeFile = path.relative(this.rootPath, file);
        const alternativeNode = this.importGraph.get(normalizedFile) || this.importGraph.get(relativeFile);
        
        if (alternativeNode) {
          this.logger.debug(`Found node with alternative path: ${normalizedFile || relativeFile}`);
          // Use the alternative node but update our tracking
          this.importGraph.set(file, alternativeNode);
        } else {
          this.logger.debug(`No alternative paths found for: ${file}`);
          continue;
        }
      }
      
      // Log the import chain for debugging
      if (depth > 0) {
        this.logger.debug(`Import chain: ${chain.join(' ← ')}`);
      }
      
      // Check if this file defines routes
      if (node.isRouteFile) {
        const fileNode = this.fileCache.get(file);
        if (fileNode && fileNode.routes.length > 0) {
          // For route files, check if any route is connected to our changed file
          // through the import chain
          const routesToAdd = this.getConnectedRoutes(fileNode, filePath, chain);
          routesToAdd.forEach(r => {
            routes.add(r);
            this.logger.debug(`Found connected route: ${r} via ${file}`);
          });
        }
      }
      
      // Continue BFS - add all files that import this one (backtracking)
      for (const importer of node.importedBy) {
        if (!visited.has(importer)) {
          queue.push({ 
            file: importer, 
            depth: depth + 1,
            chain: [...chain, importer]
          });
        }
      }
    }
    
    // Always try component mapping for more precise results
    // This handles cases where lazy imports use different aliases
    this.logger.debug(`Trying component mapping for ${filePath}`);
    const componentRoutes = await this.findRoutesServingComponent(filePath);
    
    // If component mapping finds specific routes, prefer those over broad BFS results
    if (componentRoutes.length > 0) {
      routes.clear(); // Clear the broad BFS results
      componentRoutes.forEach(route => {
        routes.add(route.routePath);
        this.logger.debug(`Found route via component mapping: ${route.routePath}`);
      });
    }
    
    // Filter and return results
    const result = this.filterCompleteRoutes(Array.from(routes));
    this.routeCache.set(filePath, result);
    
    // Log detailed impact for this file
    if (result.length > 0) {
      this.logger.info(`✅ File ${filePath} impacts ${result.length} routes:`);
      result.forEach((route, index) => {
        this.logger.info(`   ${index + 1}. ${route}`);
      });
    } else {
      this.logger.info(`❌ File ${filePath} impacts no routes`);
    }
    this.logger.debug(`  (Traversed ${visited.size} files in import graph)`);
    
    return result;
  }
  
  /**
   * Get routes that are connected to the changed file through imports
   */
  private getConnectedRoutes(routeFileNode: FileNode, changedFile: string, importChain: string[]): string[] {
    const connectedRoutes: string[] = [];
    
    // Build a set of all components in the import chain
    const componentsInChain = new Set<string>();
    
    for (const file of importChain) {
      // Extract component name from file path
      const fileName = path.basename(file, path.extname(file));
      const componentName = fileName === 'index' ? 
        path.basename(path.dirname(file)) : fileName;
      
      componentsInChain.add(componentName);
      
      // Also add any exports from this file
      const fileNode = this.fileCache.get(file);
      if (fileNode) {
        fileNode.exports.forEach(exp => componentsInChain.add(exp));
      }
    }
    
    this.logger.debug(`Components in import chain: ${Array.from(componentsInChain).join(', ')}`);
    
    // Check each route to see if it uses any component from our chain
    for (const route of routeFileNode.routes) {
      // Check if this route's component is in our chain
      if (componentsInChain.has(route.component)) {
        connectedRoutes.push(route.path);
        this.logger.debug(`Route ${route.path} uses component ${route.component} from chain`);
        continue;
      }
      
      // Check imports in the route file to see if they match our chain
      for (const imp of routeFileNode.imports) {
        // Check if this import is from a file in our chain
        const importIsFromChain = importChain.some(chainFile => {
          const relativePath = path.relative(this.rootPath, chainFile);
          return imp.source.includes(relativePath.replace(/\.[jt]sx?$/, '')) ||
                 imp.source.includes(path.basename(chainFile, path.extname(chainFile)));
        });
        
        if (importIsFromChain) {
          // Check if the imported component is used in this route
          const importedComponents = imp.specifiers.length > 0 ? imp.specifiers : ['default'];
          for (const importedComponent of importedComponents) {
            if (route.component === importedComponent) {
              connectedRoutes.push(route.path);
              this.logger.debug(`Route ${route.path} uses imported component ${importedComponent}`);
              break;
            }
          }
        }
      }
      
      // Also check if the route file imports any file from our chain directly
      // This handles cases where the component name doesn't match due to aliasing
      if (importChain.some(chainFile => {
        return chainFile.includes(changedFile.replace(/\.[jt]sx?$/, ''));
      })) {
        // If the route file is in the chain and imports our changed file
        // We need to check if any routes in this file could be affected
        for (const imp of routeFileNode.imports) {
          if (imp.source.includes(changedFile.replace(/\.[jt]sx?$/, ''))) {
            // This import is our changed file, add the route
            connectedRoutes.push(route.path);
            this.logger.debug(`Route ${route.path} is affected because route file imports ${changedFile}`);
            break;
          }
        }
      }
    }
    
    return connectedRoutes;
  }
  
  
  /**
   * Filter out partial routes and keep only complete route paths
   * For example, if we have ['parent/child', 'child'], only keep 'parent/child'
   */
  private filterCompleteRoutes(routes: string[]): string[] {
    // Create a set for faster lookups
    const routeSet = new Set(routes);
    const completeRoutes: string[] = [];
    
    for (const route of routes) {
      let isComplete = true;
      
      // Check if this route is a suffix of any other route
      for (const otherRoute of routes) {
        if (otherRoute === route) continue;
        
        // Check if current route is a suffix of another route
        if (otherRoute.endsWith('/' + route) || 
            (otherRoute.includes('/' + route + '/') && otherRoute !== route)) {
          isComplete = false;
          break;
        }
      }
      
      if (isComplete) {
        completeRoutes.push(route);
      }
    }
    
    // Return sorted complete routes
    return completeRoutes.sort();
  }
  
  /**
   * Incremental update for changed files
   */
  private async updateGraphForFiles(files: string[]): Promise<void> {
    for (const file of files) {
      // Clear caches for this file
      this.astCache.delete(file);
      this.fileCache.delete(file);
      this.routeCache.delete(file);
      
      // Reprocess the file
      await this.processFile(file);
      
      // Clear route cache for all importers (cascade)
      const node = this.importGraph.get(file);
      if (node) {
        for (const importer of node.importedBy) {
          this.routeCache.delete(importer);
        }
      }
    }
  }
  
  /**
   * Update import graph with file information
   */
  private updateImportGraph(filePath: string, fileNode: FileNode): void {
    // Create or update node
    if (!this.importGraph.has(filePath)) {
      this.importGraph.set(filePath, {
        file: filePath,
        importedBy: new Set(),
        imports: new Set(),
        isRouteFile: false,
        isEntryPoint: false
      });
    }
    
    const node = this.importGraph.get(filePath)!;
    
    // Update imports
    node.imports.clear();
    for (const imp of fileNode.imports) {
      node.imports.add(imp.source);
      
      // Create imported file node if needed - but only for files we've actually processed
      // This prevents creating nodes for non-existent paths
      if (!this.importGraph.has(imp.source)) {
        // Only create a placeholder node if we haven't processed this file yet
        // The node will be properly populated when we process the actual file
        this.importGraph.set(imp.source, {
          file: imp.source,
          importedBy: new Set(),
          imports: new Set(),
          isRouteFile: false,
          isEntryPoint: false
        });
      }
      
      // Update reverse mapping
      this.importGraph.get(imp.source)!.importedBy.add(filePath);
    }
    
    // Mark as route file if it has routes
    node.isRouteFile = fileNode.routes.length > 0;
    
    if (fileNode.routes.length > 0) {
      this.logger.info(`Found ${fileNode.routes.length} routes in ${filePath}: ${fileNode.routes.map(r => r.path).join(', ')}`);
      // Log route components for debugging
      fileNode.routes.forEach(route => {
        if (route.component && route.component !== 'unknown') {
          this.logger.debug(`  Route ${route.path} uses component: ${route.component}`);
        }
      });
    }
  }
  
  /**
   * Identify entry points (files not imported by others)
   */
  private identifyEntryPoints(): void {
    for (const [file, node] of this.importGraph) {
      if (node.importedBy.size === 0) {
        // Check if it's a likely entry point
        if (file.includes('index') || file.includes('main') || file.includes('App')) {
          node.isEntryPoint = true;
        }
      }
    }
  }
  
  /**
   * Persist import graph to storage
   */
  private async persistGraph(): Promise<void> {
    const data = {
      version: '1.0',
      timestamp: Date.now(),
      graph: Array.from(this.importGraph.entries()).map(([file, node]) => ({
        file,
        importedBy: Array.from(node.importedBy),
        imports: Array.from(node.imports),
        isRouteFile: node.isRouteFile,
        isEntryPoint: node.isEntryPoint
      })),
      fileCache: Array.from(this.fileCache.entries()).map(([file, node]) => ({
        ...node,
        imports: node.imports.map(imp => ({ ...imp }))
      }))
    };
    
    const jsonData = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(jsonData, 'utf-8');
    
    try {
      if (this.storageProvider) {
        // Use storage provider
        await this.storageProvider.uploadFile(this.cacheKey, buffer, {
          contentType: 'application/json',
          metadata: {
            repository: path.basename(this.rootPath),
            timestamp: data.timestamp.toString()
          }
        });
        this.logger.info(`✅ Persisted import graph to storage: ${this.cacheKey}`);
      } else {
        // Fallback to local cache
        const localCacheDir = path.join(this.rootPath, '.yofix-cache');
        const localCacheFile = path.join(localCacheDir, 'import-graph.json');
        
        if (!fs.existsSync(localCacheDir)) {
          await fs.promises.mkdir(localCacheDir, { recursive: true });
        }
        
        await fs.promises.writeFile(localCacheFile, jsonData);
        this.logger.info(`✅ Persisted import graph to local cache: ${localCacheFile}`);
      }
    } catch (error) {
      this.errorHandler.handle(error as Error, {
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.STORAGE,
        userAction: 'Persist import graph to storage',
        metadata: { cacheKey: this.cacheKey },
        recoverable: true,
        skipGitHubPost: true
      });
    }
  }
  
  /**
   * Load persisted graph from storage
   */
  private async loadPersistedGraph(): Promise<boolean> {
    try {
      let jsonData: string | null = null;
      
      if (this.storageProvider) {
        // Try to load from storage provider
        try {
          const files = await this.storageProvider.listFiles?.(`yofix-cache/${path.basename(this.rootPath)}/`);
          if (files?.includes(this.cacheKey)) {
            const buffer = await this.storageProvider.downloadFile(this.cacheKey);
            jsonData = buffer.toString('utf-8');
          }
        } catch (error) {
          this.logger.debug(`Failed to load from storage provider: ${error}`);
        }
      }
      
      // Fallback to local cache
      if (!jsonData) {
        const localCacheFile = path.join(this.rootPath, '.yofix-cache', 'import-graph.json');
        if (fs.existsSync(localCacheFile)) {
          jsonData = await fs.promises.readFile(localCacheFile, 'utf-8');
        }
      }
      
      if (!jsonData) return false;
      
      const data = JSON.parse(jsonData);
      
      // Rebuild import graph
      this.importGraph.clear();
      for (const node of data.graph) {
        this.importGraph.set(node.file, {
          file: node.file,
          importedBy: new Set(node.importedBy),
          imports: new Set(node.imports),
          isRouteFile: node.isRouteFile,
          isEntryPoint: node.isEntryPoint
        });
      }
      
      // Rebuild file cache
      this.fileCache.clear();
      if (data.fileCache && Array.isArray(data.fileCache)) {
        for (const item of data.fileCache) {
          // Handle both old format [file, node] and new format {path, ...}
          if (Array.isArray(item)) {
            const [file, node] = item;
            this.fileCache.set(file, node);
          } else if (item.path) {
            this.fileCache.set(item.path, item);
          }
        }
      }
      
      // Connect directory imports to their index files
      this.connectDirectoryImports();
      
      return true;
    } catch (error) {
      this.logger.debug(`Failed to load persisted graph: ${error}`);
      return false;
    }
  }
  
  // Add methods to StorageProvider interface if needed
  private async downloadFile(key: string): Promise<Buffer | null> {
    if (!this.storageProvider || !(this.storageProvider as any).downloadFile) {
      return null;
    }
    try {
      return await (this.storageProvider as any).downloadFile(key);
    } catch (error) {
      this.logger.debug(`Failed to download file ${key}: ${error}`);
      return null;
    }
  }
  
  private async listFiles(prefix: string): Promise<string[] | null> {
    if (!this.storageProvider || !(this.storageProvider as any).listFiles) {
      return null;
    }
    try {
      return await (this.storageProvider as any).listFiles(prefix);
    } catch (error) {
      this.logger.debug(`Failed to list files with prefix ${prefix}: ${error}`);
      return null;
    }
  }
  
  private getFileHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }
  
  private getCachedFile(filePath: string): FileNode | null {
    const cached = this.fileCache.get(filePath);
    if (!cached) return null;
    
    // Check if file has changed
    try {
      const stats = fs.statSync(path.join(this.rootPath, filePath));
      if (stats.mtimeMs > cached.lastModified) {
        return null; // File has changed
      }
      return cached;
    } catch {
      return null;
    }
  }
  
  private extractStringValue(node: Parser.SyntaxNode, content: string): string | null {
    const text = content.slice(node.startIndex, node.endIndex);
    if (text.startsWith('"') || text.startsWith("'")) {
      return text.slice(1, -1);
    }
    return null;
  }
  
  private extractComponentName(element: Parser.SyntaxNode, attributes: Parser.SyntaxNode[], content: string): string {
    for (const attr of attributes) {
      const nameNode = attr.childForFieldName('name');
      if (nameNode) {
        const name = content.slice(nameNode.startIndex, nameNode.endIndex);
        if (['element', 'component'].includes(name)) {
          const valueNode = attr.childForFieldName('value');
          if (valueNode) {
            return content.slice(valueNode.startIndex, valueNode.endIndex);
          }
        }
      }
    }
    return 'unknown';
  }
  
  private findObjectProperty(obj: Parser.SyntaxNode, key: string, content: string): string | null {
    const pairs = obj.descendantsOfType('pair');
    
    for (const pair of pairs) {
      const keyNode = pair.childForFieldName('key');
      if (keyNode && content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '') === key) {
        const valueNode = pair.childForFieldName('value');
        if (valueNode) {
          // If it's a JSX element, extract the component name
          const jsxElement = valueNode.descendantsOfType('jsx_element')[0];
          if (jsxElement) {
            const opening = jsxElement.childForFieldName('opening_element');
            if (opening) {
              const identifier = opening.childForFieldName('name');
              if (identifier) {
                return content.slice(identifier.startIndex, identifier.endIndex);
              }
            }
          }
          // Otherwise try to extract as string
          return this.extractStringValue(valueNode, content);
        }
      }
    }
    
    return null;
  }
  
  private async getAllCodeFiles(): Promise<string[]> {
    const files: string[] = [];
    
    const scanDir = async (dir: string) => {
      const dirName = path.basename(dir);
      // Skip common non-source directories
      if (dirName === 'node_modules' || 
          dirName === '.git' || 
          dirName === 'dist' || 
          dirName === 'build' || 
          dirName === 'coverage' ||
          dirName === '.next' ||
          dirName === 'out') {
        return;
      }
      
      try {
        const items = await fs.promises.readdir(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stats = await fs.promises.stat(itemPath);
          
          if (stats.isDirectory()) {
            await scanDir(itemPath);
          } else if (this.isCodeFile(item)) {
            files.push(path.relative(this.rootPath, itemPath));
          }
        }
      } catch (error) {
        // Skip directories we can't read
        this.logger.debug(`Skipping directory ${dir}: ${error}`);
      }
    };
    
    await scanDir(this.rootPath);
    return files;
  }
  
  private isCodeFile(filename: string): boolean {
    const ext = path.extname(filename);
    return ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'].includes(ext);
  }
  
  private resolveImportPath(fromFile: string, importPath: string): string | null {
    // Check if it's an external package (node_modules)
    if (!importPath.startsWith('.') && !importPath.startsWith('@/') && !importPath.startsWith('src/')) {
      return null; // External package
    }
    
    const fromDir = path.dirname(fromFile);
    let resolvedPath: string;
    
    if (importPath.startsWith('@/')) {
      resolvedPath = importPath.replace('@/', 'src/');
    } else if (importPath.startsWith('src/')) {
      // Already an absolute path from project root
      resolvedPath = importPath;
    } else {
      resolvedPath = path.normalize(path.join(fromDir, importPath));
    }
    
    // Try different extensions and index files
    const extensions = ['', '.tsx', '.ts', '.jsx', '.js'];
    const indexExtensions = ['/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
    
    // First try direct file extensions
    for (const ext of extensions) {
      const fullPath = resolvedPath.endsWith(ext) ? resolvedPath : resolvedPath + ext;
      const absolutePath = path.join(this.rootPath, fullPath);
      if (fs.existsSync(absolutePath)) {
        // Normalize path to use forward slashes
        const normalizedPath = fullPath.replace(/\\/g, '/');
        return normalizedPath;
      }
    }
    
    // Then try index files in the directory
    for (const ext of indexExtensions) {
      const fullPath = resolvedPath + ext;
      const absolutePath = path.join(this.rootPath, fullPath);
      if (fs.existsSync(absolutePath)) {
        // Normalize path to use forward slashes
        const normalizedPath = fullPath.replace(/\\/g, '/');
        this.logger.debug(`Resolved import ${importPath} → ${normalizedPath}`);
        return normalizedPath;
      }
    }
    
    // Log failed resolution for debugging
    this.logger.debug(`Could not resolve import: ${importPath} from ${fromFile}`);
    this.logger.debug(`  Tried paths: ${extensions.map(e => resolvedPath + e).concat(indexExtensions.map(e => resolvedPath + e)).join(', ')}`);
    return null;
  }
  
  /**
   * Export methods for performance metrics
   */
  getMetrics() {
    return {
      totalFiles: this.importGraph.size,
      routeFiles: Array.from(this.importGraph.values()).filter(n => n.isRouteFile).length,
      entryPoints: Array.from(this.importGraph.values()).filter(n => n.isEntryPoint).length,
      cacheSize: this.astCache.size,
      importEdges: Array.from(this.importGraph.values()).reduce((sum, n) => sum + n.imports.size, 0)
    };
  }

  /**
   * Classify what type of route file this is
   */
  private classifyRouteFile(filePath: string): 'primary' | 'test' | 'component-with-routes' {
    const lowerPath = filePath.toLowerCase();
    
    // Check if it's a test file
    if (lowerPath.includes('test') || lowerPath.includes('spec') || 
        lowerPath.includes('__tests__') || lowerPath.includes('__mocks__')) {
      return 'test';
    }
    
    // Check if it's a primary route configuration file
    if (lowerPath.includes('router') || lowerPath.includes('routes') || 
        lowerPath.includes('routing') || lowerPath.endsWith('router.tsx') ||
        lowerPath.endsWith('routes.ts') || lowerPath.endsWith('routing.ts') ||
        lowerPath.includes('app.tsx') || lowerPath.includes('app.ts')) {
      return 'primary';
    }
    
    // Otherwise it's a component that happens to contain route objects
    return 'component-with-routes';
  }

  /**
   * Find routes that serve a specific component file
   * This is the reverse lookup - given a component, find which routes use it
   */
  async findRoutesServingComponent(componentFile: string): Promise<Array<{
    routePath: string;
    component: string;
    routeFile: string;
    line: number;
  }>> {
    const servingRoutes: Array<{
      routePath: string;
      component: string;
      routeFile: string;
      line: number;
    }> = [];
    
    // Validate input
    if (!componentFile) {
      this.logger.debug('findRoutesServingComponent called with undefined componentFile');
      return servingRoutes;
    }
    
    // Get the component name from the file path
    const componentName = path.basename(componentFile, path.extname(componentFile));
    
    // Look through all route files to find which ones serve this component
    for (const [filePath, node] of this.importGraph) {
      if (node.isRouteFile) {
        try {
          const fullPath = path.join(this.rootPath, filePath);
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          
          // Find how this component is imported in this file
          const componentAlias = await this.findComponentAlias(content, componentFile);
          
          if (!componentAlias) {
            continue;
          }
          
          // Parse the file
          const parser = filePath.endsWith('.tsx') ? this.tsxParser : this.tsParser;
          const tree = parser.parse(content);
          
          // Find route definitions that serve this component
          const routeObjects = this.findRouteObjects(tree, content);
          
          for (const routeObj of routeObjects) {
            const routePath = this.extractRoutePath(routeObj, content);
            const routeComponent = this.extractRouteComponent(routeObj, content);
            
            // Check if this route uses our component (via its alias)
            if (routePath && routeComponent === componentAlias) {
              servingRoutes.push({
                routePath,
                component: `${componentAlias} (${componentName})`,
                routeFile: filePath,
                line: routeObj.startPosition.row + 1
              });
            }
          }
        } catch (error) {
          // Ignore errors reading individual files
          this.logger.debug(`Error analyzing ${filePath}: ${error}`);
        }
      }
    }
    
    return servingRoutes;
  }

  /**
   * Find how a component is imported in a file (handles lazy imports, aliases, etc.)
   */
  private async findComponentAlias(content: string, componentFile: string): Promise<string | null> {
    // Normalize the component file path for comparison (remove extension)
    const normalizedComponentFile = componentFile.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
    const componentBaseName = path.basename(componentFile, path.extname(componentFile));
    
    // 1. Look for lazy imports like: const Debugger = lazy(() => import('...'))
    const lazyImportRegex = /const\s+(\w+)\s*=\s*lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    
    let match;
    while ((match = lazyImportRegex.exec(content)) !== null) {
      const [_, alias, importPath] = match;
      
      // Normalize the import path for comparison
      const normalizedImportPath = importPath.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
      
      // Check if this import matches our component
      if (normalizedImportPath === normalizedComponentFile ||
          normalizedImportPath.endsWith('/' + normalizedComponentFile) ||
          normalizedComponentFile.endsWith('/' + normalizedImportPath) ||
          normalizedImportPath.endsWith(normalizedComponentFile.replace(/^src\//, ''))) {
        return alias;
      }
    }
    
    // 2. Check regular default imports: import Component from '...'
    const defaultImportRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
    
    while ((match = defaultImportRegex.exec(content)) !== null) {
      const [_, alias, importPath] = match;
      
      const normalizedImportPath = importPath.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
      
      if (normalizedImportPath === normalizedComponentFile ||
          normalizedImportPath.endsWith('/' + normalizedComponentFile) ||
          normalizedComponentFile.endsWith('/' + normalizedImportPath)) {
        return alias;
      }
    }
    
    // 3. Check named imports: import { Component } from '...' or import { Component as Alias } from '...'
    const namedImportRegex = /import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g;
    
    while ((match = namedImportRegex.exec(content)) !== null) {
      const [_, imports, importPath] = match;
      
      const normalizedImportPath = importPath.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
      
      if (normalizedImportPath === normalizedComponentFile ||
          normalizedImportPath.endsWith('/' + normalizedComponentFile) ||
          normalizedComponentFile.endsWith('/' + normalizedImportPath)) {
        
        // Parse the imports to find the component
        const importParts = imports.split(',').map(s => s.trim());
        for (const importPart of importParts) {
          // Handle: Component or Component as Alias
          const asMatch = importPart.match(/(\w+)\s+as\s+(\w+)/);
          if (asMatch) {
            const [_, original, alias] = asMatch;
            if (original === componentBaseName || original.toLowerCase() === componentBaseName.toLowerCase()) {
              return alias;
            }
          } else {
            const componentName = importPart.trim();
            if (componentName === componentBaseName || componentName.toLowerCase() === componentBaseName.toLowerCase()) {
              return componentName;
            }
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Find route configuration objects in the AST
   */
  private findRouteObjects(tree: Parser.Tree, content: string): Parser.SyntaxNode[] {
    const routeObjects: Parser.SyntaxNode[] = [];
    const objects = tree.rootNode.descendantsOfType('object');
    
    for (const obj of objects) {
      // Check if this looks like a route object
      const pairs = obj.children.filter(child => child.type === 'pair');
      
      let hasRouteProperties = false;
      for (const pair of pairs) {
        const keyNode = pair.childForFieldName('key');
        if (keyNode) {
          const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
          if (['path', 'element', 'component', 'index'].includes(keyName)) {
            hasRouteProperties = true;
            break;
          }
        }
      }
      
      if (hasRouteProperties) {
        routeObjects.push(obj);
      }
    }
    
    return routeObjects;
  }

  /**
   * Extract route path from a route object
   */
  private extractRoutePath(obj: Parser.SyntaxNode, content: string): string | null {
    const pairs = obj.children.filter(child => child.type === 'pair');
    
    for (const pair of pairs) {
      const keyNode = pair.childForFieldName('key');
      const valueNode = pair.childForFieldName('value');
      
      if (keyNode && valueNode) {
        const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
        
        if (keyName === 'path') {
          const value = content.slice(valueNode.startIndex, valueNode.endIndex);
          return value.replace(/['"]/g, '');
        } else if (keyName === 'index') {
          const value = content.slice(valueNode.startIndex, valueNode.endIndex);
          if (value === 'true') {
            return '(index)';
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Extract component name from a route object
   */
  private extractRouteComponent(obj: Parser.SyntaxNode, content: string): string | null {
    const pairs = obj.children.filter(child => child.type === 'pair');
    
    for (const pair of pairs) {
      const keyNode = pair.childForFieldName('key');
      const valueNode = pair.childForFieldName('value');
      
      if (keyNode && valueNode) {
        const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
        
        if (keyName === 'element' || keyName === 'component') {
          // Extract component name from JSX
          if (valueNode.type === 'jsx_self_closing_element') {
            const nameNode = valueNode.childForFieldName('name');
            if (nameNode) {
              return content.slice(nameNode.startIndex, nameNode.endIndex);
            }
          } else if (valueNode.type === 'jsx_element') {
            const opening = valueNode.childForFieldName('opening_element');
            if (opening) {
              const nameNode = opening.childForFieldName('name');
              if (nameNode) {
                return content.slice(nameNode.startIndex, nameNode.endIndex);
              }
            }
          } else if (valueNode.type === 'call_expression') {
            // Handle function calls like TermsOfService()
            const funcNode = valueNode.childForFieldName('function');
            if (funcNode && funcNode.type === 'identifier') {
              return content.slice(funcNode.startIndex, funcNode.endIndex);
            }
          } else if (valueNode.type === 'identifier') {
            // Handle direct identifiers
            return content.slice(valueNode.startIndex, valueNode.endIndex);
          }
        }
      }
    }
    
    return null;
  }
}