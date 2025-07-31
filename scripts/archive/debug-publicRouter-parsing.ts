#!/usr/bin/env ts-node

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';
import * as fs from 'fs';
import Parser from 'tree-sitter';
import TSX from 'tree-sitter-typescript/tsx';

async function debugPublicRouterParsing() {
  const codebasePath = path.join(__dirname, '../../loop-frontend');
  const analyzer = new TreeSitterRouteAnalyzer(codebasePath);
  
  console.log('🔍 Debugging PublicRouter.tsx parsing by TreeSitterRouteAnalyzer\n');
  
  // Use the private method via any
  const fileNode = await (analyzer as any).processFile('src/routes/PublicRouter.tsx');
  
  console.log('📄 File processing result:');
  console.log(`  Path: ${fileNode.path}`);
  console.log(`  Imports found: ${fileNode.imports.length}`);
  console.log(`  Routes found: ${fileNode.routes.length}`);
  console.log(`  Hash: ${fileNode.hash}`);
  
  console.log('\n📦 Imports:');
  fileNode.imports.forEach((imp: any, i: number) => {
    console.log(`  ${i + 1}. ${imp.source} (line ${imp.line})`);
  });
  
  console.log('\n🚦 Routes:');
  fileNode.routes.forEach((route: any, i: number) => {
    console.log(`  ${i + 1}. ${route.path} → ${route.component} (line ${route.line})`);
  });
  
  // Check the import graph
  await analyzer.initialize();
  const graph = (analyzer as any).importGraph;
  const publicRouterNode = graph.get('src/routes/PublicRouter.tsx');
  
  console.log('\n📊 Import graph node:');
  if (publicRouterNode) {
    console.log(`  File: ${publicRouterNode.file}`);
    console.log(`  Imports: ${Array.from(publicRouterNode.imports).join(', ')}`);
    console.log(`  Imported by: ${Array.from(publicRouterNode.importedBy).join(', ')}`);
    console.log(`  Is route file: ${publicRouterNode.isRouteFile}`);
  } else {
    console.log('  ❌ Not found in import graph!');
  }
}

debugPublicRouterParsing().catch(console.error);