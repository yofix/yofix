#!/usr/bin/env ts-node

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';
import * as fs from 'fs';
import Parser from 'tree-sitter';
import TSX from 'tree-sitter-typescript/tsx';

async function debugImportResolution() {
  const codebasePath = path.join(__dirname, '../../loop-frontend');
  const publicRouterPath = path.join(codebasePath, 'src/routes/PublicRouter.tsx');
  
  console.log('🔍 Debugging import resolution in PublicRouter.tsx\n');
  
  const content = fs.readFileSync(publicRouterPath, 'utf-8');
  
  const parser = new Parser();
  parser.setLanguage(TSX);
  const tree = parser.parse(content);
  
  // Extract all call expressions
  const callExpressions = tree.rootNode.descendantsOfType('call_expression');
  
  console.log('📦 Dynamic imports found:');
  let foundCount = 0;
  
  for (const call of callExpressions) {
    const funcNode = call.childForFieldName('function');
    if (funcNode && content.slice(funcNode.startIndex, funcNode.endIndex) === 'import') {
      const args = call.childForFieldName('arguments');
      if (args) {
        const stringNodes = args.descendantsOfType('string');
        if (stringNodes.length > 0) {
          const importPath = content.slice(stringNodes[0].startIndex + 1, stringNodes[0].endIndex - 1);
          foundCount++;
          console.log(`\n${foundCount}. Import path: "${importPath}"`);
          
          // Test resolution logic
          const fromFile = 'src/routes/PublicRouter.tsx';
          const fromDir = path.dirname(fromFile);
          
          let resolvedPath: string;
          if (importPath.startsWith('@/')) {
            resolvedPath = importPath.replace('@/', 'src/');
          } else if (importPath.startsWith('src/')) {
            resolvedPath = importPath;
          } else {
            resolvedPath = path.normalize(path.join(fromDir, importPath));
          }
          
          console.log(`   From file: ${fromFile}`);
          console.log(`   Resolved to: ${resolvedPath}`);
          
          // Try extensions
          const extensions = ['', '.tsx', '.ts', '.jsx', '.js'];
          let found = false;
          
          for (const ext of extensions) {
            const fullPath = resolvedPath + ext;
            const absPath = path.join(codebasePath, fullPath);
            if (fs.existsSync(absPath)) {
              console.log(`   ✅ Found at: ${fullPath}`);
              found = true;
              break;
            }
          }
          
          if (!found) {
            console.log(`   ❌ File not found!`);
          }
        }
      }
    }
  }
  
  console.log(`\n\nTotal dynamic imports: ${foundCount}`);
}

debugImportResolution().catch(console.error);