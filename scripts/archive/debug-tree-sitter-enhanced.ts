#!/usr/bin/env ts-node

import Parser from 'tree-sitter';
import TSX from 'tree-sitter-typescript/tsx';
import * as fs from 'fs';
import * as path from 'path';

async function debugEnhancedParsing() {
  const filePath = path.join(__dirname, '../../loop-frontend/src/routes/PublicRouter.tsx');
  console.log('🔍 Enhanced Tree-sitter Debugging\n');
  
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const parser = new Parser();
  parser.setLanguage(TSX);
  
  const tree = parser.parse(content);
  
  console.log('🎯 Searching for route objects...\n');
  
  // Find useRoutes call
  const calls = tree.rootNode.descendantsOfType('call_expression');
  
  for (const call of calls) {
    const funcNode = call.childForFieldName('function');
    if (funcNode && content.slice(funcNode.startIndex, funcNode.endIndex) === 'useRoutes') {
      console.log('✅ Found useRoutes call');
      
      const args = call.childForFieldName('arguments');
      if (args) {
        const array = args.children.find(child => child.type === 'array');
        if (array) {
          console.log(`\n📦 Array contains ${array.children.length} children`);
          
          // Look at the first route object in detail
          const firstObject = array.children.find(child => child.type === 'object');
          if (firstObject) {
            console.log('\n🔍 Analyzing first route object:');
            console.log(`  Type: ${firstObject.type}`);
            console.log(`  Children count: ${firstObject.children.length}`);
            console.log(`  Content: ${content.slice(firstObject.startIndex, Math.min(firstObject.startIndex + 100, firstObject.endIndex))}...`);
            
            // List all child types
            console.log('\n  Child node types:');
            firstObject.children.forEach((child, i) => {
              console.log(`    [${i}] ${child.type}`);
              if (child.type === 'pair') {
                const key = child.childForFieldName('key');
                const value = child.childForFieldName('value');
                if (key) {
                  console.log(`        key: "${content.slice(key.startIndex, key.endIndex)}"`);
                  if (value) {
                    console.log(`        value type: ${value.type}`);
                    if (value.type === 'string') {
                      console.log(`        value: "${content.slice(value.startIndex, value.endIndex)}"`);
                    }
                  }
                }
              }
            });
            
            // Try to extract pairs
            console.log('\n📝 Extracting route properties using pair nodes:');
            const pairs = firstObject.descendantsOfType('pair');
            console.log(`  Found ${pairs.length} pair nodes`);
            
            pairs.forEach(pair => {
              const key = pair.childForFieldName('key');
              const value = pair.childForFieldName('value');
              if (key && value) {
                const keyName = content.slice(key.startIndex, key.endIndex).replace(/['"]/g, '');
                console.log(`\n  Property: ${keyName}`);
                console.log(`    Value type: ${value.type}`);
                if (keyName === 'path' || keyName === 'element') {
                  console.log(`    Value: ${content.slice(value.startIndex, Math.min(value.startIndex + 50, value.endIndex))}`);
                }
              }
            });
          }
        }
      }
      break;
    }
  }
  
  // Test our route extraction on a simple object
  console.log('\n\n🧪 Testing route extraction on sample code:');
  const testCode = `
const routes = [
  { path: '/', element: <Home /> },
  { path: '/about', element: <About /> },
  { index: true, element: <Index /> }
];`;
  
  const testTree = parser.parse(testCode);
  const testObjects = testTree.rootNode.descendantsOfType('object');
  
  console.log(`Found ${testObjects.length} objects in test code`);
  
  testObjects.forEach((obj, i) => {
    console.log(`\nObject ${i + 1}:`);
    const pairs = obj.descendantsOfType('pair');
    console.log(`  Pairs: ${pairs.length}`);
    
    pairs.forEach(pair => {
      const key = pair.childForFieldName('key');
      const value = pair.childForFieldName('value');
      if (key && value) {
        const keyName = testCode.slice(key.startIndex, key.endIndex);
        console.log(`  ${keyName}: ${testCode.slice(value.startIndex, value.endIndex)}`);
      }
    });
  });
}

debugEnhancedParsing().catch(console.error);