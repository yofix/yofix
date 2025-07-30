import * as core from '@actions/core';
import * as github from '@actions/github';
import { CodebaseAnalyzer } from '../../context/CodebaseAnalyzer';
import { CodebaseContext, Route, Component } from '../../context/types';
import * as path from 'path';
import * as fs from 'fs';

export interface RouteImpact {
  route: string;
  directChanges: string[];
  componentChanges: string[];
  styleChanges: string[];
  sharedComponents: string[]; // Components used by multiple routes
}

export interface RouteImpactTree {
  affectedRoutes: RouteImpact[];
  sharedComponents: Map<string, string[]>; // component -> routes using it
  totalFilesChanged: number;
  totalRoutesAffected: number;
}

/**
 * Analyzes the impact of file changes on routes
 */
export class RouteImpactAnalyzer {
  private octokit: ReturnType<typeof github.getOctokit>;
  private codebaseContext: CodebaseContext | null = null;
  private componentUsageMap: Map<string, Set<string>> = new Map(); // component -> routes

  constructor(private githubToken: string) {
    this.octokit = github.getOctokit(githubToken);
  }

  /**
   * Analyze PR changes and create route impact tree
   */
  async analyzePRImpact(prNumber: number): Promise<RouteImpactTree> {
    core.info('🔍 Analyzing route impact from PR changes...');

    // Get changed files from PR
    const changedFiles = await this.getChangedFiles(prNumber);
    
    // Get codebase context
    const analyzer = new CodebaseAnalyzer();
    this.codebaseContext = await analyzer.analyzeRepository();
    
    // Build component usage map
    await this.buildComponentUsageMap();
    
    // Analyze impact on each route
    const routeImpacts = await this.analyzeRouteImpacts(changedFiles);
    
    // Filter out routes with no changes
    const affectedRoutes = routeImpacts.filter(impact => 
      impact.directChanges.length > 0 || 
      impact.componentChanges.length > 0 || 
      impact.styleChanges.length > 0
    );
    
    // Find shared components (used by multiple routes)
    const sharedComponents = this.findSharedComponents(affectedRoutes);
    
    return {
      affectedRoutes,
      sharedComponents,
      totalFilesChanged: changedFiles.length,
      totalRoutesAffected: affectedRoutes.length
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
    if (tree.affectedRoutes.length === 0) {
      return '✅ No routes affected by changes in this PR';
    }

    let output = '## 🌳 Route Impact Tree\n\n';
    output += `📊 **${tree.totalFilesChanged}** files changed → **${tree.totalRoutesAffected}** routes affected\n\n`;
    
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
      
      // Direct changes
      for (const file of impact.directChanges) {
        output += `${childPrefix}├── ${path.basename(file)} (route file)\n`;
      }
      
      // Component changes
      for (const file of impact.componentChanges) {
        const isShared = impact.sharedComponents.includes(file);
        const label = isShared ? 'shared component' : 'component';
        output += `${childPrefix}├── ${path.basename(file)} (${label})\n`;
      }
      
      // Style changes
      for (let j = 0; j < impact.styleChanges.length; j++) {
        const file = impact.styleChanges[j];
        const isLastFile = j === impact.styleChanges.length - 1 && 
                          impact.directChanges.length === 0 && 
                          impact.componentChanges.length === 0;
        const filePrefix = isLastFile ? '└── ' : '├── ';
        output += `${childPrefix}${filePrefix}${path.basename(file)} (styles)\n`;
      }
    }
    
    output += '```';
    
    return output;
  }
}