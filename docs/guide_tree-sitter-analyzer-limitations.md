# TreeSitterRouteAnalyzer: Limitations and Failure Scenarios

## Current Limitations

### 1. Dynamic Route Definitions

The analyzer struggles with routes defined dynamically at runtime:

```typescript
// ❌ Won't detect these patterns
const routes = routeConfig.map(config => ({
  path: config.url,
  element: <DynamicComponent name={config.component} />
}));

// ❌ Runtime route generation
const generateRoutes = (user) => {
  if (user.isAdmin) {
    return [{ path: '/admin', element: <Admin /> }];
  }
  return [{ path: '/user', element: <User /> }];
};

// ❌ Routes from external configuration
const routes = await fetch('/api/routes').then(r => r.json());
```

**Why it fails**: The analyzer only sees static code patterns, not runtime values.

### 2. Complex Component Resolution

Fails to track components through certain patterns:

```typescript
// ❌ Higher-order components
const EnhancedDashboard = withAuth(withLayout(Dashboard));
{ path: '/dashboard', element: <EnhancedDashboard /> }

// ❌ Component factories
const createPage = (Component) => (props) => <Layout><Component {...props} /></Layout>;
const HomePage = createPage(Home);

// ❌ Barrel exports with re-exports
// components/index.ts
export { default as Dashboard } from './Dashboard';
// Routes file
import { Dashboard } from './components'; // May not trace back correctly
```

### 3. Non-Standard Import Patterns

```typescript
// ❌ Require statements (CommonJS)
const Dashboard = require('./Dashboard');

// ❌ Dynamic imports with variables
const componentName = 'Dashboard';
const Component = lazy(() => import(`./${componentName}`));

// ❌ Webpack-specific imports
const Component = () => import(/* webpackChunkName: "dashboard" */ './Dashboard');

// ❌ Conditional imports
const Component = isDev 
  ? lazy(() => import('./DevDashboard'))
  : lazy(() => import('./Dashboard'));
```

### 4. Framework-Specific Limitations

#### Next.js App Router
```typescript
// ❌ Parallel routes
app/
  @modal/
    page.tsx      // Parallel route - not detected
  @sidebar/
    page.tsx      // Parallel route - not detected

// ❌ Route groups
app/
  (marketing)/    // Route group - might confuse parser
    about/page.tsx
  (shop)/
    products/page.tsx

// ❌ Intercepting routes
app/
  (..)photo/[id]/page.tsx  // Intercept route - not handled
```

#### React Router v6 Advanced Patterns
```typescript
// ❌ Route configuration with loaders/actions
{
  path: '/users/:id',
  element: <User />,
  loader: ({ params }) => fetchUser(params.id),  // Loader not tracked
  action: async ({ request }) => { ... }         // Action not tracked
}

// ❌ Layout routes without path
{
  element: <Layout />,    // No path property
  children: [
    { path: 'dashboard', element: <Dashboard /> }
  ]
}
```

### 5. Cross-Repository Dependencies

```typescript
// ❌ Monorepo packages
import { SharedComponent } from '@company/shared-ui';

// ❌ npm packages with routes
import { AdminRoutes } from 'admin-dashboard-package';

// ❌ Git submodules
import { Routes } from '../external-submodule/routes';
```

### 6. Build-Time Transformations

```typescript
// ❌ Vite glob imports
const modules = import.meta.glob('./pages/*.tsx');

// ❌ Webpack require.context
const req = require.context('./pages', true, /\.tsx$/);

// ❌ Build-time macros
import { routes } from '$routes'; // SvelteKit special import

// ❌ TypeScript path aliases that resolve differently
import { Dashboard } from '@/components/Dashboard'; // May fail if tsconfig paths not handled
```

### 7. Indirect Component Usage

```typescript
// ❌ Components used via strings/references
const componentMap = {
  dashboard: Dashboard,
  profile: Profile
};

routes.map(route => ({
  path: route.path,
  element: React.createElement(componentMap[route.component])
}));

// ❌ Dependency injection patterns
container.register('Dashboard', DashboardComponent);
const routes = [
  { path: '/dashboard', element: container.resolve('Dashboard') }
];
```

### 8. Performance Edge Cases

```typescript
// ⚠️ Extremely large files (>1MB) are skipped
// ⚠️ Circular imports might cause infinite loops (though handled with visited set)
// ⚠️ Very deep import chains (>50 levels) might be incomplete
// ⚠️ Binary files with .js extension cause parse errors
```

### 9. Parser Limitations

