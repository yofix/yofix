const { TreeSitterRouteAnalyzer } = require('./dist/core/analysis/TreeSitterRouteAnalyzer.js');
const fs = require('fs');

async function checkRoutes() {
  // Load patterns
  const patternsData = JSON.parse(fs.readFileSync('/Users/hari/2025/lp/loop-frontend/.yofix/patterns.json', 'utf-8'));

  const analyzer = new TreeSitterRouteAnalyzer({
    rootPath: '/Users/hari/2025/lp/loop-frontend',
    learnedPatterns: patternsData.pattern
  });

  await analyzer.buildFileCache();

  console.log('\n=== Checking App.tsx ===');
  const appRoutes = await analyzer.findRoutesServingComponent('src/App.tsx', 'Router');
  console.log('Routes found in App.tsx:', appRoutes);

  console.log('\n=== Checking Routes.tsx ===');
  const routesFileRoutes = await analyzer.findRoutesServingComponent('src/routes/Routes.tsx', 'PrivateRouter');
  console.log('Routes found in Routes.tsx:', routesFileRoutes);

  console.log('\n=== Checking PrivateRouter/index.tsx ===');
  const privateRoutes = await analyzer.findNestedRoutes('src/routes/PrivateRouter/index.tsx');
  console.log('Routes found in PrivateRouter/index.tsx:', privateRoutes.length, 'routes');
  console.log('Sample routes:', privateRoutes.slice(0, 10).map(r => r.path));
}

checkRoutes().catch(console.error);
