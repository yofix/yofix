#!/usr/bin/env node

/**
 * Route Extractor Module
 * Discovers routes in the codebase - falls back to simple extraction if tree-sitter fails
 */

import * as fs from 'fs';
import * as path from 'path';

interface ExtractedRoute {
  path: string;
  title: string;
  method: 'static' | 'dynamic';
  priority: number;
}

async function extractRoutes(): Promise<void> {
  const previewUrl = process.env.INPUT_PREVIEW_URL;
  const maxRoutes = parseInt(process.env.INPUT_MAX_ROUTES || '10');
  const debug = process.env.INPUT_DEBUG === 'true';

  if (!previewUrl) {
    console.error('❌ Preview URL is required');
    process.exit(1);
  }

  console.log(`🔍 Extracting routes for ${previewUrl}`);
  console.log(`📊 Max routes: ${maxRoutes}`);

  try {
    let routes: ExtractedRoute[] = [];
    
    // Try tree-sitter based extraction first
    try {
      routes = await extractRoutesWithTreeSitter(maxRoutes, debug);
    } catch (treeError) {
      console.log('⚠️ Tree-sitter extraction failed, using fallback method');
      if (debug) {
        console.log('Tree-sitter error:', treeError);
      }
      routes = await extractRoutesSimple(maxRoutes, debug);
    }
    
    if (debug) {
      console.log('📋 Extracted routes:', JSON.stringify(routes, null, 2));
    }

    // Output results
    console.log(`✅ Found ${routes.length} routes`);
    
    // Set GitHub Action output
    const outputPath = path.join(process.cwd(), 'routes.json');
    fs.writeFileSync(outputPath, JSON.stringify(routes, null, 2));
    
    // Write to GITHUB_OUTPUT if available
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      fs.appendFileSync(githubOutput, `routes=${JSON.stringify(routes)}\n`);
      fs.appendFileSync(githubOutput, `route-count=${routes.length}\n`);
    }

  } catch (error) {
    console.error('❌ Route extraction failed:', error);
    
    // Final fallback
    const fallbackRoutes = [
      { path: '/', title: 'Home', method: 'static' as const, priority: 100 }
    ];
    
    const outputPath = path.join(process.cwd(), 'routes.json');
    fs.writeFileSync(outputPath, JSON.stringify(fallbackRoutes, null, 2));
    
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      fs.appendFileSync(githubOutput, `routes=${JSON.stringify(fallbackRoutes)}\n`);
      fs.appendFileSync(githubOutput, `route-count=1\n`);
    }
  }
}

/**
 * Extract routes using tree-sitter (requires tree-sitter modules)
 */
async function extractRoutesWithTreeSitter(maxRoutes: number, debug: boolean): Promise<ExtractedRoute[]> {
  // Dynamic import to handle missing tree-sitter gracefully
  const Parser = (await import('tree-sitter')).default;
  const TSX = (await import('tree-sitter-typescript/tsx')).default;
  
  const parser = new Parser();
  parser.setLanguage(TSX);
  
  const routes = new Set<string>();
  
  // Look for common route files
  const routeFiles = [
    'src/routes/index.tsx',
    'src/routes/index.ts',
    'src/router/index.tsx',
    'src/router/index.ts',
    'src/App.tsx',
    'src/App.ts',
    'src/routes.tsx',
    'src/routes.ts'
  ];
  
  for (const file of routeFiles) {
    if (fs.existsSync(file)) {
      if (debug) {
        console.log(`🔍 Scanning ${file} for routes...`);
      }
      
      const content = await fs.promises.readFile(file, 'utf-8');
      const tree = parser.parse(content);
      
      // Find route definitions
      const objects = tree.rootNode.descendantsOfType('object');
      
      for (const obj of objects) {
        const pairs = obj.children.filter(child => child.type === 'pair');
        let pathValue: string | null = null;
        let hasElement = false;
        
        for (const pair of pairs) {
          const keyNode = pair.childForFieldName('key');
          const valueNode = pair.childForFieldName('value');
          
          if (keyNode && valueNode) {
            const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
            
            if (keyName === 'path') {
              pathValue = content.slice(valueNode.startIndex, valueNode.endIndex).replace(/['"]/g, '');
            }
            if (keyName === 'element' || keyName === 'component') {
              hasElement = true;
            }
          }
        }
        
        if (pathValue && hasElement) {
          routes.add(pathValue);
        }
      }
    }
  }
  
  // Always include home
  routes.add('/');
  
  // Convert to ExtractedRoute format
  return Array.from(routes)
    .map(route => ({
      path: route,
      title: route === '/' ? 'Home' : 
             route.substring(1).split('/').map(
               part => part.charAt(0).toUpperCase() + part.slice(1)
             ).join(' '),
      method: 'static' as const,
      priority: route === '/' ? 100 : 
                route.split('/').length === 2 ? 80 : 50
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxRoutes);
}

/**
 * Simple fallback route extraction
 */
async function extractRoutesSimple(maxRoutes: number, debug: boolean): Promise<ExtractedRoute[]> {
  const routes = new Set<string>();
  
  // Common routes in web applications
  const commonRoutes = [
    '/',
    '/dashboard',
    '/login',
    '/signup',
    '/profile',
    '/settings',
    '/about',
    '/contact',
    '/help',
    '/admin',
    '/users',
    '/products',
    '/orders',
    '/reports',
    '/analytics'
  ];
  
  // Check if any route files exist and extract simple patterns
  const routeFiles = [
    'src/routes/index.tsx',
    'src/routes/index.ts',
    'src/App.tsx',
    'src/App.ts'
  ];
  
  for (const file of routeFiles) {
    if (fs.existsSync(file)) {
      try {
        const content = await fs.promises.readFile(file, 'utf-8');
        
        // Simple regex to find route patterns
        const pathRegex = /['"]path['"]\s*:\s*['"]([^'"]+)['"]/g;
        let match;
        
        while ((match = pathRegex.exec(content)) !== null) {
          routes.add(match[1]);
        }
        
        // Also look for route strings
        const routeRegex = /['"]\/[a-zA-Z0-9-/]+['"]/g;
        while ((match = routeRegex.exec(content)) !== null) {
          const route = match[0].replace(/['"]/g, '');
          if (route.length > 1 && !route.includes('.')) {
            routes.add(route);
          }
        }
      } catch (error) {
        if (debug) {
          console.log(`Failed to read ${file}:`, error);
        }
      }
    }
  }
  
  // Add discovered routes, then common routes up to maxRoutes
  const allRoutes = Array.from(routes);
  for (const route of commonRoutes) {
    if (allRoutes.length >= maxRoutes) break;
    if (!routes.has(route)) {
      allRoutes.push(route);
    }
  }
  
  // Convert to ExtractedRoute format
  return allRoutes
    .slice(0, maxRoutes)
    .map(route => ({
      path: route,
      title: route === '/' ? 'Home' : 
             route.substring(1).split('/').map(
               part => part.charAt(0).toUpperCase() + part.slice(1)
             ).join(' '),
      method: 'static' as const,
      priority: route === '/' ? 100 : 
                route.split('/').length === 2 ? 80 : 50
    }))
    .sort((a, b) => b.priority - a.priority);
}

// Run if called directly
if (require.main === module) {
  extractRoutes().catch(console.error);
}