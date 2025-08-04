import { TreeSitterRouteAnalyzer } from '../TreeSitterRouteAnalyzer';
import * as fs from 'fs';
import * as path from 'path';
import { jest } from '@jest/globals';

describe('TreeSitterRouteAnalyzer - Nested Routes', () => {
  let testDir: string;
  let analyzer: TreeSitterRouteAnalyzer;
  
  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(process.cwd(), `test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, 'src/routes'), { recursive: true });
    
    // Create package.json
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        name: "test",
        dependencies: { "react-router-dom": "^6.0.0" }
      })
    );
  });
  
  afterEach(async () => {
    // Clean up
    if (analyzer) {
      await analyzer.clearCache();
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });
  
  test('should detect nested routes with children arrays', async () => {
    // Create a routes file with nested structure
    const routesContent = `
export const routes = [
  {
    path: 'base',
    children: [
      { path: 'leaderboard', element: <Leaderboard /> },
      { path: 'settings', element: <Settings /> }
    ]
  },
  {
    path: 'admin',
    element: <AdminLayout />,
    children: [
      { path: 'users', element: <Users /> },
      { 
        path: 'reports',
        children: [
          { path: 'daily', element: <DailyReport /> },
          { path: 'monthly', element: <MonthlyReport /> }
        ]
      }
    ]
  }
];`;
    
    fs.writeFileSync(
      path.join(testDir, 'src/routes/routes.tsx'),
      routesContent
    );
    
    // Initialize analyzer and detect routes
    analyzer = new TreeSitterRouteAnalyzer(testDir);
    await analyzer.initialize();
    
    const routeInfo = await analyzer.getRouteInfo(['src/routes/routes.tsx']);
    const routes = routeInfo.get('src/routes/routes.tsx')?.routes || [];
    
    // Check that nested routes are properly concatenated
    expect(routes).toContain('base/leaderboard');
    expect(routes).toContain('base/settings');
    expect(routes).toContain('admin/users');
    expect(routes).toContain('admin/reports/daily');
    expect(routes).toContain('admin/reports/monthly');
  });
  
  test('should handle deeply nested routes', async () => {
    const routesContent = `
const routes = {
  path: 'root',
  children: [{
    path: 'level1',
    children: [{
      path: 'level2',
      children: [{
        path: 'level3',
        element: <DeepComponent />
      }]
    }]
  }]
};`;
    
    fs.writeFileSync(
      path.join(testDir, 'src/routes/deep.tsx'),
      routesContent
    );
    
    analyzer = new TreeSitterRouteAnalyzer(testDir);
    await analyzer.initialize();
    
    const routeInfo = await analyzer.getRouteInfo(['src/routes/deep.tsx']);
    const routes = routeInfo.get('src/routes/deep.tsx')?.routes || [];
    
    // Should detect the deeply nested route
    expect(routes).toContain('root/level1/level2/level3');
  });
  
  test('should handle index routes in nested structures', async () => {
    const routesContent = `
const routes = [{
  path: 'dashboard',
  children: [
    { index: true, element: <DashboardHome /> },
    { path: 'stats', element: <Stats /> }
  ]
}];`;
    
    fs.writeFileSync(
      path.join(testDir, 'src/routes/index-routes.tsx'),
      routesContent
    );
    
    analyzer = new TreeSitterRouteAnalyzer(testDir);
    await analyzer.initialize();
    
    const routeInfo = await analyzer.getRouteInfo(['src/routes/index-routes.tsx']);
    const routes = routeInfo.get('src/routes/index-routes.tsx')?.routes || [];
    
    // Should detect index route with special marker
    expect(routes).toContain('dashboard/(index)');
    expect(routes).toContain('dashboard/stats');
  });
});