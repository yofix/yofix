#!/usr/bin/env ts-node

import Parser from 'tree-sitter';
import TSX from 'tree-sitter-typescript/tsx';
import * as fs from 'fs';
import * as path from 'path';

async function testImportExtraction() {
  const filePath = path.join(__dirname, '../../loop-frontend/src/routes/PublicRouter.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const parser = new Parser();
  parser.setLanguage(TSX);
  const tree = parser.parse(content);
  
  console.log('🔍 Testing import extraction logic\n');
  
  const imports: any[] = [];
  
  // 1. Regular imports
  console.log('📦 Regular imports:');
  const importStatements = tree.rootNode.descendantsOfType('import_statement');
  
  for (const node of importStatements) {
    const sourceNode = node.childForFieldName('source');
    if (sourceNode) {
      const source = content.slice(sourceNode.startIndex + 1, sourceNode.endIndex - 1);
      console.log(`  - ${source}`);
      imports.push({ type: 'regular', source, line: sourceNode.startPosition.row + 1 });
    }
  }
  
  // 2. Dynamic imports
  console.log('\n🦥 Dynamic imports:');
  const callExpressions = tree.rootNode.descendantsOfType('call_expression');
  
  for (const call of callExpressions) {
    const funcNode = call.childForFieldName('function');
    if (funcNode && content.slice(funcNode.startIndex, funcNode.endIndex) === 'import') {
      const args = call.childForFieldName('arguments');
      if (args) {
        const stringNodes = args.descendantsOfType('string');
        if (stringNodes.length > 0) {
          const importPath = content.slice(stringNodes[0].startIndex + 1, stringNodes[0].endIndex - 1);
          console.log(`  - ${importPath} (line ${call.startPosition.row + 1})`);
          imports.push({ type: 'dynamic', source: importPath, line: call.startPosition.row + 1 });
        }
      }
    }
  }
  
  console.log(`\n📊 Total imports found: ${imports.length}`);
  console.log('  Regular: ' + imports.filter(i => i.type === 'regular').length);
  console.log('  Dynamic: ' + imports.filter(i => i.type === 'dynamic').length);
  
  // Test the actual method logic used in TreeSitterRouteAnalyzer
  console.log('\n🧪 Testing exact TreeSitterRouteAnalyzer logic:');
  
  const testImports: any[] = [];
  
  // Copy of the exact logic
  const importStatements2 = tree.rootNode.descendantsOfType('import_statement');
  
  for (const node of importStatements2) {
    const sourceNode = node.childForFieldName('source');
    if (sourceNode) {
      const source = content.slice(sourceNode.startIndex + 1, sourceNode.endIndex - 1);
      testImports.push({ source });
    }
  }
  
  const callExpressions2 = tree.rootNode.descendantsOfType('call_expression');
  
  for (const call of callExpressions2) {
    const funcNode = call.childForFieldName('function');
    if (funcNode && content.slice(funcNode.startIndex, funcNode.endIndex) === 'import') {
      const args = call.childForFieldName('arguments');
      if (args) {
        const stringNodes = args.descendantsOfType('string');
        if (stringNodes.length > 0) {
          const importPath = content.slice(stringNodes[0].startIndex + 1, stringNodes[0].endIndex - 1);
          testImports.push({ source: importPath });
        }
      }
    }
  }
  
  console.log(`Found ${testImports.length} imports using exact logic`);
  testImports.forEach((imp, i) => {
    console.log(`  ${i + 1}. ${imp.source}`);
  });
}

testImportExtraction().catch(console.error);