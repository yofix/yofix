#!/usr/bin/env ts-node

import Parser from 'tree-sitter';
import TSX from 'tree-sitter-typescript/tsx';
import * as fs from 'fs';
import * as path from 'path';

async function debugParsing() {
  const filePath = path.join(__dirname, '../../loop-frontend/src/routes/PublicRouter.tsx');
  console.log('🔍 Debugging PublicRouter.tsx parsing\n');
  
  const content = fs.readFileSync(filePath, 'utf-8');
  console.log('File size:', content.length, 'bytes');
  console.log('First 200 chars:', content.substring(0, 200));
  
  const parser = new Parser();
  parser.setLanguage(TSX);
  
  console.log('\n📊 Parsing with Tree-sitter TSX...');
  const tree = parser.parse(content);
  
  console.log('Root node type:', tree.rootNode.type);
  console.log('Has errors:', tree.rootNode.hasError);
  
  // Check if useRoutes is found
  console.log('\n🔍 Looking for useRoutes call:');
  const calls = tree.rootNode.descendantsOfType('call_expression');
  console.log('Total call expressions:', calls.length);
  
  for (const call of calls) {
    const funcNode = call.childForFieldName('function');
    if (funcNode) {
      const funcName = content.slice(funcNode.startIndex, funcNode.endIndex);
      if (funcName === 'useRoutes') {
        console.log('✅ Found useRoutes at line', call.startPosition.row + 1);
        
        // Get the argument
        const args = call.childForFieldName('arguments');
        if (args) {
          console.log('   Arguments node type:', args.type);
          const firstArg = args.children[1]; // Skip opening paren
          if (firstArg) {
            console.log('   First argument type:', firstArg.type);
            
            // If it's an array, look for objects
            if (firstArg.type === 'array') {
              const objects = firstArg.descendantsOfType('object');
              console.log('   Found', objects.length, 'objects in array');
              
              // Check first few objects
              objects.slice(0, 3).forEach((obj, i) => {
                console.log(`\n   Object ${i + 1}:`);
                const props = obj.children.filter(child => child.type === 'property' || child.type === 'shorthand_property');
                props.forEach(prop => {
                  const key = prop.childForFieldName('key');
                  if (key) {
                    const keyName = content.slice(key.startIndex, key.endIndex);
                    console.log(`     - ${keyName}`);
                  }
                });
              });
            }
          }
        }
        break;
      }
    }
  }
  
  // Let's also try a different approach - look for route-like objects
  console.log('\n🔍 Looking for route objects with path property:');
  const objects = tree.rootNode.descendantsOfType('object');
  let routeCount = 0;
  
  for (const obj of objects) {
    const props = obj.children.filter(child => child.type === 'property' || child.type === 'shorthand_property');
    let hasPath = false;
    let pathValue = '';
    
    for (const prop of props) {
      if (prop.type === 'property') {
        const key = prop.childForFieldName('key');
        const value = prop.childForFieldName('value');
        
        if (key && value) {
          const keyName = content.slice(key.startIndex, key.endIndex).replace(/['"]/g, '');
          
          if (keyName === 'path') {
            hasPath = true;
            pathValue = content.slice(value.startIndex, value.endIndex);
          } else if (keyName === 'index' && content.slice(value.startIndex, value.endIndex) === 'true') {
            hasPath = true;
            pathValue = '(index route)';
          }
        }
      }
    }
    
    if (hasPath) {
      routeCount++;
      console.log(`\nRoute ${routeCount}: ${pathValue} at line ${obj.startPosition.row + 1}`);
    }
  }
  
  console.log(`\n✅ Total routes found: ${routeCount}`);
}

debugParsing().catch(console.error);