```typescript
// ❌ Invalid syntax (even if it works with Babel)
const routes = [
  { 
    path: '/test',
    element: <Component {...spread} /* comment */ />  // Complex JSX might fail
  }
];

// ❌ Experimental TypeScript features
const routes = [
  { path: '/test', element: <Component!> }  // Non-null assertion in JSX
] satisfies RouteConfig[];  // 'satisfies' operator

// ❌ Flow type annotations (if mixed with TypeScript)
```

### 10. Route Definition Edge Cases

```typescript
// ❌ Routes defined in test files might be included
describe('Router tests', () => {
  const testRoutes = [
    { path: '/test', element: <TestComponent /> }
  ];
});

// ❌ Routes in comments or strings
const example = `
  { path: '/example', element: <Example /> }
`;

// ❌ Computed property names
const routeKey = 'path';
const routes = [
  { [routeKey]: '/dynamic', element: <Dynamic /> }
];
```

## Where It Might Fail Silently

### 1. Incomplete Route Detection
- **Symptom**: Some routes not detected, no error thrown
- **Cause**: Complex import chains or unsupported patterns
- **Example**: HOCs, dynamic imports, circular dependencies

### 2. False Positives
- **Symptom**: Routes detected that don't actually exist
- **Cause**: Route-like objects in tests, comments, or examples
- **Example**: Documentation files with route examples

### 3. Alias Resolution Failures
- **Symptom**: Component changes don't map to routes
- **Cause**: Complex aliasing, re-exports, or barrel files
- **Example**: `export { default as X } from './Y'` chains

### 4. Memory Issues
- **Symptom**: Process runs out of memory on large codebases
- **Cause**: Keeping entire AST cache in memory
- **Mitigation**: Currently processes in batches of 50 files

### 5. Stale Cache Issues
- **Symptom**: Changes not reflected in route analysis
- **Cause**: File changes not invalidating cache properly
- **Mitigation**: Force rebuild with `clearCache()`

## Recommended Workarounds

### 1. For Dynamic Routes
```typescript
// ✅ Create a static route manifest
export const ROUTES = [
  { path: '/dashboard', componentFile: './Dashboard' },
  { path: '/profile', componentFile: './Profile' }
];
```

### 2. For Complex Components
```typescript
// ✅ Use direct imports in route files
import Dashboard from './Dashboard';
// Instead of: import { Dashboard } from './components';

// ✅ Avoid HOCs in route definitions
const AuthDashboard = withAuth(Dashboard);
// Use in route: element: <AuthDashboard />
// Instead of: element: <withAuth(Dashboard) />
```

### 3. For Framework-Specific Issues
```typescript
// ✅ Add route comments for parser hints
{
  path: '/admin',
  element: <Admin />, // @route-component: src/pages/Admin.tsx
}
```

### 4. For Monorepo/External Dependencies
```typescript
// ✅ Create a route registry file
// routes/external-routes.ts
export const externalRoutes = [
  { path: '/external', component: '@company/shared-ui/Component' }
];
```

## Best Practices to Avoid Issues

1. **Use Static Route Definitions**: Define routes in predictable patterns
2. **Avoid Dynamic Imports with Variables**: Use static import paths
3. **Keep Route Files Simple**: Minimize complex logic in route definitions
4. **Use Consistent Import Patterns**: Stick to ES6 imports
5. **Test Route Detection**: Add unit tests for route discovery
6. **Clear Cache When Needed**: Run with `forceRebuild` after major refactoring
7. **Monitor Performance**: Check metrics with `analyzer.getMetrics()`

## Future Improvements Needed

1. **Support for Dynamic Routes**: Analyze runtime route generation
2. **Better HOC Tracking**: Follow components through wrapper functions
3. **Webpack/Vite Plugin**: Integrate with build tools for accurate resolution
4. **TypeScript Compiler Integration**: Use TSC for perfect type resolution
5. **Incremental AST Updates**: Only reparse changed portions of files
6. **Streaming Parser**: Handle very large files without loading fully into memory
7. **Route Validation**: Verify detected routes actually work
8. **Custom Pattern Plugins**: Allow users to define custom route patterns

## Diagnostic Tools

To debug route detection issues:

```typescript
// Enable debug logging
const analyzer = new TreeSitterRouteAnalyzer(rootPath);

// Check what was detected
const metrics = analyzer.getMetrics();
console.log(`Total files: ${metrics.totalFiles}`);
console.log(`Route files: ${metrics.routeFiles}`);

// Get detailed route info
const routeInfo = await analyzer.getRouteInfo(['src/Component.tsx']);
console.log(routeInfo);

// Check import graph
const graph = analyzer['importGraph']; // Access private property for debugging
```