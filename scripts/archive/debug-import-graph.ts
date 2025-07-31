#!/usr/bin/env ts-node

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';

async function debugImportGraph() {
  const codebasePath = path.join(__dirname, '../../loop-frontend');
  const analyzer = new TreeSitterRouteAnalyzer(codebasePath);
  
  console.log('🔍 Debugging Import Graph\n');
  
  await analyzer.initialize();
  const metrics = analyzer.getMetrics();
  
  console.log(`📊 Metrics:
  - Total files: ${metrics.totalFiles}
  - Route files: ${metrics.routeFiles}
  - Import edges: ${metrics.importEdges}
  `);
  
  // Check specific files
  const filesToCheck = [
    'src/pages/public/Login/LoginV2.tsx',
    'src/routes/PublicRouter.tsx'
  ];
  
  const routeInfo = await analyzer.getRouteInfo(filesToCheck);
  
  for (const [file, info] of routeInfo) {
    console.log(`\n📄 ${file}:`);
    console.log(`  - Routes: ${info.routes.length > 0 ? info.routes.join(', ') : 'none'}`);
    console.log(`  - Is route definer: ${info.isRouteDefiner}`);
  }
  
  // Now let's trace the import path manually
  console.log('\n🔗 Tracing import path from LoginV2 to routes...');
  
  // Get the internal import graph
  const graph = (analyzer as any).importGraph;
  
  // Check if LoginV2 is imported by anything
  const loginV2Node = graph.get('src/pages/public/Login/LoginV2.tsx');
  if (loginV2Node) {
    console.log('\nLoginV2 is imported by:');
    for (const importer of loginV2Node.importedBy) {
      console.log(`  - ${importer}`);
    }
  } else {
    console.log('\n❌ LoginV2 not found in import graph!');
  }
  
  // Check PublicRouter imports
  const publicRouterNode = graph.get('src/routes/PublicRouter.tsx');
  if (publicRouterNode) {
    console.log('\nPublicRouter imports:');
    for (const imported of publicRouterNode.imports) {
      if (imported.includes('Login')) {
        console.log(`  - ${imported}`);
      }
    }
  }
}

debugImportGraph().catch(console.error);