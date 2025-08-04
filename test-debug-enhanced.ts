import { TreeSitterRouteAnalyzer } from './src/core/analysis/TreeSitterRouteAnalyzer';

console.log('Debug Enhanced Graph');
console.log('===================');

const codebase = '/Users/shekhar/2024/lp/loop-fs/loop-frontend';

async function debug() {
  const analyzer = new TreeSitterRouteAnalyzer(codebase);
  
  console.log('\nInitializing with force rebuild...');
  await analyzer.initialize(true);
  
  // Access private properties for debugging
  const enhancedGraph = (analyzer as any).enhancedImportGraph as Map<string, any>;
  const fileCache = (analyzer as any).fileCache as Map<string, any>;
  
  console.log(`\nEnhanced graph size: ${enhancedGraph.size}`);
  console.log(`File cache size: ${fileCache.size}`);
  
  // Check specific files
  const testFile = 'src/pages/members/Testing/Test.tsx';
  const routeFile = 'src/routes/PrivateRouter/index.tsx';
  
  console.log(`\nChecking ${testFile}:`);
  const testNode = enhancedGraph.get(testFile);
  if (testNode) {
    console.log('- Found in enhanced graph');
    console.log(`- Imported by: ${testNode.importedBy.size} files`);
    for (const [file, aliases] of testNode.importedBy) {
      console.log(`  - ${file}: ${Array.from(aliases).map((a: any) => `${a.name} as ${a.localName || a.name}`).join(', ')}`);
    }
  } else {
    console.log('- NOT found in enhanced graph');
  }
  
  console.log(`\nChecking ${routeFile}:`);
  const routeNode = enhancedGraph.get(routeFile);
  if (routeNode) {
    console.log('- Found in enhanced graph');
    console.log(`- Is route file: ${routeNode.flags.isRouteFile}`);
    console.log(`- Imports: ${routeNode.imports.size} files`);
    
    // Check if it imports Test.tsx
    for (const [path, details] of routeNode.imports) {
      if (path.includes('Testing/Test')) {
        console.log(`\nFound import of Test.tsx:`);
        console.log(`- Path: ${path}`);
        console.log(`- Aliases:`);
        for (const [name, alias] of details.aliases) {
          console.log(`  - ${name}: type=${alias.type}, localName=${alias.localName}`);
        }
      }
    }
    
    // Check routes in file cache
    const routeFileCache = fileCache.get(routeFile);
    if (routeFileCache) {
      console.log(`\nRoutes defined: ${routeFileCache.routes.length}`);
      const debuggerRoute = routeFileCache.routes.find((r: any) => r.path === 'debugger');
      if (debuggerRoute) {
        console.log(`- Found debugger route:`);
        console.log(`  - Path: ${debuggerRoute.path}`);
        console.log(`  - Component: ${debuggerRoute.component}`);
      }
    }
  } else {
    console.log('- NOT found in enhanced graph');
  }
  
  // Now test route detection
  console.log('\n\nTesting route detection for Test.tsx:');
  const result = await analyzer.detectRoutes([testFile]);
  const routes = result.get(testFile) || [];
  console.log(`Found routes: ${routes.join(', ') || 'none'}`);
}

debug().catch(console.error);