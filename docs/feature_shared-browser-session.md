# Shared Browser Session Feature

## Overview

YoFix v1.0.22 introduces a powerful **shared browser session** feature that significantly improves performance when testing multiple routes. Instead of creating a new browser instance and authenticating for each route, YoFix now reuses a single authenticated session across all route tests.

## Performance Benefits

- **38-46% faster execution** for multi-route tests
- **Single authentication** instead of repeated logins
- **Reduced resource usage** with one browser instance
- **Better reliability** with maintained session state

### Example Performance Gains

Testing 3 routes:
- **Old behavior**: 28.8 seconds (3 browser instances, 3 authentications)
- **New behavior**: 15.5 seconds (1 browser instance, 1 authentication)
- **Time saved**: 13.3 seconds (46% faster)

## Configuration

The feature is controlled by the `session-mode` input in your GitHub Actions workflow:

```yaml
- uses: yofix/yofix@v1.0.22
  with:
    session-mode: sharedAgent  # Default - reuses browser session
    # OR
    session-mode: independentAgent  # Old behavior - new session per route
```

### Default Configuration

The default value is defined in `src/config/default.config.ts`:

```typescript
testing: {
  sessionMode: 'sharedAgent'  // Default value
}
```

And in `action.yml`:

```yaml
session-mode:
  description: 'Browser session mode: sharedAgent (reuse session) or independentAgent (new session per route)'
  required: false
  default: 'sharedAgent'
```

## How It Works

### Shared Session Flow (Default)

1. **Initialize once**: Create browser and authenticate
2. **Test routes**: Navigate to each route using the same session
3. **Cleanup once**: Close browser after all tests

```
Browser Setup (1s) → Authenticate (6s) → Test Route 1 (10s) → Test Route 2 (10s) → Cleanup (0.5s)
Total: 27.5s
```

### Independent Session Flow (Legacy)

1. For each route:
   - Create new browser
   - Authenticate
   - Test route
   - Close browser

```
[Browser → Auth → Test → Close] × N routes
Total: N × 17.5s
```

## Implementation Details

### Key Components Modified

1. **Agent Class** (`src/browser-agent/core/Agent.ts`):
   - Added `reset(newTask)` method to clear state while keeping browser alive
   - Added `runTask(task)` method to execute new tasks in existing session
   - Added `isActive()` method to check browser status

2. **TestGenerator** (`src/core/testing/TestGenerator.ts`):
   - Added `runTestsWithSharedSession()` method for session reuse
   - Modified `runTests()` to check session mode configuration
   - Created separate task builders for shared vs independent sessions

3. **Configuration** (`src/config/default.config.ts`):
   - Added `sessionMode` to testing configuration
   - Set default value to `'sharedAgent'`

### Code Example

```typescript
// Shared session implementation
async runTestsWithSharedSession(analysis: RouteAnalysisResult): Promise<TestResult[]> {
  // Create and authenticate once
  this.sharedAgent = new Agent(authTask, options);
  await this.sharedAgent.initialize();
  await this.sharedAgent.run(); // Authenticate
  
  // Test all routes with the same session
  for (const route of analysis.routes) {
    const result = await this.sharedAgent.runTask(routeTestTask);
    results.push(result);
  }
  
  // Cleanup once at the end
  await this.sharedAgent.cleanup();
}
```

## Testing

Run the included tests to verify functionality:

```bash
# Unit tests
npx ts-node tests/test-shared-session-unit.ts

# Performance demonstration
node tests/test-shared-session.ts

# Visual demo
node tests/demo-shared-session.js
```

## Migration Guide

### For Most Users

No action required! The shared session mode is enabled by default and provides better performance automatically.

### To Use Legacy Behavior

If you need the old behavior for any reason:

```yaml
- uses: yofix/yofix@v1.0.22
  with:
    session-mode: independentAgent
```

## Use Cases

### When Shared Sessions Excel

- Testing multiple authenticated routes
- Long authentication processes
- Session-dependent functionality
- Consistent state requirements

### When to Use Independent Sessions

- Testing logout/login flows
- Isolating test failures
- Testing session timeouts
- Debugging authentication issues

## Troubleshooting

### Session State Issues

If routes depend on specific session states, ensure your test order is appropriate.

### Authentication Failures

The shared session will fail fast if initial authentication fails. Check your credentials and login URL.

### Memory Leaks

The Agent properly cleans up state between tasks while maintaining the browser connection.

## Future Enhancements

- Parallel testing with multiple shared sessions
- Session persistence across workflow steps
- Intelligent session pooling
- Custom session lifecycle hooks