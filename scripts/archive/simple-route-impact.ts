#!/usr/bin/env ts-node

/**
 * Simple route impact analysis script
 * Usage: ts-node simple-route-impact.ts <codebase-path> <file1> [file2] [...]
 */

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';

// Disable debug logging
process.env.ACTIONS_STEP_DEBUG = 'false';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: ts-node simple-route-impact.ts <codebase-path> <file1> [file2] [...]');
    console.log('Example: ts-node simple-route-impact.ts ../loop-frontend src/pages/Login.tsx');
    process.exit(1);
  }
  
  const codebasePath = path.resolve(args[0]);
  const files = args.slice(1);
  
  console.log(`\n🔍 Analyzing route impact in: ${codebasePath}`);
  console.log(`📄 Files to analyze: ${files.join(', ')}\n`);
  
  try {
    // Initialize analyzer
    const analyzer = new TreeSitterRouteAnalyzer(codebasePath);
    await analyzer.initialize();
    
    // Get route information
    const routeInfo = await analyzer.getRouteInfo(files);
    
    // Build impact graph
    const impactGraph = new Map<string, Set<string>>();
    
    for (const [file, info] of routeInfo) {
      if (info.routes.length > 0) {
        for (const route of info.routes) {
          if (!impactGraph.has(route)) {
            impactGraph.set(route, new Set());
          }
          impactGraph.get(route)!.add(file);
        }
      }
    }
    
    // Print results
    console.log('📊 Route Impact Graph:');
    console.log('═'.repeat(50));
    
    if (impactGraph.size === 0) {
      console.log('\n❌ No routes affected by the changed files\n');
      
      // Show file analysis
      console.log('File Analysis:');
      for (const [file, info] of routeInfo) {
        console.log(`\n📄 ${file}`);
        console.log(`   Routes: ${info.routes.length === 0 ? 'none' : info.routes.join(', ')}`);
        console.log(`   Is Route File: ${info.isRouteDefiner ? 'yes' : 'no'}`);
      }
    } else {
      // Sort routes for consistent output
      const sortedRoutes = Array.from(impactGraph.keys()).sort();
      
      for (const route of sortedRoutes) {
        const affectedFiles = impactGraph.get(route)!;
        console.log(`\n🔗 Route: ${route}`);
        console.log('   Affected by:');
        for (const file of affectedFiles) {
          const info = routeInfo.get(file)!;
          const type = info.isRouteDefiner ? '📍 (route file)' : '🧩 (component)';
          console.log(`     ${type} ${file}`);
        }
      }
    }
    
    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('📈 Summary:');
    console.log(`   Files analyzed: ${files.length}`);
    console.log(`   Routes affected: ${impactGraph.size}`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();