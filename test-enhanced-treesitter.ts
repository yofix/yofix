#!/usr/bin/env ts-node

import { TreeSitterRouteAnalyzer } from './src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';

async function testEnhancedTreeSitter() {
  const codebasePath = process.argv[2] || path.resolve(__dirname, '../loop-frontend');
  const changedFiles = process.argv.slice(3).length > 0 
    ? process.argv.slice(3)
    : ['src/pages/members/Testing/Test.tsx', 'src/pages/members/Leaderboard/index.tsx'];

  console.log('Enhanced TreeSitterRouteAnalyzer Test');
  console.log('====================================');
  console.log('Codebase:', codebasePath);
  console.log('Changed files:', changedFiles);
  console.log('');

  try {
    console.log('Initializing analyzer...');
    const start = Date.now();
    const analyzer = new TreeSitterRouteAnalyzer(codebasePath);
    await analyzer.initialize();
    const initTime = Date.now() - start;
    
    console.log(`✓ Initialized in ${initTime}ms`);
    console.log('');

    // Test each file
    for (const file of changedFiles) {
      console.log(`\nAnalyzing: ${file}`);
      console.log('-'.repeat(50));
      
      const startDetect = Date.now();
      const routesMap = await analyzer.detectRoutes([file]);
      const detectTime = Date.now() - startDetect;
      
      const routes = routesMap.get(file) || [];
      
      if (routes.length > 0) {
        console.log(`✓ Found ${routes.length} route(s) in ${detectTime}ms:`);
        routes.forEach(route => {
          console.log(`  • ${route}`);
        });
      } else {
        console.log(`✗ No routes found (${detectTime}ms)`);
      }
    }
    
    // Test specific cases
    console.log('\n\nValidation Tests:');
    console.log('=================');
    
    const testCases = [
      { file: 'src/pages/members/Testing/Test.tsx', expected: ['debugger'] },
      { file: 'src/pages/members/Leaderboard/index.tsx', expected: ['base/leaderboard', 'marketing/leaderboard'] }
    ];
    
    let allPassed = true;
    
    for (const test of testCases) {
      const routesMap = await analyzer.detectRoutes([test.file]);
      const routes = routesMap.get(test.file) || [];
      
      const passed = routes.length > 0 && test.expected.some(exp => 
        routes.some(route => route.includes(exp))
      );
      
      console.log(`${passed ? '✅' : '❌'} ${test.file}: ${routes.length > 0 ? routes.join(', ') : 'No routes found'}`);
      if (!passed) allPassed = false;
    }
    
    console.log(`\n${allPassed ? '✅ All tests passed!' : '❌ Some tests failed'}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testEnhancedTreeSitter();