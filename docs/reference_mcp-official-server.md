# Using Official Playwright MCP Server with YoFix

YoFix supports both its built-in MCP implementation and the official Microsoft Playwright MCP server. This guide explains how to use the official server for more advanced browser automation capabilities.

## Why Use the Official Server?

### Advantages
- **Full Playwright API**: Access to all Playwright features
- **Active Development**: Maintained by Microsoft
- **Better Tooling**: Enhanced debugging and inspection
- **Standard Protocol**: Compatible with other MCP tools
- **Advanced Features**: Network interception, browser contexts, etc.

### Trade-offs
- **Additional Dependency**: Requires installing `@modelcontextprotocol/server-playwright`
- **Less Integration**: Not as tightly integrated with YoFix workflows
- **Security Considerations**: Requires careful sandboxing

## Installation

### 1. Install the Official Server

```bash
npm install @modelcontextprotocol/server-playwright
```

### 2. Configure YoFix

Add to your workflow:

```yaml
- uses: yofix/yofix@v1
  with:
    # ... other options ...
    mcp-provider: 'playwright-official'  # Use official server
    mcp-options: |
      {
        "headless": true,
        "timeout": 60000,
        "debug": false
      }
```

Or configure in `.yofix.yml`:

```yaml
mcp:
  provider: playwright-official
  options:
    headless: true
    timeout: 60000
    viewport:
      width: 1920
      height: 1080
    # Security restrictions
    security:
      allowedDomains:
        - "*.myapp.com"
        - "localhost"
      blockedPaths:
        - "/admin"
        - "/api/internal"
```

## Usage Examples

### Basic Navigation Test

```bash
@yofix browser "navigate to /products and take screenshot"
```

### Complex User Flow

```bash
@yofix browser """
// Using Playwright API directly
await page.goto('/login');
await page.fill('[name="email"]', 'test@example.com');
await page.fill('[name="password"]', 'password');
await page.click('button[type="submit"]');
await page.waitForSelector('.dashboard');
const metrics = await page.evaluate(() => ({
  loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
  domNodes: document.querySelectorAll('*').length
}));
return metrics;
"""
```

### Network Interception

```bash
@yofix browser """
// Monitor API calls
const apiCalls = [];
page.on('request', request => {
  if (request.url().includes('/api/')) {
    apiCalls.push({
      url: request.url(),
      method: request.method()
    });
  }
});
await page.goto('/dashboard');
await page.waitForTimeout(2000);
return apiCalls;
"""
```

## Security Configuration

When using the official server, YoFix applies additional security measures:

### Domain Restrictions

```yaml
security:
  allowedDomains:
    - "*.myapp.com"
    - "preview-*.vercel.app"
  blockedDomains:
    - "*.internal.com"
    - "localhost:*"
```

### Script Validation

```yaml
security:
  scriptValidation: strict
  blockedKeywords:
    - "process"
    - "require"
    - "fs"
    - "__dirname"
  maxScriptLength: 10000
```

### Resource Limits

```yaml
security:
  maxExecutionTime: 60000  # 60 seconds
  maxMemory: 512  # MB
  maxConcurrentPages: 3
```

## Advanced Features

### Multiple Browser Contexts

```bash
@yofix browser """
// Test with different user roles
const adminContext = await browser.newContext({
  storageState: './admin-auth.json'
});
const userContext = await browser.newContext({
  storageState: './user-auth.json'
});

const adminPage = await adminContext.newPage();
const userPage = await userContext.newPage();

// Test admin features
await adminPage.goto('/admin/dashboard');
const adminCanSeeReports = await adminPage.isVisible('.reports-section');

// Test user restrictions
await userPage.goto('/admin/dashboard');
const userRedirected = userPage.url().includes('/unauthorized');

return {
  adminCanSeeReports,
  userRedirected
};
"""
```

### Performance Testing

```bash
@yofix browser """
// Measure Core Web Vitals
await page.goto('/');
const metrics = await page.evaluate(() => {
  return new Promise((resolve) => {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const fcp = entries.find(e => e.name === 'first-contentful-paint');
      const lcp = entries.find(e => e.entryType === 'largest-contentful-paint');
      resolve({
        FCP: fcp?.startTime,
        LCP: lcp?.startTime
      });
    }).observe({ entryTypes: ['paint', 'largest-contentful-paint'] });
  });
});
return metrics;
"""
```

### Visual Regression with Custom Logic

```bash
@yofix browser """
// Custom visual comparison
const screenshot1 = await page.screenshot({ fullPage: true });
await page.click('.toggle-theme');
await page.waitForTimeout(500);
const screenshot2 = await page.screenshot({ fullPage: true });

// Return base64 for YoFix to analyze
return {
  before: screenshot1.toString('base64'),
  after: screenshot2.toString('base64'),
  action: 'theme-toggle'
};
"""
```

## Comparison: Built-in vs Official

| Feature | Built-in MCP | Official Server |
|---------|--------------|-----------------|
| Setup | No additional deps | Requires npm install |
| API Coverage | Common actions | Full Playwright API |
| Natural Language | Optimized for YoFix | Generic support |
| Security | Integrated sandbox | Requires configuration |
| Performance | Lightweight | More resource intensive |
| Debugging | Basic | Advanced tools |
| Maintenance | YoFix team | Microsoft |

## Migration Guide

To migrate from built-in to official:

1. **Update Configuration**
   ```yaml
   mcp:
     provider: playwright-official  # was: playwright
   ```

2. **Update Commands**
   - Natural language commands work the same
   - Direct API calls now have full Playwright access

3. **Add Security Rules**
   ```yaml
   security:
     allowedDomains: ["*.myapp.com"]
     scriptValidation: strict
   ```

4. **Test Thoroughly**
   - Verify existing commands still work
   - Check security restrictions
   - Monitor performance

## Troubleshooting

### Server Won't Start
```bash
# Check if server is installed
npx @modelcontextprotocol/server-playwright --version

# Install globally if needed
npm install -g @modelcontextprotocol/server-playwright
```

### Security Errors
- Check domain allowlist
- Verify script doesn't use blocked keywords
- Ensure resource limits aren't exceeded

### Performance Issues
- Reduce viewport size
- Enable headless mode
- Limit concurrent pages

## Best Practices

1. **Use Natural Language When Possible**
   - Easier to maintain
   - Better security
   - More readable

2. **Validate User Input**
   - Never execute untrusted scripts
   - Use parameterized commands
   - Limit execution scope

3. **Monitor Resource Usage**
   - Set appropriate timeouts
   - Clean up browser contexts
   - Track memory usage

4. **Leverage YoFix Integration**
   - Combine with visual analysis
   - Use fix suggestions
   - Integrate with baseline management

## Next Steps

1. Try the official server in a test environment
2. Gradually migrate complex tests
3. Monitor performance and security
4. Contribute improvements back to YoFix

For more information, see:
- [Playwright MCP Server](https://github.com/microsoft/playwright-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [YoFix MCP Integration](./mcp-integration.md)