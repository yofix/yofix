# YoFix Natural Language Bot Commands Guide

## How Bot Commands Work

YoFix runs as a GitHub Action that listens for comments on PRs. When someone mentions `@yofix` in a PR comment, the action triggers and processes the command.

## Architecture Flow

```
User PR Comment → GitHub Webhook → YoFix Action → Command Processing → Response
      ↓                                ↓                    ↓
   "@yofix..."              Triggered on issue_comment   Natural Language
                                                           Parser
```

## Your Example: Multi-Resolution Screenshot with Accessibility

### Command
```
@yofix browser "Go to /users and take the screenshot of desktop, mobile and tab resolution, then analyse the accessibility issues"
```

### How It Works

1. **GitHub Workflow Setup**
```yaml
# .github/workflows/yofix.yml
name: YoFix Visual Testing

on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:  # ← This enables bot commands
    types: [created]

jobs:
  yofix:
    if: |
      github.event_name == 'pull_request' || 
      (github.event.issue.pull_request && contains(github.event.comment.body, '@yofix'))
    
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      # Checkout PR for comment triggers
      - name: Checkout PR
        if: github.event_name == 'issue_comment'
        run: gh pr checkout ${{ github.event.issue.number }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      # Run YoFix
      - uses: yofix/yofix@v1
        with:
          preview-url: https://preview-pr-${{ github.event.issue.number }}.vercel.app
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          storage-bucket: your-screenshots
```

2. **Natural Language Processing**

The command is parsed into structured actions:

```javascript
// NaturalLanguageParser converts to:
[
  { type: 'navigate', url: '/users' },
  { type: 'screenshot', viewport: 'desktop' },
  { type: 'screenshot', viewport: 'mobile' },
  { type: 'screenshot', viewport: 'tablet' },
  { type: 'analyze', target: 'accessibility' }
]
```

3. **Execution Flow**

```javascript
// MCPCommandHandler.ts
async executeBrowserCommand(command: string, context: BrowserContext) {
  // Parse natural language
  const actions = this.parser.parse(command);
  
  // Execute each action
  for (const action of actions) {
    switch (action.type) {
      case 'navigate':
        await this.page.goto(context.previewUrl + action.url);
        break;
        
      case 'screenshot':
        await this.captureScreenshot(action.viewport);
        break;
        
      case 'analyze':
        await this.runAccessibilityAnalysis();
        break;
    }
  }
}
```

4. **Bot Response**

YoFix posts results back to the PR:

```markdown
## 🤖 Browser Command Results

✅ Successfully executed: "Go to /users and take screenshots..."

### 📸 Screenshots Captured
- Desktop (1920x1080): [View](https://storage.com/desktop.png)
- Mobile (375x667): [View](https://storage.com/mobile.png)  
- Tablet (768x1024): [View](https://storage.com/tablet.png)

### ♿ Accessibility Analysis

**Issues Found: 3**

1. **Missing Alt Text** (High)
   - Element: `<img src="user-avatar.jpg">`
   - WCAG: 1.1.1 Non-text Content
   
2. **Low Contrast** (Medium)
   - Element: `.user-status`
   - Ratio: 3.2:1 (Required: 4.5:1)
   
3. **Missing Form Labels** (High)
   - Element: `<input type="email">`
   - WCAG: 3.3.2 Labels or Instructions

[View Full Report](https://yofix.dev/reports/123)
```

## More Natural Language Examples

### 1. Complex User Flow
```
@yofix browser "Login with test@example.com, navigate to dashboard, click on settings, verify dark mode toggle works"
```

### 2. Performance Testing
```
@yofix browser "Go to /products, measure page load time, scroll to bottom, check if all images loaded"
```

### 3. Responsive Testing
```
@yofix browser "Check /home on mobile, tablet, and desktop - ensure navigation menu adapts correctly"
```

### 4. Form Validation
```
@yofix browser "Go to /signup, try submitting empty form, verify error messages appear"
```

### 5. Visual Regression
```
@yofix browser "Navigate to /pricing, take screenshot, toggle annual billing, take another screenshot, compare them"
```

## Advanced Patterns

### Multi-Step Workflows
```
@yofix browser """
1. Go to /products
2. Filter by category "Electronics"
3. Sort by price ascending
4. Verify first item is under $50
5. Click on first product
6. Check if reviews section loads
"""
```

### Conditional Actions
```
@yofix browser "If logged in, go to /profile; otherwise go to /login and sign in first"
```

### Data Extraction
```
@yofix browser "Go to /api/status and extract the JSON response, verify all services are 'operational'"
```

## How Commands Are Processed

1. **Command Detection**
   - GitHub webhook fires on `issue_comment`
   - Action checks if comment contains `@yofix`
   - Extracts command after mention

2. **Authentication**
   - Verifies GitHub token
   - Checks user permissions
   - Validates PR status

3. **Environment Setup**
   - Gets preview URL
   - Initializes browser (Playwright)
   - Sets up storage connections

4. **Command Execution**
   - Natural language parsing
   - Security validation
   - Action execution
   - Result collection

5. **Response Generation**
   - Format results as markdown
   - Upload screenshots/reports
   - Post comment to PR
   - Update PR status

## Security & Limitations

### Security Measures
- Commands run in sandboxed environment
- URLs restricted to preview domains
- Script execution blocked
- Timeout limits (60 seconds)
- Rate limiting per PR

### Limitations
- Cannot access production URLs
- No file system access
- No network requests outside preview
- Limited to browser automation only
- Max execution time enforced

## Custom Implementations

### Adding New Commands
```javascript
// In your fork, extend NaturalLanguageParser
this.commandPatterns.set('custom', [
  /your custom pattern here/i
]);
```

### Custom Analysis
```javascript
// Extend MCPCommandHandler
async handleCustomAnalysis(command: string) {
  // Your analysis logic
  const results = await this.analyzeCustomMetric();
  return this.formatResults(results);
}
```

## Troubleshooting

### Command Not Recognized
- Check workflow has `issue_comment` trigger
- Verify `@yofix` mention is exact
- Ensure quotes around complex commands

### No Response
- Check GitHub token permissions
- Verify action is running (Actions tab)
- Check preview URL is accessible

### Timeout Issues
- Break complex commands into steps
- Use explicit waits for slow pages
- Reduce screenshot resolutions

## Best Practices

1. **Be Specific**
   ```
   ❌ "Check the page"
   ✅ "Go to /home and verify hero section is visible"
   ```

2. **Use Quotes for Complex Commands**
   ```
   @yofix browser "multi-line
   command here"
   ```

3. **Chain Related Actions**
   ```
   @yofix browser "login > go to dashboard > check metrics"
   ```

4. **Specify Viewports Clearly**
   ```
   @yofix browser "screenshot on mobile (375px), tablet (768px), desktop (1920px)"
   ```

5. **Include Verification**
   ```
   @yofix browser "click submit and verify success message appears"
   ```

This natural language interface makes YoFix accessible to non-technical team members while maintaining the power of programmatic testing!