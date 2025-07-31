import Parser from 'tree-sitter';
import TSX from 'tree-sitter-typescript/tsx';
import * as fs from 'fs';
import * as path from 'path';

interface RouteComponentMapping {
  routePath: string;
  componentName: string;
  componentPath?: string;
  line: number;
}

/**
 * Maps components to specific routes they're used in
 * This provides more precise route impact analysis
 */
export class ComponentRouteMapper {
  private parser: Parser;
  private componentRouteMap: Map<string, Set<string>> = new Map();
  
  constructor(private rootPath: string) {
    this.parser = new Parser();
    this.parser.setLanguage(TSX);
  }
  
  /**
   * Analyze a route file to map components to specific routes
   */
  async analyzeRouteFile(filePath: string): Promise<RouteComponentMapping[]> {
    const fullPath = path.join(this.rootPath, filePath);
    const content = await fs.promises.readFile(fullPath, 'utf-8');
    const tree = this.parser.parse(content);
    
    const mappings: RouteComponentMapping[] = [];
    
    // Find route definitions
    const routeObjects = this.findRouteObjects(tree, content);
    
    for (const routeObj of routeObjects) {
      const routePath = this.extractRoutePath(routeObj, content);
      const componentInfo = this.extractRouteComponent(routeObj, content);
      
      if (routePath && componentInfo) {
        mappings.push({
          routePath,
          componentName: componentInfo.name,
          componentPath: componentInfo.path,
          line: routeObj.startPosition.row + 1
        });
        
        // Update component -> routes mapping
        if (!this.componentRouteMap.has(componentInfo.name)) {
          this.componentRouteMap.set(componentInfo.name, new Set());
        }
        this.componentRouteMap.get(componentInfo.name)!.add(routePath);
      }
    }
    
    return mappings;
  }
  
  /**
   * Find all route definition objects in the AST
   */
  private findRouteObjects(tree: Parser.Tree, content: string): Parser.SyntaxNode[] {
    const routeObjects: Parser.SyntaxNode[] = [];
    
    // Look for objects that have route-like properties
    const objects = tree.rootNode.descendantsOfType('object');
    
    for (const obj of objects) {
      // Check if this object has route properties (path, element, component, etc.)
      const hasRouteProp = this.hasRouteProperties(obj, content);
      if (hasRouteProp) {
        routeObjects.push(obj);
      }
    }
    
    return routeObjects;
  }
  
  /**
   * Check if an object has route-like properties
   */
  private hasRouteProperties(obj: Parser.SyntaxNode, content: string): boolean {
    const pairs = obj.children.filter(child => child.type === 'pair');
    
    let hasPath = false;
    let hasElement = false;
    let hasIndex = false;
    
    for (const pair of pairs) {
      const keyNode = pair.childForFieldName('key');
      if (keyNode) {
        const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
        
        if (keyName === 'path') hasPath = true;
        if (keyName === 'element' || keyName === 'component') hasElement = true;
        if (keyName === 'index') hasIndex = true;
      }
    }
    
    return hasPath || hasIndex || hasElement;
  }
  
  /**
   * Extract the route path from a route object
   */
  private extractRoutePath(obj: Parser.SyntaxNode, content: string): string | null {
    const pairs = obj.children.filter(child => child.type === 'pair');
    
    for (const pair of pairs) {
      const keyNode = pair.childForFieldName('key');
      const valueNode = pair.childForFieldName('value');
      
      if (keyNode && valueNode) {
        const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
        
        if (keyName === 'path') {
          return this.extractStringValue(valueNode, content);
        } else if (keyName === 'index') {
          const indexValue = content.slice(valueNode.startIndex, valueNode.endIndex);
          if (indexValue === 'true') {
            return '(index)';
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * Extract the component used in a route
   */
  private extractRouteComponent(obj: Parser.SyntaxNode, content: string): { name: string; path?: string } | null {
    const pairs = obj.children.filter(child => child.type === 'pair');
    
    for (const pair of pairs) {
      const keyNode = pair.childForFieldName('key');
      const valueNode = pair.childForFieldName('value');
      
      if (keyNode && valueNode) {
        const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
        
        if (keyName === 'element' || keyName === 'component') {
          // Handle JSX elements like <Component />
          if (valueNode.type === 'jsx_self_closing_element' || valueNode.type === 'jsx_element') {
            const identifier = valueNode.type === 'jsx_self_closing_element' 
              ? valueNode.childForFieldName('name')
              : valueNode.childForFieldName('opening_element')?.childForFieldName('name');
              
            if (identifier) {
              const componentName = content.slice(identifier.startIndex, identifier.endIndex);
              return { name: componentName };
            }
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * Extract string value from a node
   */
  private extractStringValue(node: Parser.SyntaxNode, content: string): string | null {
    const text = content.slice(node.startIndex, node.endIndex);
    if (text.startsWith('"') || text.startsWith("'")) {
      return text.slice(1, -1);
    }
    return text;
  }
  
  /**
   * Get routes that use a specific component
   */
  getRoutesForComponent(componentName: string): string[] {
    return Array.from(this.componentRouteMap.get(componentName) || []);
  }
  
  /**
   * Clear the cache
   */
  clearCache(): void {
    this.componentRouteMap.clear();
  }
}