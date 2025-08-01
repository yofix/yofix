# YoFix 🔧

> AI-powered visual testing that automatically fixes UI issues in your PRs

[![GitHub Action](https://img.shields.io/badge/GitHub-Action-blue)](https://github.com/marketplace/actions/yofix)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

YoFix automatically detects visual issues in your web applications and generates fixes for them. Using AI-powered analysis, it can identify layout problems, responsive issues, and other visual bugs, then provide ready-to-apply code fixes directly in your pull requests.

## ✨ Features

- 🔍 **Smart Detection**: Automatically finds visual issues using AI
- 🔧 **Auto-Fix Generation**: Creates code fixes for detected issues  
- 🤖 **Natural Language Bot**: Interact with YoFix using plain English
- 📱 **Multi-Viewport Testing**: Tests across desktop, tablet, and mobile
- 🎯 **Framework Support**: React, Next.js, Vue, Angular, and more
- 📸 **Visual Baselines**: Track and compare UI changes over time
- 🔐 **LLM-Powered Auth**: AI understands any login form - no selectors needed!

## 🚀 Quick Start

### Installation

Add YoFix to your GitHub Actions workflow:

```yaml
name: Visual Testing
on: [pull_request]

jobs:
  yofix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # Deploy your preview (example with Vercel)
      - name: Deploy Preview
        id: deploy
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
      
      # Run YoFix Visual Testing
      - name: YoFix Analysis
        uses: yofix/yofix@v1
        with:
          # Required
          preview-url: ${{ steps.deploy.outputs.preview-url }}
          github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          
          # Storage (choose one)
          firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          storage-bucket: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
          # OR
          storage-provider: s3
          s3-bucket: ${{ secrets.S3_BUCKET }}
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          
          # Optional
          viewports: "1920x1080,768x1024,375x667"
          test-timeout: "30000"
          max-routes: "10"
```

## 📋 Prerequisites

Before using YoFix, you'll need:

### 1. Claude API Key
Get your API key from [console.anthropic.com](https://console.anthropic.com)

### 2. Storage Provider (choose one)

**Option A: Firebase Storage**
- Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
- Generate a service account key (Project Settings → Service Accounts)
- Base64 encode the JSON file: `base64 -i service-account.json`
- Set as `FIREBASE_SERVICE_ACCOUNT` secret

**Option B: AWS S3**
- Create an S3 bucket with public read access
- Create IAM user with S3 write permissions
- Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` secrets

### 3. GitHub Token
The `YOFIX_GITHUB_TOKEN` is automatically available in GitHub Actions

## 🤖 Bot Commands

YoFix responds to natural language commands in PR comments:

```
@yofix check if the navbar looks good on mobile
```

### Common Commands

| Command | Description |
|---------|-------------|
| `@yofix test this PR` | Run full visual analysis |
| `@yofix check the homepage` | Test specific route |
| `@yofix fix the mobile menu` | Generate specific fix |
| `@yofix the buttons are misaligned` | Report and fix issue |
| `@yofix test auth pages with login` | Test protected routes |
| `@yofix impact` | Show route impact tree |
| `@yofix update baseline` | Save current UI as baseline |

## 📊 Example Usage

### Basic Visual Testing

```yaml
- name: Visual Testing
  uses: yofix/yofix@v1
  with:
    preview-url: https://preview.example.com
    github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
    claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
    firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
    storage-bucket: my-app-screenshots
```

### With Authentication

```yaml
- name: Visual Testing with Auth
  uses: yofix/yofix@v1
  with:
    preview-url: https://preview.example.com
    github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
    claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
    firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
    storage-bucket: my-app-screenshots
    auth-email: test@example.com
    auth-password: ${{ secrets.TEST_PASSWORD }}
    auth-login-url: /login
```

### Custom Viewports

```yaml
- name: Visual Testing Custom Viewports
  uses: yofix/yofix@v1
  with:
    preview-url: https://preview.example.com
    github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
    claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
    firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
    storage-bucket: my-app-screenshots
    viewports: "1920x1080,1440x900,768x1024,375x812"
```

## 📋 Example Bot Response

```markdown
## 🔧 YoFix Analysis Complete

I found 3 visual issues in your PR:

### 🚨 Critical: Mobile Navigation Overlap
The navigation menu overlaps content on mobile devices (< 768px)

**Fix:**
```css
@media (max-width: 768px) {
  .nav-menu {
    position: fixed;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }
  .nav-menu.open {
    transform: translateX(0);
  }
}
```

### ⚠️ Warning: Button Misalignment
Buttons in the hero section are misaligned on tablet viewports

### 💡 Suggestion: Image Optimization
Large images could be optimized for better performance

---
📸 [View Screenshots](https://storage.googleapis.com/my-app/pr-123)
💬 Reply "@yofix apply fixes" to automatically apply these changes
```

## ⚙️ Configuration

### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `preview-url` | ✅ | - | URL of deployed preview |
| `github-token` | ✅ | - | GitHub token for PR comments |
| `claude-api-key` | ✅ | - | Claude API key |
| `firebase-credentials` | ✅* | - | Base64 encoded service account |
| `storage-bucket` | ✅* | - | Firebase storage bucket name |
| `storage-provider` | ❌ | `auto` | Storage provider: `firebase`, `s3`, `auto` |
| `s3-bucket` | ✅* | - | S3 bucket name (if using S3) |
| `aws-access-key-id` | ❌ | - | AWS access key (if using S3) |
| `aws-secret-access-key` | ❌ | - | AWS secret key (if using S3) |
| `viewports` | ❌ | `1920x1080,768x1024,375x667` | Comma-separated viewport sizes |
| `test-timeout` | ❌ | `30000` | Test timeout in milliseconds |
| `max-routes` | ❌ | `20` | Maximum routes to test |
| `auth-email` | ❌ | - | Auth email for protected routes |
| `auth-password` | ❌ | - | Auth password for protected routes |
| `auth-login-url` | ❌ | `/login` | Login page URL |
| `auth-mode` | ❌ | `llm` | Authentication mode: `llm` (AI-powered), `selectors`, or `smart` |
| `cleanup-days` | ❌ | `30` | Days to keep screenshots |

*Required based on storage provider choice

## 🛠️ Supported Frameworks

YoFix automatically detects and supports:

- **Frontend Frameworks**
  - React (CRA, Next.js, Gatsby, Remix)
  - Vue.js (Vue 2/3, Nuxt)
  - Angular
  - Svelte/SvelteKit
  - Solid.js
  - Qwik

- **Styling Solutions**
  - CSS/SCSS/LESS
  - Tailwind CSS
  - CSS Modules
  - Styled Components
  - Emotion
  - CSS-in-JS

## 📊 How It Works

1. **🔍 Route Discovery**: Automatically finds all routes in your app
2. **📸 Screenshot Capture**: Takes screenshots across viewports
3. **🤖 AI Analysis**: Detects visual issues and regressions
4. **🔧 Fix Generation**: Creates targeted code fixes
5. **💬 PR Integration**: Posts results as PR comments
6. **🚀 Apply Fixes**: Optionally auto-applies approved fixes

## 🔒 Security

- **Isolated Execution**: All tests run in isolated browser contexts
- **Temporary Storage**: Screenshots auto-delete after 30 days
- **No Code Storage**: Your source code is never stored
- **Encrypted Secrets**: All credentials are encrypted
- **SOC2 Type II**: Enterprise compliance available

## 🚀 Advanced Features

### Visual Baselines
Track UI changes over time:
```
@yofix update baseline for homepage
```

### Custom Test Flows
Test complex interactions:
```
@yofix test checkout flow: add item to cart, go to checkout, fill form
```

### Performance Metrics
Get performance insights:
```
@yofix measure performance for product pages
```

### Accessibility Checks
Ensure accessibility compliance:
```
@yofix check accessibility on all pages
```

## 🔧 Configuration System

YoFix supports flexible configuration through multiple sources. You can customize AI models, browser settings, timeouts, and more.

### Configuration File

Create a `.yofix.config.json` in your project root:

```json
{
  "ai": {
    "claude": {
      "defaultModel": "claude-3-5-sonnet-20241022",
      "temperature": 0.2
    }
  },
  "browser": {
    "headless": true,
    "defaultTimeout": 30000
  },
  "auth": {
    "defaultMode": "selectors",
    "selectorTimeout": 10000
  }
}
```

See [Configuration Documentation](docs/config_configuration-system.md) for all available options.

### Environment Variables

Override specific settings with environment variables:
- `YOFIX_AI_MODEL` - Claude model to use
- `YOFIX_BROWSER_HEADLESS` - Run headless (true/false)
- `YOFIX_LOG_LEVEL` - Logging level (debug/info/warn/error)

## 🔧 Troubleshooting

### PR Comments Not Posting?

If YoFix isn't posting comments to your PR:

1. **Check Permissions** - Ensure your workflow has write permissions:
   ```yaml
   permissions:
     contents: read
     pull-requests: write
     issues: write
   ```

2. **Use PR Event** - YoFix must run on pull request events:
   ```yaml
   on:
     pull_request:
       types: [opened, synchronize, reopened]
   ```

3. **Verify Token** - Ensure GitHub token is passed:
   ```yaml
   with:
     github-token: ${{ secrets.GITHUB_TOKEN }}
   ```

4. **Run Diagnostics** - Use our diagnostic script:
   ```bash
   node scripts/diagnose-comments.js
   ```

See [Ensure GitHub Comments Guide](docs/guide_ensure-github-comments.md) for detailed troubleshooting.

## 📚 Documentation

For detailed documentation, visit our [docs folder](docs/):

- [Quick Start Guide](docs/guide_quickstart.md)
- [Bot Commands](docs/guide_bot-natural-language.md)
- [Storage Setup](docs/config_storage-setup.md)
- [Authentication](docs/config_authentication.md)
- [Deployment Guide](docs/guide_deployment.md)
- [**Troubleshooting Comments**](docs/guide_ensure-github-comments.md) 🆕

## 🤝 Contributing

We welcome contributions! Check out:
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Development Setup](docs/guide_development.md)

## 📄 License

MIT © 2024 YoFix

---

<p align="center">
  Made with ❤️ by the YoFix team<br>
  <a href="https://github.com/yofix/yofix">⭐ Star us on GitHub</a> • 
  <a href="https://yofix.dev">🌐 Visit yofix.dev</a>
</p># yofix-action
# yofix-action
