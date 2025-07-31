import * as core from '@actions/core';
import * as github from '@actions/github';
import { CodebaseAnalyzer } from '../../context/CodebaseAnalyzer';
import { CodebaseContext, Route, Component } from '../../context/types';
import { TreeSitterRouteAnalyzer } from './TreeSitterRouteAnalyzer';
import * as path from 'path';
import * as fs from 'fs';
import { StorageProvider } from '../baseline/types';

export interface RouteImpact {
  route: string;
  directChanges: string[];
  componentChanges: string[];
  styleChanges: string[];
  sharedComponents: string[]; // Components used by multiple routes
  servingRoutes?: Array<{ // Routes that serve this component (if this is a component file)
    routePath: string;
    routeFile: string;
  }>;
}

export interface RouteImpactTree {
  affectedRoutes: RouteImpact[];
  sharedComponents: Map<string, string[]>; // component -> routes using it
  totalFilesChanged: number;
  totalRoutesAffected: number;
  componentRouteMapping?: Map<string, Array<{ // Enhanced: component file -> routes that serve it
    routePath: string;
    routeFile: string;
  }>>;
}

/**
 * Analyzes the impact of file changes on routes
 */
export class RouteImpactAnalyzer {
  private octokit: ReturnType<typeof github.getOctokit>;
  private codebaseContext: CodebaseContext | null = null;
  private componentUsageMap: Map<string, Set<string>> = new Map(); // component -> routes
  private routeAnalyzer: TreeSitterRouteAnalyzer;

  constructor(private githubToken: string, storageProvider?: StorageProvider) {
    this.octokit = github.getOctokit(githubToken);
    this.routeAnalyzer = new TreeSitterRouteAnalyzer(process.cwd(), storageProvider);
  }

  /**
   * Analyze PR changes and create route impact tree
   */
  async analyzePRImpact(prNumber: number): Promise<RouteImpactTree> {
    core.info('🔍 Analyzing route impact from PR changes...');
    
    // IMPORTANT: GitHub Actions runs with the PR's code checked out
    // We have full access to all files in the repository at the PR's HEAD commit
    
    // Step 1: Get list of changed files from GitHub API
    const changedFiles = await this.getChangedFiles(prNumber);
    core.info(`Found ${changedFiles.length} changed files in PR #${prNumber}`);
    
    // Step 2: Analyze the entire codebase structure (has access to all files)
    // This reads from the checked-out repository on disk
    const analyzer = new CodebaseAnalyzer();
    this.codebaseContext = await analyzer.analyzeRepository();
    
    // Step 3: Initialize Tree-sitter analyzer for high-performance route detection
    // Check if cache should be cleared
    const clearCache = core.getInput('clear-cache') === 'true';
    await this.routeAnalyzer.initialize(clearCache);
    core.info(`Initialized route analyzer with Tree-sitter${clearCache ? ' (cache cleared)' : ''}`);
    
    // Step 4: For each changed file, find which routes it affects
    const affectedRoutes = await this.analyzeWithBacktracking(changedFiles);
    
    // Step 5: Find shared components (used by multiple routes)
    const sharedComponents = this.findSharedComponents(affectedRoutes);
    
    // Step 6: Enhanced - Find which routes serve changed components
    const componentRouteMapping = new Map<string, Array<{ routePath: string; routeFile: string }>>();
    
    for (const changedFile of changedFiles) {
      // Check if this is a component file (not a style file)
      const isComponent = !this.isStyleFile(changedFile);
      
      if (isComponent) {
        const servingRoutes = await this.routeAnalyzer.findRoutesServingComponent(changedFile);
        if (servingRoutes.length > 0) {
          componentRouteMapping.set(changedFile, servingRoutes.map(r => ({
            routePath: r.routePath,
            routeFile: r.routeFile
          })));
        }
      }
    }
    
    return {
      affectedRoutes,
      sharedComponents,
      totalFilesChanged: changedFiles.length,
      totalRoutesAffected: affectedRoutes.length,
      componentRouteMapping
    };
  }

