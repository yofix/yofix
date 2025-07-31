#!/usr/bin/env ts-node

/**
 * Improved Route Impact Analysis
 * 
 * Shows which routes are affected by file changes, with better accuracy
 * for components that are only used in specific routes.
 * 
 * Usage: ts-node route-impact-improved.ts <codebase-path> <file1> [file2] [...]
 */

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';
import * as fs from 'fs';
import { StorageFactory } from '../src/providers/storage/StorageFactory';

// Disable debug logging
process.env.ACTIONS_STEP_DEBUG = 'false';

async function analyzeImprovedRouteImpact(codebasePath: string, files: string[]) {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║              Improved Route Impact Analysis                ║
╚═══════════════════════════════════════════════════════════╝
`);
  
  console.log(`📁 Codebase: ${codebasePath}`);
  
  const absolutePath = path.resolve(codebasePath);
  
  // Deduplicate and validate files
  const uniqueFiles = [...new Set(files)];
  const validFiles = uniqueFiles.filter(file => {
    // Skip if the file is the same as the codebase path
    if (file === codebasePath || file === '../' + path.basename(codebasePath)) {
      console.log(`⚠️  Skipping invalid file: ${file} (this is the codebase directory)`);
      return false;
    }
    return true;
  });
  
  console.log(`📄 Analyzing ${validFiles.length} file(s)\n`);
  
  // Normalize file paths to match what's in the import graph
  const normalizedFiles = validFiles.map(file => normalizeFilePath(file, absolutePath));
  
  // Initialize analyzer with storage provider if available
  console.log('⏳ Initializing route analyzer...');
  let storageProvider = null;
  
  // Try to create storage provider from environment
  try {
    if (process.env.FIREBASE_CREDENTIALS || process.env.AWS_ACCESS_KEY_ID) {
      storageProvider = await StorageFactory.createFromInputs();
    }
  } catch (error) {
    console.log('💡 No storage provider configured, using local cache');
  }
  
  const analyzer = new TreeSitterRouteAnalyzer(absolutePath, storageProvider);
  await analyzer.initialize();
  // Don't print extra checkmark - analyzer.initialize() already logs success
  
  // Get basic route info
  const routeInfo = await analyzer.getRouteInfo(normalizedFiles);
  
  // For each file, find routes that serve it using the new core method
  const routesServing = new Map<string, any[]>();
  
  for (let i = 0; i < validFiles.length; i++) {
    const originalFile = validFiles[i];
    const normalizedFile = normalizedFiles[i];
    
    // Use the new core method from TreeSitterRouteAnalyzer
    const servingRoutes = await analyzer.findRoutesServingComponent(normalizedFile);
    routesServing.set(originalFile, servingRoutes);
  }
  
  // Print improved results
  printImprovedRouteGraph(routeInfo, routesServing);
}

// Normalize file path to match what's in the import graph
function normalizeFilePath(filePath: string, rootPath: string): string {
  // Try to find the actual file with case-insensitive search
  try {
    const searchPath = path.join(rootPath, filePath);
    const dir = path.dirname(searchPath);
    const basename = path.basename(searchPath);
    
    if (fs.existsSync(searchPath)) {
      return filePath;
    }
    
    // Try to find the file with different cases
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      const match = files.find(f => f.toLowerCase() === basename.toLowerCase());
      if (match) {
        const normalizedPath = path.join(path.dirname(filePath), match);
        console.log(`📝 Normalized path: ${filePath} → ${normalizedPath}`);
        return normalizedPath.replace(/\\/g, '/');
      }
    }
    
    // Try common variations
    const variations = [
      filePath,
      filePath.toLowerCase(),
      // Convert first letter to uppercase
      filePath.replace(/\/([a-z])/g, (_, letter) => '/' + letter.toUpperCase()),
      // PascalCase for file name
      filePath.replace(/\/([a-z])([^/]*)$/g, (_, first, rest) => '/' + first.toUpperCase() + rest)
    ];
    
    for (const variant of variations) {
      const variantPath = path.join(rootPath, variant);
      if (fs.existsSync(variantPath)) {
        console.log(`📝 Found variant: ${filePath} → ${variant}`);
        return variant;
      }
    }
  } catch (error) {
    console.warn(`⚠️  Could not normalize path: ${filePath}`);
  }
  
  return filePath;
}

// All core logic has been moved to TreeSitterRouteAnalyzer

function printImprovedRouteGraph(
  routeInfo: Map<string, any>,
  routesServing: Map<string, any[]>
) {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                  Route Impact Analysis                     ║
╚═══════════════════════════════════════════════════════════╝
`);
  
  for (const [file, info] of routeInfo) {
    console.log(`\n📄 ${file}:`);
    
    const servingRoutes = routesServing.get(file) || [];
    
    // Show routes that serve this component
    if (servingRoutes.length > 0) {
      console.log(`  🎯 Routes serving this component:`);
      
      // Group by route file
      const byRouteFile = new Map<string, any[]>();
      for (const route of servingRoutes) {
        if (!byRouteFile.has(route.routeFile)) {
          byRouteFile.set(route.routeFile, []);
        }
        byRouteFile.get(route.routeFile)!.push(route);
      }
      
      for (const [routeFile, routes] of byRouteFile) {
        console.log(`\n  📂 In ${routeFile}:`);
        for (const route of routes) {
          console.log(`    └─ ${route.routePath} (serves this component)`);
        }
      }
    }
    
    // Use the route file type classification from core
    if (info?.routeFileType === 'primary' && servingRoutes.length === 0) {
      // This is a primary route configuration file
      console.log(`  🚦 This is a route definition file`);
      console.log(`  📍 Defines ${info.routes.length} routes: ${info.routes.join(', ')}`);
    } else if (info?.routeFileType === 'test') {
      // This is a test file with route objects - skip showing them
      // Only show if it's being served by routes (which would be unusual)
      if (servingRoutes.length === 0) {
        // Don't show route objects in test files
      }
    } else if (info?.routeFileType === 'component-with-routes' && servingRoutes.length > 0) {
      // Component file that contains route objects and is served by routes
      // Skip showing the route objects to avoid confusion
    } else if (info.routes.length > 0 && !servingRoutes.length) {
      console.log(`  ⚠️  Broad impact analysis (all routes in files that import this):`);
      console.log(`  📍 May affect ${info.routes.length} routes`);
      console.log(`     Note: This component might only be used in some of these routes`);
    } else if (servingRoutes.length === 0) {
      console.log(`  ❌ No route impact detected`);
    }
  }
  
  // Summary
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                        Summary                             ║
╚═══════════════════════════════════════════════════════════╝
`);
  
  let totalServingRoutes = 0;
  let totalBroadImpacts = 0;
  
  for (const [file, routes] of routesServing) {
    totalServingRoutes += routes.length;
  }
  
  for (const [file, info] of routeInfo) {
    if (info.routes.length > 0 && !info.isRouteDefiner) {
      totalBroadImpacts += info.routes.length;
    }
  }
  
  console.log(`   📊 Files analyzed: ${routeInfo.size}`);
  console.log(`   🎯 Routes serving components: ${totalServingRoutes}`);
  if (totalBroadImpacts > 0) {
    console.log(`   ⚠️  Broad route impacts: ${totalBroadImpacts} (may be overestimated)`);
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: ts-node route-impact-improved.ts <codebase-path> <file1> [file2] [...]

Example:
  ts-node route-impact-improved.ts ../loop-frontend src/pages/members/Testing/Test.tsx

This provides more accurate route impact analysis by identifying which
specific routes use each component.
`);
    process.exit(1);
  }
  
  const codebasePath = args[0];
  const files = args.slice(1);
  
  analyzeImprovedRouteImpact(codebasePath, files).catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}