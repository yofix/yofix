# Centralized Utilities Guide

This guide documents the new centralized utilities added to YoFix to improve code consistency and reduce duplication.

## Overview

Based on code analysis, we identified several patterns used repeatedly across the codebase:
- Environment variable access (101 occurrences)
- GitHub Action input access (49 occurrences)
- JSON parsing (33 occurrences)
- File system operations (89 occurrences)
- Try-catch patterns (240 occurrences)

We've created centralized utilities to standardize these operations.

## 1. Configuration Manager

### Purpose
Centralized access to configuration values from multiple sources with validation and caching.

### Location
`src/core/config/ConfigurationManager.ts`

### Features
- Unified access to GitHub inputs and environment variables
- Type-safe getters for different data types
- Built-in validation and transformation
- Caching for performance
- Sensitive value handling

### Usage

```typescript
import { config, getRequiredConfig, getBooleanConfig } from '@/core/config/ConfigurationManager';

// Basic usage
const apiKey = config.get('claude-api-key', { required: true });
const timeout = config.getNumber('test-timeout', 30000);
const debug = config.getBoolean('debug', false);

// With validation
const url = config.get('preview-url', {
  required: true,
  validate: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
});

// Arrays and JSON
const viewports = config.getArray('viewports', ['1920x1080']);
const authConfig = config.getJSON<AuthConfig>('auth-config');

// Sensitive values (no caching)
const password = config.getSecret('auth-password');

// Helper functions
const bucket = getRequiredConfig('s3-bucket');
const enableAI = getBooleanConfig('smart-analysis', true);
```

### Migration Guide

Replace:
```typescript
// Old
const timeout = process.env.INPUT_TEST_TIMEOUT || '30s';
const debug = process.env.INPUT_DEBUG === 'true';
const apiKey = core.getInput('claude-api-key', { required: true });
```

With:
```typescript
// New
const timeout = config.get('test-timeout', { defaultValue: '30s' });
const debug = config.getBoolean('debug');
const apiKey = config.getSecret('claude-api-key');
```

## 2. JSON Parser

### Purpose
Safe JSON parsing with consistent error handling and multiple format support.

### Location
`src/core/utils/JSONParser.ts`

### Features
- Error handling with fallback values
- Extract JSON from markdown blocks
- Parse multiple JSON objects
- Type-safe parsing with guards
- Circular reference handling

### Usage

```typescript
import { safeJSONParse, parseJSONAs, TypeGuards } from '@/core/utils/JSONParser';

// Basic parsing
const result = safeJSONParse(jsonString);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}

// With options
const parsed = safeJSONParse(content, {
  extractFromMarkdown: true,
  allowMultiple: true,
  defaultValue: {},
  maxLength: 100000
});

// Type-safe parsing
interface Config {
  name: string;
  enabled: boolean;
}

const configResult = parseJSONAs<Config>(
  jsonString,
  (data): data is Config => 
    TypeGuards.isObject(data) &&
    TypeGuards.hasProperty('name')(data) &&
    TypeGuards.hasProperty('enabled')(data)
);

// Safe stringify
const stringified = safeJSONStringify(data, { pretty: true });
```

### Migration Guide

Replace:
```typescript
// Old
let data;
try {
  data = JSON.parse(content);
} catch (error) {
  console.error('Failed to parse JSON:', error);
  data = {};
}
```

With:
```typescript
// New
const result = safeJSONParse(content, { defaultValue: {} });
const data = result.data;
```

## 3. File System Wrapper

### Purpose
Consistent file system operations with error handling and retry logic.

### Location
`src/core/utils/FileSystemWrapper.ts`

### Features
- Async operations with error handling
- Atomic writes with temp files
- Automatic directory creation
- File size limits for reads
- Backup before overwrite
- Cross-device move support

### Usage

```typescript
import { FileSystem, read, write, exists } from '@/core/utils/FileSystemWrapper';

// Check existence
const fileExists = await exists('/path/to/file');

// Read file
const content = await read('/path/to/file', {
  maxSize: 10 * 1024 * 1024, // 10MB limit
  json: true // Parse as JSON
});

// Write file
await write('/path/to/file', data, {
  atomic: true, // Write to temp file first
  backup: true, // Create .backup file
  createDirectories: true // Create parent dirs
});

// List directory
const files = await FileSystem.listDirectory('/path', {
  recursive: true,
  filter: (name) => name.endsWith('.ts'),
  includeHidden: false
});

// Copy with retry
await FileSystem.copy(source, dest, { overwrite: true });

// Cleanup old files
const deleted = await FileSystem.cleanupOldFiles(
  '/tmp',
  7 * 24 * 60 * 60 * 1000, // 7 days
  /^yofix-.*\.tmp$/
);
```

### Migration Guide

Replace:
```typescript
// Old
import * as fs from 'fs';

try {
  const exists = fs.existsSync(file);
  if (exists) {
    const content = fs.readFileSync(file, 'utf-8');
    // process content
  }
} catch (error) {
  console.error('File operation failed:', error);
}
```

With:
```typescript
// New
import { exists, read } from '@/core/utils/FileSystemWrapper';

if (await exists(file)) {
  const content = await read(file);
  // process content - errors handled automatically
}
```

## Integration with Existing Systems

These utilities integrate seamlessly with our centralized error handling:

```typescript
// Configuration errors are automatically categorized
const config = getRequiredConfig('missing-key');
// Throws with ErrorCategory.CONFIGURATION

// File operations include retry and fallback
const data = await read('file.json', { json: true });
// Returns null on error instead of throwing

// JSON parsing with validation
const result = safeJSONParse(input, {
  validate: (data) => data.version === '1.0'
});
// Detailed error messages for debugging
```

## Best Practices

1. **Use Type-Safe Methods**: Prefer `getBoolean()`, `getNumber()` over generic `get()`
2. **Add Validation**: Use validators for configuration values
3. **Handle Failures**: Check `success` field in parse results
4. **Use Atomic Writes**: For important files, use `atomic: true`
5. **Set Limits**: Use `maxSize` when reading user-provided files

## Performance Considerations

- Configuration values are cached (except secrets)
- File operations use streams for large files
- JSON parsing has size limits to prevent DoS
- Retry operations use exponential backoff

## Future Enhancements

Additional utilities planned:
- Centralized validation patterns
- Async/timeout utilities
- HTTP request wrapper
- Cache management utilities

## Migration Checklist

When updating existing code:

1. [ ] Replace `process.env` with `config.get()`
2. [ ] Replace `core.getInput()` with `config.get()`
3. [ ] Replace `JSON.parse()` with `safeJSONParse()`
4. [ ] Replace `fs.*Sync()` with async `FileSystem.*`
5. [ ] Add appropriate error categories
6. [ ] Test with missing/invalid values