#!/usr/bin/env ts-node

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';

async function debugTestRouteImpact() {
  const codebasePath = path.join(__dirname, '../../loop-frontend');
  const analyzer = new TreeSitterRouteAnalyzer(codebasePath);
  
  console.log('🔍 Debugging Test.tsx route impact\n');
  
  await analyzer.initialize();
  
  // Get the internal import graph
  const graph = (analyzer as any).importGraph;
  
  // Check Test.tsx
  const testPath = 'src/pages/members/Testing/Test.tsx';
  const testNode = graph.get(testPath);
  
  if (testNode) {
    console.log(`📄 ${testPath}:`);
    console.log(`  Imported by: ${Array.from(testNode.importedBy).length} files`);
    
    // Show all importers
    const importers = Array.from(testNode.importedBy);
    importers.forEach(imp => {
      console.log(`    - ${imp}`);
      const importerNode = graph.get(imp);
      if (importerNode?.isRouteFile) {
        console.log(`      ⚠️  This is a ROUTE FILE!`);
      }
    });
  }
  
  // Check the PrivateRouter/index.tsx
  const privateRouterPath = 'src/routes/PrivateRouter/index.tsx';
  const privateRouterNode = graph.get(privateRouterPath);
  
  if (privateRouterNode) {
    console.log(`\n📄 ${privateRouterPath}:`);
    console.log(`  Is route file: ${privateRouterNode.isRouteFile}`);
    console.log(`  Routes count: ${(analyzer as any).fileCache.get(privateRouterPath)?.routes.length || 0}`);
    
    // Check if it imports Test.tsx
    console.log(`  Imports Test.tsx directly: ${privateRouterNode.imports.has(testPath)}`);
    
    // Check imports that might lead to Test.tsx
    console.log(`\n  Checking imports for Test.tsx reference:`);
    Array.from(privateRouterNode.imports).forEach(imp => {
      if (typeof imp === 'string' && (imp.includes('Test') || imp.includes('debugger'))) {
        console.log(`    🎯 ${imp}`);
      }
    });
  }
  
  // Manually trace the path from Test.tsx to routes
  console.log('\n🔄 Tracing path from Test.tsx to route files:');
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number; path: string[] }> = [{ 
    file: testPath, 
    depth: 0, 
    path: [testPath] 
  }];
  
  while (queue.length > 0) {
    const { file, depth, path } = queue.shift()!;
    
    if (visited.has(file) || depth > 5) continue;
    visited.add(file);
    
    const node = graph.get(file);
    if (!node) continue;
    
    if (node.isRouteFile && depth > 0) {
      console.log(`\n  Found route file at depth ${depth}:`);
      console.log(`  Path: ${path.join(' → ')}`);
      
      // Show the routes from this file
      const fileNode = (analyzer as any).fileCache.get(file);
      if (fileNode && fileNode.routes.length > 0) {
        console.log(`  Routes (${fileNode.routes.length}): ${fileNode.routes.slice(0, 5).map((r: any) => r.path).join(', ')}...`);
      }
    }
    
    // Add importers to queue
    for (const importer of node.importedBy) {
      if (!visited.has(importer)) {
        queue.push({ 
          file: importer, 
          depth: depth + 1, 
          path: [...path, importer] 
        });
      }
    }
  }
  
  // Check for the 'debugger' route specifically
  console.log('\n🔍 Looking for "debugger" route definition:');
  const routeFiles = Array.from(graph.entries()).filter(([_, node]) => node.isRouteFile);
  
  for (const [file, node] of routeFiles as [string, any][]) {
    const fileNode = (analyzer as any).fileCache.get(file);
    if (fileNode && fileNode.routes && fileNode.routes.length > 0) {
      const debuggerRoute = fileNode.routes.find((r: any) => r.path === 'debugger');
      if (debuggerRoute) {
        console.log(`  Found "debugger" route in ${file} at line ${debuggerRoute.line}`);
        console.log(`  Component: ${debuggerRoute.component}`);
      }
    }
  }
}

debugTestRouteImpact().catch(console.error);