# Fix for Hanging Browser Agent in GitHub Actions

## Problem

The YoFix action hangs after printing:
```
🔐 Initializing shared browser session with authentication...
```

But never proceeds to test any routes or print the test URLs.

## Root Cause

The browser agent is hanging during initialization when trying to navigate to the preview URL without authentication. The agent's task is:
```
Navigate to https://arboreal-vision-339901--pr-3170-nbl5qha6.web.app and wait for page to load.
```

Possible reasons:
1. The preview URL is not accessible (404, 503, etc.)
2. The page takes too long to load
3. The page requires authentication
4. Network issues in GitHub Actions environment

## Solutions

### 1. Add Timeout to Agent Initialization

```typescript
// In TestGenerator.ts, wrap agent operations in timeout
const AGENT_INIT_TIMEOUT = 30000; // 30 seconds

try {
  await Promise.race([
    this.sharedAgent.initialize(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Agent initialization timeout')), AGENT_INIT_TIMEOUT)
    )
  ]);
  
  const authResult = await Promise.race([
    this.sharedAgent.run(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Agent execution timeout')), AGENT_INIT_TIMEOUT)
    )
  ]);
} catch (error) {
  core.error(`Agent initialization failed: ${error}`);
  // Fall back to independent sessions
  return await this.runTestsIndependently(analysis);
}
```

### 2. Add Page Load Validation

```typescript
// Before running agent, check if URL is accessible
async function validatePreviewUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      timeout: 10000 
    });
    return response.ok;
  } catch (error) {
    core.warning(`Preview URL validation failed: ${error}`);
    return false;
  }
}

// Use validation before agent initialization
if (!await validatePreviewUrl(this.firebaseConfig.previewUrl)) {
  core.warning('Preview URL not accessible, falling back to independent sessions');
  return await this.runTestsIndependently(analysis);
}
```

### 3. Configure Agent with Shorter Timeouts

```typescript
// In Agent configuration
this.sharedAgent = new Agent(initialTask, {
  headless: true,
  maxSteps: 10,
  llmProvider: 'anthropic',
  viewport: this.viewports[0] || { width: 1920, height: 1080 },
  apiKey: this.claudeApiKey,
  // Add browser-specific timeouts
  browserOptions: {
    timeout: 30000, // 30 second page timeout
    waitUntil: 'domcontentloaded' // Don't wait for all resources
  }
});
```

### 4. Add Debug Logging

```typescript
// Add more detailed logging
core.info(`🔐 Initializing shared browser session...`);
core.info(`   Preview URL: ${this.firebaseConfig.previewUrl}`);
core.info(`   Auth required: ${!!authEmail}`);
core.info(`   Task: ${initialTask}`);

// In agent, add progress logging
this.sharedAgent.on('step', (step) => {
  core.debug(`Agent step ${step.number}: ${step.action}`);
});
```

### 5. Implement Graceful Fallback

```typescript
private async runTestsWithSharedSession(analysis: RouteAnalysisResult): Promise<TestResult[]> {
  try {
    // Try shared session with timeout
    return await this.runTestsWithSharedSessionInternal(analysis);
  } catch (error) {
    core.warning(`Shared session failed: ${error}`);
    core.info('Falling back to independent browser sessions...');
    
    // Fall back to independent sessions
    return await this.runTestsIndependently(analysis);
  }
}
```

## Immediate Workaround

For the current GitHub Action run, you can:

1. **Skip shared sessions** by setting environment variable:
   ```yaml
   - name: Run YoFix
     uses: yofix/yofix@v1
     with:
       session-mode: 'independent'  # Force independent sessions
   ```

2. **Add authentication** if the preview requires it:
   ```yaml
   with:
     auth-email: ${{ secrets.TEST_EMAIL }}
     auth-password: ${{ secrets.TEST_PASSWORD }}
     auth-login-url: '/login'
   ```

3. **Check preview URL accessibility** before running YoFix:
   ```yaml
   - name: Wait for preview
     run: |
       for i in {1..30}; do
         if curl -s -o /dev/null -w "%{http_code}" "${{ env.PREVIEW_URL }}" | grep -q "200\|301\|302"; then
           echo "Preview is ready"
           break
         fi
         echo "Waiting for preview... (attempt $i/30)"
         sleep 10
       done
   ```

## Long-term Fix

The code should be updated to:
1. Always use timeouts for browser operations
2. Validate URLs before attempting to navigate
3. Provide clear error messages when navigation fails
4. Automatically fall back to working modes
5. Add health checks for preview deployments

## Debugging Steps

To debug the current issue:

1. Check if the preview URL is accessible:
   ```bash
   curl -I https://arboreal-vision-339901--pr-3170-nbl5qha6.web.app
   ```

2. Look for browser agent logs in GitHub Actions:
   - Check for any Playwright error messages
   - Look for network timeouts
   - Check for authentication redirects

3. Try running with debug logging:
   ```yaml
   env:
     DEBUG: 'yofix:*,playwright:*'
   ```

4. Monitor Firebase hosting deployment status:
   - Ensure the preview deployment completed
   - Check for any deployment errors