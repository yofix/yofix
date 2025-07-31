#!/usr/bin/env ts-node

/**
 * Route Impact Graph Script
 * 
 * Analyzes how file changes affect routes in a codebase.
 * Uses Tree-sitter for fast AST parsing and builds an import graph
 * to trace which routes are impacted by component changes.
 * 
 * Usage: ts-node route-impact-graph.ts <codebase-path> <file1> [file2] [...]
 * 
 * Example: 
 *   ts-node route-impact-graph.ts ../loop-frontend src/pages/Login.tsx src/components/Button.tsx
 */

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';
import * as fs from 'fs';

// Disable debug logging
process.env.ACTIONS_STEP_DEBUG = 'false';

interface RouteNode {
  path: string;
  files: Map<string, FileInfo>;
}

interface FileInfo {
  type: 'route' | 'component' | 'style' | 'other';
  isRouteDefiner: boolean;
}

async function analyzeRouteImpact(codebasePath: string, files: string[]) {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   Route Impact Analysis                    ║
╚═══════════════════════════════════════════════════════════╝
`);
  
  console.log(`📁 Codebase: ${codebasePath}`);
  console.log(`📄 Analyzing ${files.length} file(s)\n`);
  
  const absolutePath = path.resolve(codebasePath);
  
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Error: Codebase path does not exist: ${absolutePath}`);
    process.exit(1);
  }
  
  try {
    // Initialize analyzer
    process.stdout.write('⏳ Initializing route analyzer...');
    const analyzer = new TreeSitterRouteAnalyzer(absolutePath);
    await analyzer.initialize();
    console.log(' ✅');
    
    // Show metrics
    const metrics = analyzer.getMetrics();
    console.log(`📊 Found ${metrics.routeFiles} route files in ${metrics.totalFiles} total files`);
    
    // Analyze files
    process.stdout.write('🔍 Detecting affected routes...');
    const routeInfo = await analyzer.getRouteInfo(files);
    console.log(' ✅\n');
    
    // Build route graph
    const routeGraph = new Map<string, RouteNode>();
    
    for (const [file, info] of routeInfo) {
      const fileType = getFileType(file);
      const fileInfo: FileInfo = {
        type: fileType,
        isRouteDefiner: info.isRouteDefiner
      };
      
      if (info.routes.length === 0) {
        // File doesn't affect any routes
        if (!routeGraph.has('(unrouted)')) {
          routeGraph.set('(unrouted)', {
            path: '(unrouted)',
            files: new Map()
          });
        }
        routeGraph.get('(unrouted)')!.files.set(file, fileInfo);
      } else {
        // Add file to each route it affects
        for (const route of info.routes) {
          if (!routeGraph.has(route)) {
            routeGraph.set(route, {
              path: route,
              files: new Map()
            });
          }
          routeGraph.get(route)!.files.set(file, fileInfo);
        }
      }
    }
    
    // Print route impact graph
    printRouteGraph(routeGraph, files);
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

function printRouteGraph(routeGraph: Map<string, RouteNode>, analyzedFiles: string[]) {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    Route Impact Graph                      ║
╚═══════════════════════════════════════════════════════════╝
`);
  
  // Sort routes for consistent output
  const sortedRoutes = Array.from(routeGraph.keys()).sort((a, b) => {
    if (a === '(unrouted)') return 1;
    if (b === '(unrouted)') return -1;
    return a.localeCompare(b);
  });
  
  // Print each route and its affected files
  for (const routePath of sortedRoutes) {
    const route = routeGraph.get(routePath)!;
    
    if (routePath === '(unrouted)') {
      console.log(`\n❌ Files with no route impact:`);
    } else {
      console.log(`\n📍 Route: ${routePath}`);
    }
    
    // Group files by type
    const routeFiles = Array.from(route.files.entries())
      .filter(([file]) => analyzedFiles.includes(file));
    
    const byType = {
      route: routeFiles.filter(([_, info]) => info.type === 'route'),
      component: routeFiles.filter(([_, info]) => info.type === 'component'),
      style: routeFiles.filter(([_, info]) => info.type === 'style'),
      other: routeFiles.filter(([_, info]) => info.type === 'other')
    };
    
    // Print files by type
    for (const [type, files] of Object.entries(byType)) {
      if (files.length === 0) continue;
      
      const icon = {
        route: '🚦',
        component: '🧩',
        style: '🎨',
        other: '📄'
      }[type];
      
      console.log(`   ${icon} ${capitalize(type)}s:`);
      for (const [file, info] of files) {
        const marker = info.isRouteDefiner ? ' (defines routes)' : '';
        console.log(`      └─ ${file}${marker}`);
      }
    }
  }
  
  // Print summary
  printSummary(routeGraph, analyzedFiles);
}

function printSummary(routeGraph: Map<string, RouteNode>, analyzedFiles: string[]) {
  const routes = Array.from(routeGraph.keys()).filter(r => r !== '(unrouted)');
  const filesWithImpact = analyzedFiles.filter(file => 
    Array.from(routeGraph.values()).some(route => 
      route.path !== '(unrouted)' && route.files.has(file)
    )
  );
  
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                        Summary                             ║
╚═══════════════════════════════════════════════════════════╝

   📊 Files analyzed: ${analyzedFiles.length}
   🔗 Routes affected: ${routes.length}
   ✅ Files with route impact: ${filesWithImpact.length}
   ❌ Files with no route impact: ${analyzedFiles.length - filesWithImpact.length}
`);
  
  // Check for shared components
  const sharedFiles = analyzedFiles.filter(file => {
    let routeCount = 0;
    for (const route of routeGraph.values()) {
      if (route.path !== '(unrouted)' && route.files.has(file)) {
        routeCount++;
      }
    }
    return routeCount > 1;
  });
  
  if (sharedFiles.length > 0) {
    console.log(`   ⚠️  Shared components (affect multiple routes): ${sharedFiles.length}`);
    for (const file of sharedFiles) {
      const affectedRoutes = Array.from(routeGraph.values())
        .filter(route => route.path !== '(unrouted)' && route.files.has(file))
        .map(route => route.path);
      console.log(`      • ${file} → ${affectedRoutes.join(', ')}`);
    }
  }
}

function getFileType(filePath: string): FileInfo['type'] {
  const ext = path.extname(filePath);
  const lowerPath = filePath.toLowerCase();
  
  if (['.css', '.scss', '.sass', '.less'].includes(ext) || 
      filePath.includes('.module.')) {
    return 'style';
  }
  
  if (lowerPath.includes('/routes/') || lowerPath.includes('router')) {
    return 'route';
  }
  
  if (['.tsx', '.jsx'].includes(ext) && 
      (lowerPath.includes('/components/') || lowerPath.includes('/pages/'))) {
    return 'component';
  }
  
  return 'other';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: ts-node route-impact-graph.ts <codebase-path> <file1> [file2] [...]

Example:
  ts-node route-impact-graph.ts ../loop-frontend src/pages/Login.tsx src/components/Button.tsx

This will analyze how the specified files impact routes in the codebase.
`);
    process.exit(1);
  }
  
  const codebasePath = args[0];
  const files = args.slice(1);
  
  analyzeRouteImpact(codebasePath, files).catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

export { analyzeRouteImpact };