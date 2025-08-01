# YoFix Configuration Defaults and Error Handling

## Default Values for All Optional Inputs

YoFix is designed to work out-of-the-box with sensible defaults. Here's a complete list:

### 🔐 Authentication
- `auth-mode`: **`llm`** - AI-powered authentication (works on any site!)
- `auth-login-url`: **`/login/password`** - Standard login path
- `enable-smart-auth`: **`false`** - Additional smart strategies

### 📱 Testing Configuration
- `viewports`: **`1920x1080,768x1024,375x667`** - Desktop, tablet, mobile
- `test-timeout`: **`5m`** - 5 minutes per test
- `max-routes`: **`10`** - Prevents runaway tests
- `test-routes`: **`''`** - Empty means auto-detect from changes

### 💾 Storage
- `storage-provider`: **`auto`** - Auto-detects Firebase or S3
- `aws-region`: **`us-east-1`** - Default AWS region
- `cleanup-days`: **`30`** - Keep screenshots for 30 days

### 🤖 AI Features
- `enable-ai-navigation`: **`false`** - AI route discovery
- `enable-ai-test-generation`: **`false`** - AI test creation
- `clear-cache`: **`false`** - Keep route analysis cache

### 🔧 Technical
- `build-system`: **`''`** - Auto-detected from project
- `cache-ttl`: **`3600`** - 1 hour cache
- `mcp-provider`: **`built-in`** - Built-in browser automation
- `mcp-options`: **`{}`** - Empty options object

## Graceful Error Handling

YoFix handles errors gracefully and provides helpful feedback via GitHub comments:

### 1. **Input Validation**
Before running tests, YoFix validates all inputs and provides clear error messages:

```yaml
# ❌ This will fail with a helpful message
auth-email: 'test@example.com'
# Missing auth-password!
```

**Error Comment**:
```markdown
### ❌ YoFix encountered an error

**Error**: Authentication configuration incomplete: Both auth-email and auth-password must be provided together

#### Troubleshooting Tips:
- 🔐 **Authentication Issue**: Check your test credentials
- 🤖 Try `auth-mode: smart` if LLM auth fails
- 📍 Verify `auth-login-url` points to the correct login page
```

### 2. **Missing Optional Configurations**
YoFix warns but continues when optional configs are missing:

```yaml
# No storage configured - YoFix will warn but continue
# firebase-credentials: (not provided)
# s3-bucket: (not provided)
```

**Warning in logs**:
```
⚠️ No storage provider configured. Screenshots will not be persisted. Configure firebase-credentials or use S3 storage.
```

### 3. **API Key Issues**
Clear guidance when API keys are invalid:

**Error Comment**:
```markdown
### ❌ YoFix encountered an error

**Error**: 401 authentication_error

#### Troubleshooting Tips:
- 🔑 **API Key Issue**: Verify your Claude API key is valid and has sufficient credits
- 📋 Set `CLAUDE_API_KEY` secret in your repository settings
```

### 4. **Preview URL Issues**
Helpful tips when preview URLs fail:

**Error Comment**:
```markdown
### ❌ YoFix encountered an error

**Error**: Preview URL not accessible

#### Troubleshooting Tips:
- 🌐 **Preview URL Issue**: The preview URL might not be accessible
- ⏳ Wait for deployment to complete before running YoFix
- 🔒 Check if the URL requires authentication
```

## Validation Rules

### Viewport Format
- ✅ Valid: `1920x1080`, `768x1024`, `375x667`
- ❌ Invalid: `1920×1080`, `1920*1080`, `mobile`

### Timeout Format
- ✅ Valid: `30s`, `5m`, `30000`
- ❌ Invalid: `30 seconds`, `5 minutes`

### Auth Mode
- ✅ Valid: `llm`, `selectors`, `smart`
- ❌ Invalid: `ai`, `auto`, `manual`

## Error Recovery Strategies

1. **Authentication Failures**
   - Falls back from `llm` → `smart` → `selectors`
   - Reports which method succeeded

2. **Storage Failures**
   - Continues testing without persistence
   - Warns in logs and comments

3. **Route Detection Failures**
   - Falls back to testing homepage (`/`)
   - Still completes visual testing

4. **API Rate Limits**
   - Implements exponential backoff
   - Caches results to reduce API calls

## Best Practices

1. **Start Simple**
   ```yaml
   - uses: yofix/yofix@v1
     with:
       preview-url: ${{ steps.deploy.outputs.preview-url }}
       github-token: ${{ secrets.GITHUB_TOKEN }}
       claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
   ```

2. **Add Authentication When Needed**
   ```yaml
   auth-email: ${{ secrets.TEST_EMAIL }}
   auth-password: ${{ secrets.TEST_PASSWORD }}
   # auth-mode defaults to 'llm' - no need to specify!
   ```

3. **Configure Storage for Baselines**
   ```yaml
   firebase-credentials: ${{ secrets.FIREBASE_CREDENTIALS }}
   storage-bucket: 'my-yofix-baselines'
   ```

## Error Reporting Examples

### Bot Command Errors
When bot commands fail, users see immediate feedback:

```
@yofix scan /dashboard
```

**Response**:
```markdown
❌ Scan failed: No preview URL found for this PR

Please ensure your preview deployment is complete and try again.
```

### Progressive Updates
Even during errors, YoFix provides context:

```markdown
🔄 **Processing `@yofix test`**

⏳ Initializing...
✅ Found preview URL
⚠️ No authentication configured - testing public routes only
🔍 Analyzing 3 routes...
❌ Error: API rate limit exceeded

Please wait a few minutes and try again.
```

## Summary

YoFix is designed to:
- ✅ Work with minimal configuration
- ✅ Provide clear error messages
- ✅ Fail gracefully with helpful tips
- ✅ Post errors to PR comments for visibility
- ✅ Continue testing when possible despite errors

The combination of sensible defaults and comprehensive error handling ensures a smooth experience for all users!