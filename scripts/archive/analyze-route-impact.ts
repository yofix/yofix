#!/usr/bin/env ts-node

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';
import * as fs from 'fs';

interface RouteImpactResult {
  file: string;
  routes: string[];
  isRouteDefiner: boolean;
  type: 'route' | 'component' | 'style' | 'unknown';
}

/**
 * Analyze route impact for given files in a codebase
 * @param codebasePath - Path to the codebase root
 * @param files - Array of file paths relative to codebase root
 */
async function analyzeRouteImpact(codebasePath: string, files: string[]): Promise<void> {
  console.log('🚀 Route Impact Analysis\n');
  console.log(`📁 Codebase: ${codebasePath}`);
  console.log(`📄 Files to analyze: ${files.length}\n`);
  
  // Resolve absolute path
  const absolutePath = path.resolve(codebasePath);
  
  // Verify codebase exists
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Error: Codebase path does not exist: ${absolutePath}`);
    process.exit(1);
  }
  
  // Initialize analyzer
  const analyzer = new TreeSitterRouteAnalyzer(absolutePath);
  
  console.log('⏳ Initializing route analyzer...');
  const initStart = Date.now();
  await analyzer.initialize();
  const initDuration = Date.now() - initStart;
  
  const metrics = analyzer.getMetrics();
  console.log(`✅ Initialized in ${initDuration}ms`);
  console.log(`📊 Codebase metrics:`, metrics);
  console.log();
  
  // Analyze each file
  console.log('🔍 Analyzing route impact for changed files:');
  console.log('═'.repeat(60));
  
  const results: RouteImpactResult[] = [];
  const routeInfo = await analyzer.getRouteInfo(files);
  
  // Categorize files and collect results
  for (const file of files) {
    const info = routeInfo.get(file);
    if (info) {
      const type = categorizeFile(file, info.isRouteDefiner);
      results.push({
        file,
        routes: info.routes,
        isRouteDefiner: info.isRouteDefiner,
        type
      });
    } else {
      results.push({
        file,
        routes: [],
        isRouteDefiner: false,
        type: 'unknown'
      });
    }
  }
  
  // Group results by route
  const routeMap = new Map<string, RouteImpactResult[]>();
  
  for (const result of results) {
    if (result.routes.length === 0) {
      // Files with no route impact
      if (!routeMap.has('(no routes)')) {
        routeMap.set('(no routes)', []);
      }
      routeMap.get('(no routes)')!.push(result);
    } else {
      // Group by each route
      for (const route of result.routes) {
        if (!routeMap.has(route)) {
          routeMap.set(route, []);
        }
        routeMap.get(route)!.push(result);
      }
    }
  }
  
  // Print route impact tree
  console.log('\n📊 Route Impact Tree:');
  console.log('─'.repeat(60));
  
  // Sort routes for consistent output
  const sortedRoutes = Array.from(routeMap.keys()).sort();
  
  for (const route of sortedRoutes) {
    const files = routeMap.get(route)!;
    
    if (route === '(no routes)') {
      console.log(`\n❌ Files with no route impact:`);
    } else {
      console.log(`\n🔗 Route: ${route}`);
    }
    
    // Group files by type
    const filesByType = {
      route: files.filter(f => f.type === 'route'),
      component: files.filter(f => f.type === 'component'),
      style: files.filter(f => f.type === 'style'),
      unknown: files.filter(f => f.type === 'unknown')
    };
    
    // Print files by type
    if (filesByType.route.length > 0) {
      console.log('  📍 Route definitions:');
      filesByType.route.forEach(f => {
        console.log(`     └─ ${f.file}`);
      });
    }
    
    if (filesByType.component.length > 0) {
      console.log('  🧩 Components:');
      filesByType.component.forEach(f => {
        console.log(`     └─ ${f.file}`);
      });
    }
    
    if (filesByType.style.length > 0) {
      console.log('  🎨 Styles:');
      filesByType.style.forEach(f => {
        console.log(`     └─ ${f.file}`);
      });
    }
    
    if (filesByType.unknown.length > 0) {
      console.log('  ❓ Other files:');
      filesByType.unknown.forEach(f => {
        console.log(`     └─ ${f.file}`);
      });
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📈 Summary:');
  console.log(`   Total files analyzed: ${files.length}`);
  console.log(`   Routes affected: ${sortedRoutes.filter(r => r !== '(no routes)').length}`);
  console.log(`   Files with route impact: ${results.filter(r => r.routes.length > 0).length}`);
  console.log(`   Files with no route impact: ${results.filter(r => r.routes.length === 0).length}`);
  
  // Shared components detection
  const sharedComponents = results.filter(r => 
    r.type === 'component' && r.routes.length > 1
  );
  
  if (sharedComponents.length > 0) {
    console.log(`\n⚠️  Shared components (affect multiple routes):`);
    sharedComponents.forEach(comp => {
      console.log(`   ${comp.file} → ${comp.routes.join(', ')}`);
    });
  }
}

/**
 * Categorize file type based on path and characteristics
 */
function categorizeFile(filePath: string, isRouteDefiner: boolean): RouteImpactResult['type'] {
  const ext = path.extname(filePath);
  const lowerPath = filePath.toLowerCase();
  
  // Route files
  if (isRouteDefiner || lowerPath.includes('/routes/') || lowerPath.includes('router')) {
    return 'route';
  }
  
  // Style files
  if (['.css', '.scss', '.sass', '.less'].includes(ext) || 
      filePath.includes('.module.')) {
    return 'style';
  }
  
  // Component files
  if (['.tsx', '.jsx'].includes(ext) && 
      (lowerPath.includes('/components/') || lowerPath.includes('/pages/'))) {
    return 'component';
  }
  
  return 'unknown';
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: ts-node analyze-route-impact.ts <codebase-path> <file1> [file2] [...]');
    console.log('\nExample:');
    console.log('  ts-node analyze-route-impact.ts ../loop-frontend src/pages/Login.tsx src/components/Button.tsx');
    process.exit(1);
  }
  
  const codebasePath = args[0];
  const files = args.slice(1);
  
  analyzeRouteImpact(codebasePath, files).catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
}

export { analyzeRouteImpact };