  /**
   * Get changed files from PR
   */
  private async getChangedFiles(prNumber: number): Promise<string[]> {
    const { data: files } = await this.octokit.rest.pulls.listFiles({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: prNumber,
      per_page: 100
    });

    return files
      .filter(file => file.status !== 'removed')
      .map(file => file.filename);
  }
  
  /**
   * Analyze affected routes using the hybrid analyzer
   */
  private async analyzeWithBacktracking(changedFiles: string[]): Promise<RouteImpact[]> {
    const routeImpactMap = new Map<string, RouteImpact>();
    
    // Get detailed route information for all changed files
    const routeInfo = await this.routeAnalyzer.getRouteInfo(changedFiles);
    
    // Build route impact map
    for (const [changedFile, info] of routeInfo) {
      for (const route of info.routes) {
        // Initialize route impact if not exists
        if (!routeImpactMap.has(route)) {
          routeImpactMap.set(route, {
            route,
            directChanges: [],
            componentChanges: [],
            styleChanges: [],
            sharedComponents: []
          });
        }
        
        const impact = routeImpactMap.get(route)!;
        
        // Categorize the change based on actual information
        if (info.isRouteDefiner) {
          // This file actually defines the route
          impact.directChanges.push(changedFile);
        } else if (this.isStyleFile(changedFile)) {
          impact.styleChanges.push(changedFile);
        } else {
          // It's a component that affects this route
          impact.componentChanges.push(changedFile);
        }
      }
    }
    
    // Handle global styles that affect all routes
    for (const changedFile of changedFiles) {
      if (this.isGlobalStyle(changedFile) && !routeInfo.has(changedFile)) {
        // Add to all known routes
        for (const impact of routeImpactMap.values()) {
          if (!impact.styleChanges.includes(changedFile)) {
            impact.styleChanges.push(changedFile);
          }
        }
      }
    }
    
    // Identify shared components
    const componentRouteMap = new Map<string, Set<string>>();
    
    // Build component to routes mapping
    for (const impact of routeImpactMap.values()) {
      for (const component of impact.componentChanges) {
        if (!componentRouteMap.has(component)) {
          componentRouteMap.set(component, new Set());
        }
        componentRouteMap.get(component)!.add(impact.route);
      }
    }
    
    // Mark shared components
    for (const impact of routeImpactMap.values()) {
      impact.sharedComponents = impact.componentChanges.filter(component => {
        const routes = componentRouteMap.get(component);
        return routes ? routes.size > 1 : false;
      });
    }
    
    return Array.from(routeImpactMap.values());
  }
  
  
  /**
   * Check if a file is a style file
   */
  private isStyleFile(filePath: string): boolean {
    const ext = path.extname(filePath);
    return ['.css', '.scss', '.sass', '.less'].includes(ext) || 
           filePath.includes('.module.');
  }
  
  /**
   * Check if a style file is global (affects all routes)
   */
  private isGlobalStyle(filePath: string): boolean {
    if (!this.isStyleFile(filePath)) return false;
    
    const fileName = path.basename(filePath).toLowerCase();
    return fileName.includes('global') || 
           fileName.includes('app') || 
           fileName.includes('index') ||
           fileName.includes('main') ||
           filePath.includes('styles/') ||
           filePath.includes('assets/');
  }

  /**
   * Build a map of which routes use which components
   */
  private async buildComponentUsageMap(): Promise<void> {
    if (!this.codebaseContext) return;

    for (const route of this.codebaseContext.routes) {
      const routeComponents = await this.getRouteComponents(route);
      
      for (const component of routeComponents) {
        if (!this.componentUsageMap.has(component)) {
          this.componentUsageMap.set(component, new Set());
        }
        this.componentUsageMap.get(component)!.add(route.path);
      }
    }
  }

  /**
   * Get all components used by a route (including nested imports)
   */
  private async getRouteComponents(route: Route): Promise<string[]> {
    const components = new Set<string>();
    const visited = new Set<string>();
    
    await this.collectComponentsRecursively(route.file, components, visited);
    
    return Array.from(components);
  }

