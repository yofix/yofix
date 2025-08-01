# Centralized Error Handling and GitHub Communication

YoFix now includes a powerful centralized system for error handling, GitHub comments, and bot activity tracking.

## Overview

The centralized system consists of three main components:

1. **GitHubCommentEngine** - Handles all GitHub comment interactions
2. **CentralizedErrorHandler** - Manages all errors with context and recovery
3. **BotActivityHandler** - Tracks bot command progress with real-time updates

## Usage Examples

### 1. Basic Error Handling

```typescript
import { errorHandler, ErrorCategory, ErrorSeverity } from '@yofix/core';

// Handle an error with full context
try {
  await someRiskyOperation();
} catch (error) {
  await errorHandler.handleError(error, {
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.API,
    userAction: 'Fetching user data',
    metadata: { userId: 123 },
    tips: [
      'Check your API credentials',
      'Verify the user exists'
    ]
  });
}
```

### 2. Wrapping Functions

```typescript
// Wrap async functions
const result = await errorHandler.wrapAsync(
  async () => {
    return await fetchDataFromAPI();
  },
  {
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    recoverable: true,
    userAction: 'Fetching data from external API'
  }
);

// Wrap sync functions
const config = errorHandler.wrap(
  () => {
    return JSON.parse(configString);
  },
  {
    category: ErrorCategory.CONFIGURATION,
    severity: ErrorSeverity.HIGH,
    userAction: 'Parsing configuration'
  }
);
```

### 3. GitHub Comments

```typescript
import { getGitHubCommentEngine } from '@yofix/core';

const commentEngine = getGitHubCommentEngine();

// Post a simple comment
await commentEngine.postComment('✅ Tests passed!');

// Post with reactions
await commentEngine.postComment('🚀 Deployment successful!', {
  reactions: ['rocket', 'hooray']
});

// Update existing comment
await commentEngine.postComment('Updated status...', {
  updateExisting: true,
  signature: 'deployment-status'
});

// Thread management
await commentEngine.startThread('test-results', '## Test Results\n\nRunning tests...');
await commentEngine.replyToThread('test-results', '✅ All tests passed!');
await commentEngine.updateThread('test-results', '## Test Results\n\n✅ 100/100 tests passed');
```

### 4. Bot Activity Tracking

```typescript
import { botActivity } from '@yofix/core';

// Start an activity
await botActivity.startActivity('scan-123', '@yofix scan /dashboard');

// Add steps
await botActivity.addStep('Loading page', 'running');
await botActivity.updateStep('Loading page', 'completed', 'Page loaded in 2.3s');

await botActivity.addStep('Taking screenshot', 'running');
await botActivity.updateStep('Taking screenshot', 'completed');

await botActivity.addStep('Analyzing', 'running');
await botActivity.updateStep('Analyzing', 'failed', 'Analysis timeout');

// Complete or fail
await botActivity.completeActivity({ issues: 3 }, 'Found 3 visual issues');
// OR
await botActivity.failActivity('Network error during scan');
```

### 5. Progress Updates

```typescript
const commentEngine = getGitHubCommentEngine();

// Post progress updates that auto-update
await commentEngine.postProgress('deploy-task', '🔄 Deploying... (0/3 steps)');
await commentEngine.postProgress('deploy-task', '🔄 Deploying... (1/3 steps) - Build complete');
await commentEngine.postProgress('deploy-task', '🔄 Deploying... (2/3 steps) - Uploading');
await commentEngine.postProgress('deploy-task', '✅ Deployment complete! (3/3 steps)');
```

## Error Categories and Severities

### Categories
- `AUTHENTICATION` - Login/auth failures
- `API` - External API errors
- `NETWORK` - Network connectivity issues
- `CONFIGURATION` - Config/setup problems
- `BROWSER` - Browser automation errors
- `ANALYSIS` - Code/visual analysis errors
- `STORAGE` - File/database errors
- `UNKNOWN` - Uncategorized errors

