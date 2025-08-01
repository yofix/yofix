# YoFix Configuration System

YoFix uses a flexible configuration system that allows you to customize various aspects of the tool's behavior. Configuration can be set through multiple sources with a clear precedence order.

## Configuration Structure

The configuration is organized into logical sections:

```typescript
{
  "ai": {
    "claude": {
      "defaultModel": "claude-3-5-sonnet-20241022",
      "models": {
        "analysis": "claude-3-5-sonnet-20241022",
        "navigation": "claude-3-5-sonnet-20241022", 
        "fixing": "claude-3-5-sonnet-20241022",
        "screenshot": "claude-3-5-sonnet-20241022",
        "contextual": "claude-3-5-sonnet-20241022"
      },
      "maxTokens": {
        "default": 1024,
        "analysis": 2048,
        "fixing": 4096,
        "navigation": 1024
      },
      "temperature": 0.2
    }
  },
  "browser": {
    "defaultTimeout": 30000,
    "navigationTimeout": 60000,
    "headless": true,
    "slowMo": 0,
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  },
  "storage": {
    "providers": {
      "firebase": { ... },
      "s3": { ... }
    },
    "defaultProvider": "firebase"
  },
  "github": {
    "defaultBranch": "main",
    "prCommentPrefix": "@yofix",
    "checkRunName": "YoFix Visual Testing"
  },
  "testing": {
    "screenshotQuality": 90,
    "defaultWaitTime": 2000,
    "retryAttempts": 3,
    "retryDelay": 1000
  },
  "auth": {
    "defaultMode": "selectors",
    "aiAuthMaxAttempts": 3,
    "selectorTimeout": 10000
  },
  "logging": {
    "level": "info",
    "includeTimestamp": true
  }
}
```

## Configuration Sources

Configuration values are loaded and merged from multiple sources in the following order (later sources override earlier ones):

1. **Default Configuration** - Built-in defaults in `src/config/default.config.ts`
2. **Environment-specific Config** - `src/config/{NODE_ENV}.config.js` (e.g., `production.config.js`)
3. **User Configuration File** - One of these files in your project root:
   - `.yofix.config.json`
   - `.yofix.config.js`
   - `yofix.config.json`
   - `yofix.config.js`
4. **Environment Variables** - Specific overrides via environment variables

## User Configuration File

To customize YoFix behavior, create a configuration file in your project root. You can use the provided example as a starting point:

```bash
cp .yofix.config.example.json .yofix.config.json
```

Then edit `.yofix.config.json` to override any default values:

```json
{
  "ai": {
    "claude": {
      "defaultModel": "claude-3-5-sonnet-20241022",
      "temperature": 0.3
    }
  },
  "browser": {
    "headless": false,
    "slowMo": 100
  },
  "logging": {
    "level": "debug"
  }
}
```

## Environment Variable Overrides

You can override specific configuration values using environment variables:

- `YOFIX_AI_MODEL` - Override the default Claude model
- `YOFIX_AI_MAX_TOKENS` - Override default max tokens
- `YOFIX_BROWSER_HEADLESS` - Set to "true" or "false"
- `YOFIX_BROWSER_TIMEOUT` - Override default browser timeout (in ms)
- `YOFIX_STORAGE_PROVIDER` - Set to "firebase" or "s3"
- `YOFIX_AUTH_MODE` - Set to "selectors" or "ai"
- `YOFIX_LOG_LEVEL` - Set to "debug", "info", "warn", or "error"

Example:
```bash
YOFIX_BROWSER_HEADLESS=false YOFIX_LOG_LEVEL=debug yarn test
```

## Configuration Sections

### AI Configuration (`ai`)

Controls Claude AI model behavior:

- `defaultModel` - The Claude model to use by default
- `models` - Specific models for different use cases:
  - `analysis` - Visual analysis and issue detection
  - `navigation` - Understanding and navigating web interfaces
  - `fixing` - Generating code fixes
  - `screenshot` - Analyzing screenshots
  - `contextual` - Context-aware code analysis
- `maxTokens` - Token limits for different operations
- `temperature` - Controls response randomness (0-1, lower is more deterministic)

### Browser Configuration (`browser`)

Controls Playwright browser behavior:

- `defaultTimeout` - Default timeout for operations (ms)
- `navigationTimeout` - Timeout for page navigation (ms)
- `headless` - Run browser in headless mode
- `slowMo` - Slow down operations by specified ms
- `viewport` - Browser viewport dimensions

### Storage Configuration (`storage`)

Controls where test artifacts are stored:

- `defaultProvider` - "firebase" or "s3"
- `providers` - Provider-specific configuration

### Testing Configuration (`testing`)

Controls test execution:

- `screenshotQuality` - JPEG quality for screenshots (0-100)
- `defaultWaitTime` - Default wait time between actions (ms)
- `retryAttempts` - Number of retry attempts for failed operations
- `retryDelay` - Delay between retries (ms)

### Authentication Configuration (`auth`)

Controls authentication behavior:

- `defaultMode` - "selectors" (CSS selectors) or "ai" (AI-driven)
- `aiAuthMaxAttempts` - Max attempts for AI authentication
- `selectorTimeout` - Timeout for selector-based operations (ms)

### Logging Configuration (`logging`)

Controls logging output:

- `level` - Minimum log level: "debug", "info", "warn", "error"
- `includeTimestamp` - Include timestamps in log output

## Accessing Configuration in Code

The configuration system is accessible throughout the codebase:

```typescript
import config from './config';

// Get a value with dot notation
const model = config.get('ai.claude.defaultModel');
const timeout = config.get('browser.defaultTimeout');

// Get with default value
const temperature = config.get('ai.claude.temperature', 0.2);

// Get the full config object
const fullConfig = config.getConfig();

// Runtime configuration changes (not persisted)
config.set('browser.headless', false);

// Reload configuration from files
config.reload();
```

## Best Practices

1. **Use the example file** - Start with `.yofix.config.example.json` as a template
2. **Don't commit secrets** - Keep API keys in environment variables, not config files
3. **Environment-specific configs** - Use different config files for development/production
4. **Override sparingly** - Only override values you need to change
5. **Document changes** - Comment why you're overriding specific values

## Migration from Hardcoded Values

The configuration system replaces hardcoded values throughout the codebase:

- Model names like `'claude-3-5-sonnet-20241022'` → `config.get('ai.claude.defaultModel')`
- Timeouts like `30000` → `config.get('browser.defaultTimeout')`
- Max tokens like `1024` → `config.get('ai.claude.maxTokens.default')`

This makes the codebase more maintainable and allows users to customize behavior without modifying code.