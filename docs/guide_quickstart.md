# YoFix Quick Start Guide

Get YoFix running in your repository in under 5 minutes!

## Prerequisites

- GitHub repository with a web application (React, Next.js, Vue, etc.)
- Firebase project or AWS account (for storage)
- Claude API key from Anthropic

## Step 1: Get API Keys

### Claude API Key
1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Add to GitHub Secrets: `CLAUDE_API_KEY`

### Storage Setup (Choose One)

#### Option A: Firebase (Recommended)
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Storage
3. Create service account key
4. Encode it: `base64 -i service-account.json`
5. Add to GitHub Secrets: `FIREBASE_SERVICE_ACCOUNT`

#### Option B: AWS S3
1. Create S3 bucket
2. Create IAM user with S3 access
3. Add to GitHub Secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`

## Step 2: Add YoFix Workflow

Create `.github/workflows/yofix.yml`:

```yaml
name: Visual Testing

on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  yofix:
    if: |
      github.event_name == 'pull_request' || 
      (github.event.issue.pull_request && contains(github.event.comment.body, '@yofix'))
    
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      # Deploy your app (example with Vercel)
      - name: Deploy Preview
        id: deploy
        run: |
          # Your deployment command here
          # Example: vercel --token=${{ secrets.VERCEL_TOKEN }}
          echo "url=https://your-app-pr-${{ github.event.number }}.vercel.app" >> $GITHUB_OUTPUT
      
      # Run YoFix
      - uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.url }}
          github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          
          # Firebase Storage
          firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          storage-bucket: your-project.appspot.com
          
          # OR AWS S3 Storage
          # s3-bucket: your-bucket-name
          # aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          # aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Step 3: Configure Secrets

Add these secrets to your repository:
1. Go to Settings → Secrets → Actions
2. Add required secrets:
   - `CLAUDE_API_KEY` - Your Anthropic API key
   - `FIREBASE_SERVICE_ACCOUNT` - Base64 encoded Firebase credentials
   - OR AWS credentials if using S3

## Step 4: Create a Pull Request

1. Make a UI change in your code
2. Create a pull request
3. YoFix will automatically:
   - Detect routes in your app
   - Capture screenshots
   - Identify visual issues
   - Post results as a comment

## Step 5: Use Bot Commands

In PR comments, you can use:
- `@yofix scan` - Run visual tests
- `@yofix scan /specific-route` - Test specific route
- `@yofix fix` - Generate fix suggestions
- `@yofix help` - Show all commands

## Example: Next.js App

```yaml
name: YoFix Visual Testing

on:
  pull_request:
  issue_comment:
    types: [created]

jobs:
  deploy-and-test:
    if: |
      github.event_name == 'pull_request' || 
      (github.event.issue.pull_request && contains(github.event.comment.body, '@yofix'))
    
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - run: npm ci
      - run: npm run build
      
      # Deploy to Vercel
      - name: Deploy to Vercel
        id: deploy
        run: |
          npm i -g vercel
          url=$(vercel --token=${{ secrets.VERCEL_TOKEN }} --yes)
          echo "url=$url" >> $GITHUB_OUTPUT
        
      # Run YoFix
      - uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.url }}
          github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          storage-bucket: ${{ vars.STORAGE_BUCKET }}
          viewports: '1920x1080,768x1024,375x667'
          max-routes: '20'
```

## Example: Authenticated Routes

If your app requires login:

```yaml
- uses: yofix/yofix@v1
  with:
    preview-url: ${{ steps.deploy.outputs.url }}
    github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
    claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
    firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
    storage-bucket: ${{ vars.STORAGE_BUCKET }}
    
    # Authentication
    auth-email: ${{ secrets.TEST_USER_EMAIL }}
    auth-password: ${{ secrets.TEST_USER_PASSWORD }}
    auth-login-url: '/login'  # Your login page path
```

## Troubleshooting

### "No routes detected"
- Ensure your app uses React Router, Next.js routing, or Vue Router
- Check that your deployment URL is accessible
- Try specifying routes manually with `@yofix scan /home /about`

### "Storage upload failed"
- Verify Firebase credentials are base64 encoded
- Check bucket name matches your Firebase project
- Ensure Storage is enabled in Firebase Console

### "Authentication failed"
- Verify test user credentials are correct
- Check login URL path matches your app
- Ensure login form uses standard input names

## Advanced Configuration

### Custom Viewports
```yaml
viewports: '1920x1080,1440x900,768x1024,375x667'
```

### Redis Caching
```yaml
redis-url: ${{ secrets.REDIS_URL }}
cache-ttl: '7200'  # 2 hours
```

### Specific Routes Only
```yaml
routes: '/home,/dashboard,/profile'
```

## Next Steps

1. **Customize Settings**: Adjust viewports, routes, and thresholds
2. **Add to More Repos**: Use organization secrets for easy setup
3. **Monitor Results**: Check YoFix comments on PRs
4. **Join Community**: Get help and share feedback

## Getting Help

- 📚 [Full Documentation](https://docs.yofix.dev)
- 💬 [GitHub Discussions](https://github.com/yofix/yofix/discussions)
- 🐛 [Report Issues](https://github.com/yofix/yofix/issues)
- 📧 [Email Support](mailto:support@yofix.dev)

## Example PR Comment

After setup, YoFix will comment on your PRs like:

```
## 🔍 YoFix Visual Test Results

**Status**: ⚠️ Issues Found

### 📸 Screenshots Captured
- ✅ `/home` - Desktop, Tablet, Mobile
- ✅ `/about` - Desktop, Tablet, Mobile  
- ⚠️ `/contact` - Desktop (layout shift detected)

### 🎯 Issues Detected
1. **Layout Shift** on `/contact` at 1920x1080
   - Element `.contact-form` overlaps with `.footer`
   - Severity: High

### 💡 Suggested Fixes
Run `@yofix fix` to generate code suggestions for these issues.

[View Full Report](https://your-storage.com/report) | [View Screenshots](https://your-storage.com/screenshots)
```

Ready to get started? Create your first PR and see YoFix in action! 🚀