### Severities
- `CRITICAL` - Workflow-stopping errors
- `HIGH` - Important errors that need attention
- `MEDIUM` - Errors that may affect functionality
- `LOW` - Minor issues or warnings

## Best Practices

### 1. Always Provide Context

```typescript
await errorHandler.handleError(error, {
  userAction: 'What the user was trying to do',
  location: 'Where in the code this happened',
  metadata: { 
    // Any relevant data
    input: userInput,
    config: currentConfig
  }
});
```

### 2. Use Appropriate Severity

```typescript
// Critical - stops the workflow
if (!apiKey) {
  throw errorHandler.createError('API key is required', {
    severity: ErrorSeverity.CRITICAL,
    category: ErrorCategory.CONFIGURATION
  });
}

// High - important but recoverable
if (retries > maxRetries) {
  await errorHandler.handleError('Max retries exceeded', {
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.NETWORK,
    recoverable: true
  });
}

// Low - informational
if (cacheSize > threshold) {
  await errorHandler.handleError('Cache size exceeds threshold', {
    severity: ErrorSeverity.LOW,
    category: ErrorCategory.STORAGE,
    skipGitHubPost: true // Don't spam PR comments
  });
}
```

### 3. Thread Comments Appropriately

```typescript
// For related updates
const threadId = 'deployment-process';
await commentEngine.startThread(threadId, '🚀 Starting deployment...');
await commentEngine.replyToThread(threadId, '📦 Building application...');
await commentEngine.replyToThread(threadId, '✅ Deployment complete!');

// For status updates
await commentEngine.postProgress('scan-progress', 'Scanning 0/10 routes...');
await commentEngine.postProgress('scan-progress', 'Scanning 5/10 routes...');
await commentEngine.postProgress('scan-progress', 'Scan complete! 10/10 routes');
```

### 4. Handle Bot Commands

```typescript
// In your bot command handler
const activityId = `cmd-${Date.now()}`;
const command = '@yofix test /dashboard';

try {
  await botActivity.startActivity(activityId, command);
  
  await botActivity.addStep('Authenticate', 'running');
  await authenticate();
  await botActivity.updateStep('Authenticate', 'completed');
  
  await botActivity.addStep('Run tests', 'running');
  const results = await runTests();
  await botActivity.updateStep('Run tests', 'completed', `${results.passed}/${results.total} passed`);
  
  await botActivity.completeActivity(results);
} catch (error) {
  await botActivity.failActivity(error);
}
```

## Integration Points

### In GitHub Actions

```typescript
// src/index.ts
import { initializeCoreServices, finalizeCoreServices } from '@yofix/core';

async function run() {
  try {
    // Initialize at the start
    const githubToken = core.getInput('github-token');
    initializeCoreServices(githubToken);
    
    // Your workflow logic here
    await runWorkflow();
    
  } finally {
    // Post summaries at the end
    await finalizeCoreServices();
  }
}
```

### In Bot Commands

```typescript
// All bot commands automatically use the centralized system
export class CommandHandler {
  async execute(command: BotCommand): Promise<BotResponse> {
    // Bot activity tracking is automatic
    // Just return your response
    return {
      success: true,
      message: 'Command completed!'
    };
  }
}
```

## Error Recovery

The system supports recoverable errors:

```typescript
const result = await errorHandler.wrapAsync(
  async () => fetchData(),
  {
    recoverable: true,
    category: ErrorCategory.NETWORK
  }
);

if (result === null) {
  // Error was handled and recovered
  // Use fallback logic
  return getCachedData();
}
```

## Summary

The centralized system ensures:
- ✅ All errors are properly tracked and reported
- ✅ GitHub comments are consistent and threaded
- ✅ Bot activities show real-time progress
- ✅ Users get helpful error messages with tips
- ✅ Developers have full context for debugging

By using these centralized components, YoFix provides a consistent, user-friendly experience across all interactions!