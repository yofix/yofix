#!/usr/bin/env ts-node

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';

async function debugIconImports() {
  const codebasePath = path.join(__dirname, '../../loop-frontend');
  const analyzer = new TreeSitterRouteAnalyzer(codebasePath);
  
  console.log('🔍 Debugging Icon component import chain\n');
  
  await analyzer.initialize();
  
  // Get the internal import graph
  const graph = (analyzer as any).importGraph;
  
  // Check Icon component
  const iconPath = 'src/components/Icon/Icon.component.tsx';
  const iconNode = graph.get(iconPath);
  
  if (iconNode) {
    console.log(`📄 ${iconPath}:`);
    console.log(`  Imported by: ${Array.from(iconNode.importedBy).length} files`);
    
    // Show first few importers
    const importers = Array.from(iconNode.importedBy).slice(0, 5);
    importers.forEach(imp => {
      console.log(`    - ${imp}`);
    });
    
    if (iconNode.importedBy.size > 5) {
      console.log(`    ... and ${iconNode.importedBy.size - 5} more`);
    }
  } else {
    console.log(`❌ ${iconPath} not found in import graph`);
  }
  
  // Check if there's an index file
  const indexPath = 'src/components/index.tsx';
  const indexNode = graph.get(indexPath);
  
  if (indexNode) {
    console.log(`\n📄 ${indexPath}:`);
    console.log(`  Imported by: ${Array.from(indexNode.importedBy).length} files`);
    console.log(`  Does it include LoginV2? ${indexNode.importedBy.has('src/pages/public/Login/LoginV2.tsx')}`);
  }
  
  // Check LoginV2 imports
  const loginV2Node = graph.get('src/pages/public/Login/LoginV2.tsx');
  if (loginV2Node) {
    console.log('\n📄 LoginV2 imports:');
    Array.from(loginV2Node.imports).forEach(imp => {
      console.log(`  - ${imp}`);
    });
  }
  
  // Test route detection for Icon
  console.log('\n🚦 Route detection for Icon:');
  const iconRoutes = await (analyzer as any).detectRoutesForFile(iconPath);
  console.log(`  Routes: ${iconRoutes.length > 0 ? iconRoutes.join(', ') : 'none'}`);
  
  // Debug the BFS traversal
  console.log('\n🔄 BFS Traversal from Icon:');
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = [{ file: iconPath, depth: 0 }];
  let foundRoutes = false;
  
  while (queue.length > 0 && !foundRoutes) {
    const { file, depth } = queue.shift()!;
    
    if (visited.has(file)) continue;
    visited.add(file);
    
    const node = graph.get(file);
    if (!node) continue;
    
    if (node.isRouteFile) {
      console.log(`  ✅ Found route file at depth ${depth}: ${file}`);
      foundRoutes = true;
    }
    
    // Add importers to queue
    for (const importer of node.importedBy) {
      if (!visited.has(importer)) {
        queue.push({ file: importer, depth: depth + 1 });
      }
    }
    
    if (depth <= 2 && node.importedBy.size > 0) {
      console.log(`  Depth ${depth}: ${file} → imported by ${node.importedBy.size} files`);
    }
  }
}

debugIconImports().catch(console.error);