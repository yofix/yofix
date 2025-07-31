#!/usr/bin/env ts-node

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';

async function testTreeSitter() {
  console.log('🧪 Testing Tree-sitter Route Analyzer...\n');
  
  // Test with loop-frontend
  const testProjectPath = path.join(__dirname, '..', '..', 'loop-frontend');
  console.log(`📁 Test project: ${testProjectPath}\n`);
  
  // Test individual analyzer
  console.log('1️⃣ Testing TreeSitterRouteAnalyzer directly:');
  console.log('─'.repeat(50));
  
  const tsAnalyzer = new TreeSitterRouteAnalyzer(testProjectPath);
  
  console.time('Initialization');
  await tsAnalyzer.initialize();
  console.timeEnd('Initialization');
  
  const metrics = tsAnalyzer.getMetrics();
  console.log('\n📊 Metrics:', metrics);
  
  // Test route detection
  const testFiles = [
    'src/pages/members/Testing/Test.tsx',
    'src/forms/LoginForm.tsx',
    'src/components/Button.tsx'
  ];
  
  console.log('\n🔍 Testing route detection:');
  console.log('─'.repeat(50));
  
  for (const file of testFiles) {
    console.time(`Detect routes for ${file}`);
    const routes = await tsAnalyzer.detectRoutes([file]);
    console.timeEnd(`Detect routes for ${file}`);
    
    const fileRoutes = routes.get(file);
    if (fileRoutes && fileRoutes.length > 0) {
      console.log(`✅ ${file} → ${JSON.stringify(fileRoutes)}`);
    } else {
      console.log(`❌ ${file} → No routes detected`);
    }
  }
  
  // Test route info with metadata
  console.log('\n\n2️⃣ Testing Route Info with Metadata:');
  console.log('─'.repeat(50));
  
  const routeInfo = await tsAnalyzer.getRouteInfo(testFiles);
  
  for (const [file, info] of routeInfo) {
    console.log(`\n${file}:`);
    console.log(`  Routes: ${JSON.stringify(info.routes)}`);
    console.log(`  Is Route Definer: ${info.isRouteDefiner}`);
  }
  
  // Performance test
  console.log('\n\n3️⃣ Performance Test:');
  console.log('─'.repeat(50));
  
  // Measure Tree-sitter performance on larger set
  const allTestFiles = [
    'src/forms/LoginForm.tsx',
    'src/components/Button.tsx',
    'src/pages/members/Testing/Test.tsx',
    'src/routes/PrivateRouter/index.tsx',
    'src/routes/PublicRouter/index.tsx'
  ];
  
  const tsStart = Date.now();
  await tsAnalyzer.detectRoutes(allTestFiles);
  const tsDuration = Date.now() - tsStart;
  
  console.log(`⚡ Tree-sitter analyzed ${allTestFiles.length} files in: ${tsDuration}ms`);
  console.log(`📊 Average: ${(tsDuration / allTestFiles.length).toFixed(2)}ms per file`);
  
  // Test cache persistence
  console.log('\n\n4️⃣ Testing Cache Persistence:');
  console.log('─'.repeat(50));
  
  // Create new instance (should load from cache)
  const tsAnalyzer2 = new TreeSitterRouteAnalyzer(testProjectPath);
  
  console.time('Load from cache');
  await tsAnalyzer2.initialize();
  console.timeEnd('Load from cache');
  
  console.log('\n✅ All tests completed!');
}

// Run tests
testTreeSitter().catch(console.error);