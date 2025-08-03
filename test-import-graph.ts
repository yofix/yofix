#!/usr/bin/env ts-node

// Set up required environment variables
process.env.GITHUB_ACTIONS = 'true';
process.env.INPUT_GITHUB_TOKEN = 'dummy-token';

import { TreeSitterRouteAnalyzer } from './src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';
import * as fs from 'fs';

async function testImportGraph() {
  console.log('🔍 Testing Import Graph and Route Detection\n');
  
  // Use the loop-frontend directory
  const rootPath = path.join(__dirname, '../loop-frontend');
  
  if (!fs.existsSync(rootPath)) {
    console.error(`❌ Directory not found: ${rootPath}`);
    return;
  }
  
  console.log(`📁 Root path: ${rootPath}`);
  
  // Create analyzer
  const analyzer = new TreeSitterRouteAnalyzer(rootPath);
  
  try {
    // Initialize the analyzer (this builds the import graph)
    console.log('\n📊 Building import graph...');
    const startTime = Date.now();
    await analyzer.initialize(true); // Clear cache to ensure fresh analysis
    console.log(`✅ Import graph built in ${Date.now() - startTime}ms\n`);
    
    // Test files that should be in the import chain
    const testFiles = [
      'src/pages/members/Leaderboard/components/LeaderboardTable/index.tsx',
      'src/pages/members/Leaderboard/components/LeaderboardWrapper/index.tsx', 
      'src/pages/members/Leaderboard/LeaderboardComp.tsx',
      'src/pages/members/Leaderboard/index.tsx',
      'src/routes/PrivateRouter/basePrivateRouter.tsx'
    ];
    
    console.log('📋 Analyzing import chain:\n');
    
    // Get the import graph from the analyzer (using private property access for testing)
    const importGraph = (analyzer as any).importGraph;
    const fileCache = (analyzer as any).fileCache;
    
    // Check each file in the chain
    for (const file of testFiles) {
      console.log(`\n📄 File: ${file}`);
      
      const node = importGraph.get(file);
      const fileNode = fileCache.get(file);
      
      if (!node) {
        console.log('  ❌ Not found in import graph');
        continue;
      }
      
      console.log(`  ✅ Found in import graph`);
      console.log(`  📥 Imported by: ${node.importedBy.size} files`);
      if (node.importedBy.size > 0) {
        for (const importer of Array.from(node.importedBy).slice(0, 3)) {
          console.log(`     - ${importer}`);
        }
        if (node.importedBy.size > 3) {
          console.log(`     ... and ${node.importedBy.size - 3} more`);
        }
      }
      
      console.log(`  📤 Imports: ${node.imports.size} files`);
      if (node.imports.size > 0) {
        for (const imported of Array.from(node.imports).slice(0, 3)) {
          console.log(`     - ${imported}`);
        }
        if (node.imports.size > 3) {
          console.log(`     ... and ${node.imports.size - 3} more`);
        }
      }
      
      if (fileNode && fileNode.routes.length > 0) {
        console.log(`  🎯 Defines ${fileNode.routes.length} routes:`);
        for (const route of fileNode.routes) {
          console.log(`     - ${route.path} (component: ${route.component})`);
        }
      }
    }
    
    // Now test route detection for the LeaderboardTable component
    console.log('\n\n🔍 Testing route detection for LeaderboardTable:\n');
    
    const changedFile = 'src/pages/members/Leaderboard/components/LeaderboardTable/index.tsx';
    const routeInfo = await analyzer.getRouteInfo([changedFile]);
    
    const info = routeInfo.get(changedFile);
    if (info) {
      console.log(`Routes affected: ${info.routes.length}`);
      if (info.routes.length > 0) {
        console.log('Affected routes:');
        for (const route of info.routes) {
          console.log(`  - ${route}`);
        }
      } else {
        console.log('❌ No routes found!');
        
        // Let's trace the import chain manually
        console.log('\n🔗 Tracing import chain manually:');
        
        const visited = new Set<string>();
        const queue = [{ file: changedFile, depth: 0, path: [changedFile] }];
        let found = false;
        
        while (queue.length > 0 && !found) {
          const { file, depth, path: currentPath } = queue.shift()!;
          
          if (visited.has(file) || depth > 10) continue;
          visited.add(file);
          
          const node = importGraph.get(file);
          if (!node) continue;
          
          // Check if this file has routes
          const fileNode = fileCache.get(file);
          if (fileNode && fileNode.routes.length > 0) {
            console.log(`\n✅ Found route file at depth ${depth}: ${file}`);
            console.log('Import chain:');
            currentPath.forEach((f, i) => {
              console.log(`  ${'  '.repeat(i)}${i + 1}. ${f}`);
            });
            console.log(`\nRoutes in ${file}:`);
            for (const route of fileNode.routes) {
              console.log(`  - ${route.path}`);
            }
            found = true;
            break;
          }
          
          // Add importers to queue
          for (const importer of node.importedBy) {
            if (!visited.has(importer)) {
              queue.push({ 
                file: importer, 
                depth: depth + 1,
                path: [...currentPath, importer]
              });
            }
          }
        }
        
        if (!found) {
          console.log('\n❌ Could not find any route file in the import chain!');
          console.log(`Visited ${visited.size} files`);
        }
      }
    }
    
    // Check specific imports
    console.log('\n\n🔍 Checking specific imports:');
    
    // Check if Leaderboard is imported by basePrivateRouter
    const baseRouterNode = importGraph.get('src/routes/PrivateRouter/basePrivateRouter.tsx');
    if (baseRouterNode) {
      console.log('\nImports of basePrivateRouter.tsx:');
      const leaderboardImport = Array.from(baseRouterNode.imports).find(imp => 
        (imp as string).includes('Leaderboard')
      );
      if (leaderboardImport) {
        console.log(`  ✅ Found Leaderboard import: ${leaderboardImport}`);
      } else {
        console.log('  ❌ No Leaderboard import found');
        console.log('  All imports:');
        for (const imp of Array.from(baseRouterNode.imports).slice(0, 10)) {
          console.log(`    - ${imp}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the test
testImportGraph().catch(console.error);