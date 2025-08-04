import { TreeSitterRouteAnalyzer } from './src/core/analysis/TreeSitterRouteAnalyzer';

console.log('Enhanced TreeSitterRouteAnalyzer - Force Rebuild Test');
console.log('=====================================================');

const codebase = '/Users/shekhar/2024/lp/loop-fs/loop-frontend';
const changedFiles = [
  'src/pages/members/Testing/Test.tsx',
  'src/pages/members/Leaderboard/index.tsx'
];

console.log(`Codebase: ${codebase}`);
console.log('Changed files:', changedFiles);

async function test() {
  const analyzer = new TreeSitterRouteAnalyzer(codebase);
  
  console.log('\nForcing cache rebuild to populate enhanced graph...');
  const initStart = Date.now();
  await analyzer.initialize(true); // Force rebuild
  const initTime = Date.now() - initStart;
  console.log(`✓ Initialized with rebuild in ${initTime}ms`);
  
  // Test each file
  for (const file of changedFiles) {
    console.log(`\n\nAnalyzing: ${file}`);
    console.log('-'.repeat(50));
    
    const start = Date.now();
    const result = await analyzer.detectRoutes([file]);
    const time = Date.now() - start;
    
    const routes = result.get(file) || [];
    if (routes.length > 0) {
      console.log(`✓ Found ${routes.length} route(s) in ${time}ms:`);
      routes.forEach(route => console.log(`  • ${route}`));
    } else {
      console.log(`✗ No routes found (${time}ms)`);
    }
  }
  
  // Validation tests
  console.log('\n\nValidation Tests:');
  console.log('=================');
  
  const tests = [
    { file: 'src/pages/members/Testing/Test.tsx', expected: ['debugger'] },
    { file: 'src/pages/members/Leaderboard/index.tsx', expected: ['base/leaderboard', 'marketing/leaderboard'] }
  ];
  
  let allPassed = true;
  for (const test of tests) {
    const result = await analyzer.detectRoutes([test.file]);
    const routes = result.get(test.file) || [];
    
    const passed = test.expected.every(r => routes.includes(r)) && routes.length === test.expected.length;
    if (passed) {
      console.log(`✅ ${test.file}: ${routes.join(', ')}`);
    } else {
      console.log(`❌ ${test.file}: Expected ${test.expected.join(', ')}, got ${routes.join(', ') || 'none'}`);
      allPassed = false;
    }
  }
  
  console.log(allPassed ? '\n✅ All tests passed!' : '\n❌ Some tests failed');
}

test().catch(console.error);