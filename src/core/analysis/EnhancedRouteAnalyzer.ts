import { TreeSitterRouteAnalyzer } from './TreeSitterRouteAnalyzer';
import { ComponentRouteMapper } from './ComponentRouteMapper';
import * as path from 'path';
import * as core from '@actions/core';

interface ComponentImportInfo {
  localName: string;  // Name used in the file (e.g., 'Debugger')
  sourcePath: string; // Import source (e.g., 'src/pages/members/Testing/Test')
  importType: 'named' | 'default' | 'namespace';
}

interface RouteImpactResult {
  file: string;
  directRoutes: string[];      // Routes where this component is directly used
  indirectRoutes: string[];    // Routes affected through component dependencies
  totalImpact: number;
  isRouteFile: boolean;
}

/**
 * Enhanced route analyzer that provides precise component-to-route mapping
 */
export class EnhancedRouteAnalyzer {
  private baseAnalyzer: TreeSitterRouteAnalyzer;
  private componentMapper: ComponentRouteMapper;
  private componentImportMap: Map<string, Map<string, ComponentImportInfo>> = new Map();
  
  constructor(private rootPath: string = process.cwd()) {
    this.baseAnalyzer = new TreeSitterRouteAnalyzer(rootPath);
    this.componentMapper = new ComponentRouteMapper(rootPath);
  }
  
  /**
   * Initialize the analyzer
   */
  async initialize(): Promise<void> {
    await this.baseAnalyzer.initialize();
    await this.buildComponentMappings();
  }
  
  /**
   * Get precise route impact for changed files
   */
  async getRouteImpact(changedFiles: string[]): Promise<Map<string, RouteImpactResult>> {
    const results = new Map<string, RouteImpactResult>();
    
    for (const file of changedFiles) {
      const impact = await this.analyzeFileImpact(file);
      results.set(file, impact);
    }
    
    return results;
  }
  
  /**
   * Analyze the route impact of a single file
   */
  private async analyzeFileImpact(filePath: string): Promise<RouteImpactResult> {
    // Get basic route info from base analyzer
    const routeInfo = await this.baseAnalyzer.getRouteInfo([filePath]);
    const fileInfo = routeInfo.get(filePath);
    
    if (!fileInfo) {
      return {
        file: filePath,
        directRoutes: [],
        indirectRoutes: [],
        totalImpact: 0,
        isRouteFile: false
      };
    }
    
    // If it's a route file, all its routes are directly impacted
    if (fileInfo.isRouteDefiner) {
      return {
        file: filePath,
        directRoutes: fileInfo.routes,
        indirectRoutes: [],
        totalImpact: fileInfo.routes.length,
        isRouteFile: true
      };
    }
    
    // For component files, find which specific routes use this component
    const directRoutes = await this.findDirectRouteUsage(filePath);
    const indirectRoutes = await this.findIndirectRouteUsage(filePath);
    
    // Remove duplicates between direct and indirect
    const indirectSet = new Set(indirectRoutes);
    directRoutes.forEach(route => indirectSet.delete(route));
    
    return {
      file: filePath,
      directRoutes,
      indirectRoutes: Array.from(indirectSet),
      totalImpact: directRoutes.length + indirectSet.size,
      isRouteFile: false
    };
  }
  
  /**
   * Find routes that directly use this component
   */
  private async findDirectRouteUsage(componentPath: string): Promise<string[]> {
    const directRoutes: string[] = [];
    
    // Get the component name from the file path
    const componentName = path.basename(componentPath, path.extname(componentPath));
    
    // Check all route files to see which ones import and use this component
    const graph = (this.baseAnalyzer as any).importGraph;
    const routeFiles = Array.from(graph.entries())
      .filter(([_, node]) => node.isRouteFile)
      .map(([file]) => file);
    
    for (const routeFile of routeFiles) {
      // Check if this route file imports our component
      const importInfo = this.componentImportMap.get(routeFile);
      if (!importInfo) continue;
      
      // Find if any import matches our component
      let componentLocalName: string | null = null;
      
      for (const [localName, info] of importInfo) {
        if (info.sourcePath === componentPath || 
            info.sourcePath.endsWith(componentName) ||
            componentPath.endsWith(info.sourcePath + '.tsx') ||
            componentPath.endsWith(info.sourcePath + '.ts')) {
          componentLocalName = localName;
          break;
        }
      }
      
      if (componentLocalName) {
        // Analyze the route file to find which routes use this component
        const routeMappings = await this.componentMapper.analyzeRouteFile(routeFile);
        
        for (const mapping of routeMappings) {
          if (mapping.componentName === componentLocalName) {
            directRoutes.push(mapping.routePath);
          }
        }
      }
    }
    
    return directRoutes;
  }
  
  /**
   * Find routes indirectly affected through component dependencies
   */
  private async findIndirectRouteUsage(componentPath: string): Promise<string[]> {
    // This would trace through the component dependency graph
    // For now, return empty array to focus on direct usage
    return [];
  }
  
  /**
   * Build component import mappings for all route files
   */
  private async buildComponentMappings(): Promise<void> {
    const graph = (this.baseAnalyzer as any).importGraph;
    const fileCache = (this.baseAnalyzer as any).fileCache;
    
    // Process all route files
    const routeFiles = Array.from(graph.entries())
      .filter(([_, node]) => node.isRouteFile)
      .map(([file]) => file);
    
    for (const routeFile of routeFiles) {
      const fileNode = fileCache.get(routeFile);
      if (!fileNode) continue;
      
      const importMap = new Map<string, ComponentImportInfo>();
      
      // Process imports to build local name mappings
      for (const imp of fileNode.imports) {
        // Extract component name from import
        // This is simplified - real implementation would parse import specifiers
        const sourcePath = imp.source;
        const componentName = path.basename(sourcePath, path.extname(sourcePath));
        
        // For lazy imports like: const Debugger = lazy(() => import('...'))
        // We need to check the file content to find the local name
        // For now, use the component name as a heuristic
        importMap.set(componentName, {
          localName: componentName,
          sourcePath: sourcePath,
          importType: 'default'
        });
      }
      
      this.componentImportMap.set(routeFile, importMap);
    }
  }
  
  /**
   * Get metrics about the analysis
   */
  getMetrics() {
    return this.baseAnalyzer.getMetrics();
  }
}