  /**
   * Recursively collect all imported components
   */
  private async collectComponentsRecursively(
    filePath: string, 
    components: Set<string>, 
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    try {
      const fullPath = path.join(process.cwd(), filePath);
      if (!fs.existsSync(fullPath)) return;

      const content = fs.readFileSync(fullPath, 'utf-8');
      
      // Extract imports
      const importRegex = /import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
      const matches = content.matchAll(importRegex);
      
      for (const match of matches) {
        const importPath = match[1];
        
        // Skip external packages
        if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
          continue;
        }
        
        // Resolve relative import
        const resolvedPath = this.resolveImportPath(filePath, importPath);
        if (resolvedPath && this.isComponentFile(resolvedPath)) {
          components.add(resolvedPath);
          
          // Recursively check this component's imports
          await this.collectComponentsRecursively(resolvedPath, components, visited);
        }
      }
    } catch (error) {
      core.debug(`Failed to analyze ${filePath}: ${error}`);
    }
  }

  /**
   * Resolve import path to actual file path
   */
  private resolveImportPath(fromFile: string, importPath: string): string | null {
    const fromDir = path.dirname(fromFile);
    let resolvedPath: string;

    if (importPath.startsWith('@/')) {
      // Alias import (assuming @/ points to src/)
      resolvedPath = importPath.replace('@/', 'src/');
    } else {
      // Relative import
      resolvedPath = path.join(fromDir, importPath);
    }

    // Try different extensions
    const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
    
    for (const ext of extensions) {
      const fullPath = resolvedPath.endsWith(ext) ? resolvedPath : resolvedPath + ext;
      if (fs.existsSync(path.join(process.cwd(), fullPath))) {
        return fullPath;
      }
    }

    return null;
  }

  /**
   * Check if a file is a component file
   */
  private isComponentFile(filePath: string): boolean {
    const ext = path.extname(filePath);
    const name = path.basename(filePath, ext);
    
    // Component file heuristics
    return (
      ['.tsx', '.jsx'].includes(ext) &&
      !name.includes('.test') &&
      !name.includes('.spec') &&
      !name.includes('.stories') &&
      (name[0] === name[0].toUpperCase() || filePath.includes('components/'))
    );
  }

  /**
   * Analyze impact on each route
   */
  private async analyzeRouteImpacts(changedFiles: string[]): Promise<RouteImpact[]> {
    if (!this.codebaseContext) return [];

    const impacts: RouteImpact[] = [];

    for (const route of this.codebaseContext.routes) {
      const impact = await this.analyzeRouteImpact(route, changedFiles);
      impacts.push(impact);
    }

    return impacts;
  }

  /**
   * Analyze impact on a single route
   */
  private async analyzeRouteImpact(route: Route, changedFiles: string[]): Promise<RouteImpact> {
    const directChanges: string[] = [];
    const componentChanges: string[] = [];
    const styleChanges: string[] = [];
    const sharedComponents: string[] = [];

    // Check if route file itself changed
    if (changedFiles.includes(route.file)) {
      directChanges.push(route.file);
    }

    // Get all components used by this route
    const routeComponents = await this.getRouteComponents(route);

    // Check which components changed
    for (const component of routeComponents) {
      if (changedFiles.includes(component)) {
        componentChanges.push(component);
        
        // Check if this component is shared
        const usedByRoutes = this.componentUsageMap.get(component);
        if (usedByRoutes && usedByRoutes.size > 1) {
          sharedComponents.push(component);
        }
      }
    }

    // Check for style changes
    const styleFiles = changedFiles.filter(file => 
      file.endsWith('.css') || 
      file.endsWith('.scss') || 
      file.endsWith('.sass') ||
      file.includes('.module.')
    );

    // Check global styles (affect all routes)
    const globalStyles = styleFiles.filter(file => 
      file.includes('global') || 
      file.includes('app.css') || 
      file.includes('index.css') ||
      file.includes('styles/')
    );

    if (globalStyles.length > 0) {
      styleChanges.push(...globalStyles);
    }

    // Check route-specific styles
    const routeDir = path.dirname(route.file);
    const routeSpecificStyles = styleFiles.filter(file => 
      file.startsWith(routeDir) || 
      file.includes(path.basename(route.file, path.extname(route.file)))
    );

    styleChanges.push(...routeSpecificStyles);

    return {
      route: route.path,
      directChanges: [...new Set(directChanges)],
      componentChanges: [...new Set(componentChanges)],
      styleChanges: [...new Set(styleChanges)],
      sharedComponents: [...new Set(sharedComponents)]
    };
  }

  /**
   * Find components shared by multiple affected routes
   */
  private findSharedComponents(affectedRoutes: RouteImpact[]): Map<string, string[]> {
    const sharedMap = new Map<string, string[]>();

    // Collect all changed components
    const allChangedComponents = new Set<string>();
    for (const route of affectedRoutes) {
      route.componentChanges.forEach(c => allChangedComponents.add(c));
    }

    // For each changed component, find which routes use it
    for (const component of allChangedComponents) {
      const routes = this.componentUsageMap.get(component);
      if (routes && routes.size > 1) {
        const affectedRoutesPaths = affectedRoutes.map(r => r.route);
        const sharedRoutes = Array.from(routes).filter(r => affectedRoutesPaths.includes(r));
        
        if (sharedRoutes.length > 1) {
          sharedMap.set(component, sharedRoutes);
        }
      }
    }

    return sharedMap;
  }

  /**
   * Format the impact tree for GitHub comment
   */
  formatImpactTree(tree: RouteImpactTree): string {
    if (tree.affectedRoutes.length === 0 && (!tree.componentRouteMapping || tree.componentRouteMapping.size === 0)) {
      return '✅ No routes affected by changes in this PR';
    }

    let output = '## 🌳 Route Impact Tree\n\n';
    output += `📊 **${tree.totalFilesChanged}** files changed → **${tree.totalRoutesAffected}** routes affected\n\n`;
    
    // Add component route mapping if available
    if (tree.componentRouteMapping && tree.componentRouteMapping.size > 0) {
      output += '🎯 **Component Usage** (routes that serve these components):\n';
      for (const [component, routes] of tree.componentRouteMapping) {
        const componentName = path.basename(component);
        output += `- \`${componentName}\` served by:\n`;
        for (const route of routes) {
          output += `  - \`${route.routePath}\` in ${path.basename(route.routeFile)}\n`;
        }
      }
      output += '\n';
    }
    
    // Add shared components warning if any
    if (tree.sharedComponents.size > 0) {
      output += '⚠️ **Shared Components** (changes affect multiple routes):\n';
      for (const [component, routes] of tree.sharedComponents) {
        const componentName = path.basename(component);
        output += `- \`${componentName}\` → affects ${routes.map(r => `\`${r}\``).join(', ')}\n`;
      }
      output += '\n';
    }
    
    output += '```\nRoute Tree:\n';
    
    for (let i = 0; i < tree.affectedRoutes.length; i++) {
      const impact = tree.affectedRoutes[i];
      const isLast = i === tree.affectedRoutes.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';
      
      output += `${prefix}${impact.route}\n`;
      
      // Collect all files to determine which is last
      const allFiles: Array<{file: string, type: string}> = [];
      
      // Add direct changes
      for (const file of impact.directChanges) {
        allFiles.push({file, type: 'route file'});
      }
      
      // Add component changes
      for (const file of impact.componentChanges) {
        const isShared = impact.sharedComponents.includes(file);
        const label = isShared ? 'shared component' : 'component';
        allFiles.push({file, type: label});
      }
      
      // Add style changes
      for (const file of impact.styleChanges) {
        allFiles.push({file, type: 'styles'});
      }
      
      // Output all files with proper tree structure
      for (let j = 0; j < allFiles.length; j++) {
        const {file, type} = allFiles[j];
        const isLastFile = j === allFiles.length - 1;
        const filePrefix = isLastFile ? '└── ' : '├── ';
        output += `${childPrefix}${filePrefix}${path.basename(file)} (${type})\n`;
      }
    }
    
    output += '```';
    
    return output;
  }
}