#!/usr/bin/env ts-node

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';

async function testSpecificFile() {
  console.log('🔍 Testing route detection for specific file\n');
  
  // Test with loop-frontend
  const projectPath = path.join(__dirname, '..', '..', 'loop-frontend');
  const testFile = 'src/pages/public/Login/LoginV2.tsx';
  
  console.log(`📁 Project: ${projectPath}`);
  console.log(`📄 Test file: ${testFile}\n`);
  
  const analyzer = new TreeSitterRouteAnalyzer(projectPath);
  
  // Initialize (will build or load cache)
  console.log('⏳ Initializing analyzer...');
  console.time('Initialization');
  await analyzer.initialize();
  console.timeEnd('Initialization');
  
  const metrics = analyzer.getMetrics();
  console.log('\n📊 Project metrics:', metrics);
  
  // Test route detection
  console.log('\n🎯 Detecting routes for Login page:');
  console.log('─'.repeat(50));
  
  console.time('Route detection');
  const routes = await analyzer.detectRoutes([testFile]);
  console.timeEnd('Route detection');
  
  const detectedRoutes = routes.get(testFile);
  if (detectedRoutes && detectedRoutes.length > 0) {
    console.log(`\n✅ SUCCESS: Found routes for ${testFile}`);
    console.log(`   Routes: ${JSON.stringify(detectedRoutes)}`);
  } else {
    console.log(`\n❌ No routes detected for ${testFile}`);
    console.log('   This could mean:');
    console.log('   1. The file exists but doesn\'t affect any routes');
    console.log('   2. The route is defined elsewhere and this component is not imported');
    console.log('   3. The import chain to route definitions is broken');
  }
  
  // Get detailed info
  console.log('\n📋 Getting detailed route information:');
  console.log('─'.repeat(50));
  
  const routeInfo = await analyzer.getRouteInfo([testFile]);
  const info = routeInfo.get(testFile);
  
  if (info) {
    console.log(`File: ${testFile}`);
    console.log(`  Routes: ${JSON.stringify(info.routes)}`);
    console.log(`  Is Route Definer: ${info.isRouteDefiner}`);
    console.log(`  Import Chain: ${JSON.stringify(info.importChain)}`);
  }
  
  // Let's trace the import chain manually to debug
  console.log('\n🔗 Tracing import chain:');
  console.log('─'.repeat(50));
  
  // Check who imports the Login page
  console.log('1. Checking what imports Login page...');
  
  // Try different possible paths
  const possiblePaths = [
    testFile,
    'src/pages/public/Login.tsx',
    'src/pages/public/Login/index.tsx',
    'src/pages/Login.tsx',
    'src/pages/Login/index.tsx'
  ];
  
  for (const tryPath of possiblePaths) {
    const tryRoutes = await analyzer.detectRoutes([tryPath]);
    const found = tryRoutes.get(tryPath);
    if (found && found.length > 0) {
      console.log(`   ✓ ${tryPath} → ${JSON.stringify(found)}`);
      
      // Get detailed info for this path
      const tryInfo = await analyzer.getRouteInfo([tryPath]);
      const details = tryInfo.get(tryPath);
      if (details) {
        console.log(`     Route definer: ${details.isRouteDefiner}`);
      }
    }
  }
  
  // Also check the public router
  console.log('\n2. Checking PublicRouter for route definitions...');
  const routerPaths = [
    'src/routes/PublicRouter/index.tsx',
    'src/routes/PublicRouter.tsx',
    'src/PublicRouter.tsx',
    'src/router/PublicRouter.tsx'
  ];
  
  for (const routerPath of routerPaths) {
    const routerInfo = await analyzer.getRouteInfo([routerPath]);
    const rInfo = routerInfo.get(routerPath);
    if (rInfo && rInfo.isRouteDefiner) {
      console.log(`   ✓ Found route definitions in: ${routerPath}`);
      console.log(`     Routes: ${JSON.stringify(rInfo.routes)}`);
    }
  }
  
  console.log('\n✨ Test completed!');
}

// Run the test
testSpecificFile().catch(console.error);