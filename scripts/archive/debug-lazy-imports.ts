#!/usr/bin/env ts-node

import Parser from 'tree-sitter';
import TSX from 'tree-sitter-typescript/tsx';
import * as fs from 'fs';

async function debugLazyImports() {
  const parser = new Parser();
  parser.setLanguage(TSX);
  
  const testCode = `
import React, { lazy } from 'react'
const LoginV2 = lazy(() => import('src/pages/public/Login/LoginV2'))
`;

  console.log('🔍 Debugging lazy import parsing\n');
  
  const tree = parser.parse(testCode);
  
  // Find all import-related nodes
  console.log('📦 Import statements:');
  const importStatements = tree.rootNode.descendantsOfType('import_statement');
  importStatements.forEach((node, i) => {
    console.log(`\nImport ${i + 1}:`);
    console.log(`  Full text: ${testCode.slice(node.startIndex, node.endIndex)}`);
    const source = node.childForFieldName('source');
    if (source) {
      console.log(`  Source: ${testCode.slice(source.startIndex, source.endIndex)}`);
    }
  });
  
  // Find lazy import calls
  console.log('\n\n🦥 Lazy imports (dynamic imports):');
  const callExpressions = tree.rootNode.descendantsOfType('call_expression');
  
  for (const call of callExpressions) {
    const funcNode = call.childForFieldName('function');
    if (funcNode && testCode.slice(funcNode.startIndex, funcNode.endIndex) === 'import') {
      console.log('\nFound dynamic import:');
      console.log(`  Full expression: ${testCode.slice(call.startIndex, call.endIndex)}`);
      
      const args = call.childForFieldName('arguments');
      if (args) {
        // Get the string argument
        const stringNodes = args.descendantsOfType('string');
        if (stringNodes.length > 0) {
          const importPath = testCode.slice(stringNodes[0].startIndex + 1, stringNodes[0].endIndex - 1);
          console.log(`  Import path: ${importPath}`);
        }
      }
    }
  }
  
  // Find lazy() calls
  console.log('\n\n⚡ lazy() calls:');
  for (const call of callExpressions) {
    const funcNode = call.childForFieldName('function');
    if (funcNode && testCode.slice(funcNode.startIndex, funcNode.endIndex) === 'lazy') {
      console.log('\nFound lazy call:');
      console.log(`  Full expression: ${testCode.slice(call.startIndex, call.endIndex)}`);
      
      // Get the arrow function argument
      const args = call.childForFieldName('arguments');
      if (args) {
        const arrowFunctions = args.descendantsOfType('arrow_function');
        if (arrowFunctions.length > 0) {
          const arrowFunc = arrowFunctions[0];
          const body = arrowFunc.childForFieldName('body');
          if (body) {
            // Look for import calls in the body
            const importCalls = body.descendantsOfType('call_expression');
            for (const importCall of importCalls) {
              const importFunc = importCall.childForFieldName('function');
              if (importFunc && testCode.slice(importFunc.startIndex, importFunc.endIndex) === 'import') {
                const importArgs = importCall.childForFieldName('arguments');
                if (importArgs) {
                  const strings = importArgs.descendantsOfType('string');
                  if (strings.length > 0) {
                    const path = testCode.slice(strings[0].startIndex + 1, strings[0].endIndex - 1);
                    console.log(`  Lazy imports: ${path}`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

debugLazyImports().catch(console.error);