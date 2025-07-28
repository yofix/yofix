# Enhanced Context Guide

## Overview

YoFix v1.0.10+ includes an EnhancedContextProvider that mimics Claude Code's contextual understanding capabilities. This provides AI features with deep codebase awareness for more accurate results.

## How It Works

The EnhancedContextProvider:
1. Analyzes your project structure
2. Reads relevant files based on the task
3. Understands dependencies and patterns
4. Provides context to AI for better decisions

## Benefits

### 1. Smart Authentication
- Understands your existing auth patterns
- Learns from previous login flows
- Adapts to different authentication systems

### 2. AI Navigation Discovery
- Finds routes based on your routing setup
- Understands SPA vs traditional navigation
- Detects dynamic routes and parameters

### 3. Intelligent Test Generation
- Creates tests matching your testing style
- Uses your existing test patterns
- Generates framework-specific tests

### 4. Better Command Parsing
- Understands your UI component names
- Maps natural language to your selectors
- Learns from your codebase structure

## Usage

### Basic Setup

```yaml
- uses: yofix/yofix@v1.0.10
  with:
    claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
    enable-smart-auth: 'true'
    enable-ai-navigation: 'true'
    enable-ai-test-generation: 'true'
```

### Enhanced Context in Action

When YoFix analyzes your application, it now:

1. **Builds Project Context**
   ```
   ├── src/
   │   ├── components/     # UI component patterns
   │   ├── hooks/          # Custom React hooks
   │   ├── styles/         # Styling conventions
   │   └── types/          # TypeScript types
   ├── tests/              # Existing test patterns
   └── package.json        # Dependencies
   ```

2. **Understands Code Patterns**
   - Component naming conventions
   - Test structure and assertions
   - Authentication flows
   - Route definitions

3. **Provides Contextual Analysis**
   - More accurate selectors
   - Better visual issue detection
   - Smarter fix suggestions

## Examples

### Smart Auth with Context

```yaml
# YoFix understands your login form structure
auth-login-url: '/auth/login'
auth-email: ${{ secrets.TEST_EMAIL }}
auth-password: ${{ secrets.TEST_PASSWORD }}
```

The AI will:
- Analyze your AuthHandler implementation
- Understand your form structure
- Find the right selectors automatically

### AI Navigation with Context

```yaml
# Let AI discover routes based on your code
routes: 'auto'
```

The AI will:
- Read your router configuration
- Find all defined routes
- Understand dynamic segments
- Prioritize important pages

### Test Generation with Context

```yaml
# Generate tests matching your style
enable-ai-test-generation: 'true'
```

The AI will:
- Analyze existing tests
- Match your assertion style
- Use your test utilities
- Follow your naming conventions

## Advanced Usage

### Custom Context Building

```javascript
// In your GitHub Action
const { EnhancedContextProvider } = require('@yofix/core');

const provider = new EnhancedContextProvider(apiKey);

// Focus on specific areas
const context = await provider.buildContext('.', [
  'src/components/Forms/**',
  'src/utils/validation.ts',
  'tests/forms/**'
]);

// Get targeted analysis
const analysis = await provider.analyzeWithContext(
  'How should we test form validation?',
  context
);
```

### Context-Aware Commands

```yaml
mcp-commands: |
  # Natural language that understands your app
  Click on the UserProfile component
  Navigate to the settings route
  Fill the EmailInput with valid data
  Submit the SettingsForm
```

## Performance Optimization

The EnhancedContextProvider includes:
- Smart caching of analysis results
- Selective file reading
- Parallel processing
- Incremental updates

## Best Practices

1. **Keep Context Focused**
   - Don't analyze entire codebase
   - Focus on relevant files
   - Use glob patterns wisely

2. **Cache Results**
   - Use cache-key for consistency
   - Reuse context between steps
   - Clear cache when needed

3. **Combine with Other Features**
   - Use with smart auth
   - Enable AI navigation
   - Generate contextual tests

## Troubleshooting

### Context Too Large
```yaml
# Limit context scope
context-files: |
  src/components/Login.tsx
  src/hooks/useAuth.ts
  src/types/auth.ts
```

### Slow Analysis
```yaml
# Use faster model for simple tasks
ai-model: 'claude-3-haiku-20240307'
```

### Missing Context
```yaml
# Explicitly include important files
context-files: |
  .yofix.yml
  playwright.config.ts
  src/test-utils.ts
```

## Comparison with Claude Code

| Feature | Claude Code | YoFix Enhanced Context |
|---------|------------|------------------------|
| Full codebase access | ✅ | ✅ (selective) |
| Real-time updates | ✅ | ❌ |
| IDE integration | ✅ | ❌ |
| CI/CD integration | ❌ | ✅ |
| Automated testing | ❌ | ✅ |
| Visual analysis | ❌ | ✅ |

## Future Enhancements

- Real-time file watching
- Incremental context updates
- Cross-PR learning
- Team knowledge sharing