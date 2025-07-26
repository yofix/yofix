# YoFix 🔧

> AI-powered visual issue detection and auto-fix for web applications

[![GitHub Action](https://img.shields.io/badge/GitHub-Action-blue)](https://github.com/marketplace/actions/yofix)
[![npm version](https://img.shields.io/npm/v/yofix)](https://www.npmjs.com/package/yofix)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

YoFix automatically detects visual issues in your web applications and generates fixes for them. Using AI-powered analysis, it can identify layout problems, responsive issues, and other visual bugs, then provide ready-to-apply code fixes.

## ✨ Features

- 🔍 **Smart Detection**: Automatically finds visual issues using AI
- 🔧 **Auto-Fix Generation**: Creates code fixes for detected issues
- 🤖 **GitHub Bot**: Interactive bot responds to PR comments
- 📱 **Responsive Testing**: Tests across multiple viewports
- 🎯 **Framework Aware**: Understands React, Vue, Angular, and more
- 💬 **Conversational**: Refine fixes through natural language
- 📊 **Detailed Reports**: Visual comparisons and fix explanations

## 🚀 Quick Start

### As a GitHub Action

```yaml
name: Visual Testing
on: [pull_request]

jobs:
  yofix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: YoFix Analysis
        uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.url }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
```

### As a CLI Tool

```bash
# Install globally
npm install -g yofix

# Initialize in your project
yofix init

# Scan for issues
yofix scan https://your-app.com

# Generate and apply fixes
yofix fix --apply
```

### As a GitHub Bot

Simply comment on any PR:

```
@yofix scan
```

YoFix will analyze your changes and respond with findings and fixes.

## 🤖 Bot Commands

| Command | Description |
|---------|-------------|
| `@yofix scan` | Run full visual analysis |
| `@yofix scan /route` | Scan specific route |
| `@yofix fix` | Generate fixes for all issues |
| `@yofix fix #3` | Fix specific issue |
| `@yofix explain #2` | Get detailed explanation |
| `@yofix preview` | Preview fixes before applying |
| `@yofix apply` | Apply suggested fixes |
| `@yofix baseline update` | Update visual baseline |
| `@yofix help` | Show all commands |

## 📋 Example Response

```markdown
## 🔧 YoFix Analysis Report

### Issues Found: 3
- 🚨 Critical: Mobile navigation overlap
- ⚠️ Warning: Button misalignment on tablet
- 💡 Info: Suboptimal image sizing

### Available Fixes: 3/3 ✅

<details>
<summary>View Details & Fixes</summary>

**Issue #1: Mobile Navigation Overlap**
- **Severity**: Critical
- **Affected**: screens < 768px
- **Fix**:
```css
@media (max-width: 768px) {
  .nav-menu {
    position: fixed;
    transform: translateX(-100%);
  }
}
```
</details>

💬 Reply with: `@yofix apply` to apply all fixes
```

## ⚙️ Configuration

Create a `.yofix.yml` file in your project root:

```yaml
version: 1

# Scanning options
scan:
  routes: auto  # or specify: ['/home', '/about']
  viewports: 
    - desktop: 1920x1080
    - tablet: 768x1024
    - mobile: 375x667
  threshold: 0.1  # 10% visual difference threshold

# Fix preferences
fixes:
  autoApply: false
  style: minimal  # or: comprehensive
  frameworks:
    - css
    - tailwind
    - styled-components

# AI settings
ai:
  model: claude-3-haiku  # or: claude-3-opus
  confidence: 0.8

# Integrations
integrations:
  slack:
    webhook: ${SLACK_WEBHOOK}
    notify_on: [critical, high]
```

## 🛠️ Supported Frameworks

- ✅ React (CRA, Next.js, Vite)
- ✅ Vue.js
- ✅ Angular
- ✅ Svelte
- ✅ Plain HTML/CSS
- ✅ Tailwind CSS
- ✅ Styled Components
- ✅ CSS Modules

## 📊 How It Works

1. **Capture**: Takes screenshots across different viewports
2. **Analyze**: Uses AI to detect visual issues
3. **Diagnose**: Maps issues to code locations
4. **Fix**: Generates appropriate code fixes
5. **Validate**: Tests fixes in isolation
6. **Report**: Presents findings with confidence scores

## 🔒 Security & Privacy

- All analysis happens in isolated environments
- Screenshots are temporarily stored and auto-deleted
- Code is never stored permanently
- Compliant with SOC2 and GDPR

## 💰 Pricing

YoFix uses a pay-per-scan model:
- **Free tier**: 100 scans/month
- **Pro**: $29/month for 1000 scans
- **Enterprise**: Custom pricing

Each PR typically uses 5-10 scans.

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📚 Documentation

- [Getting Started](https://yofix.dev/docs/getting-started)
- [Configuration](https://yofix.dev/docs/configuration)
- [Bot Commands](https://yofix.dev/docs/bot-commands)
- [API Reference](https://yofix.dev/docs/api)
- [Examples](https://yofix.dev/docs/examples)

## 🆘 Support

- 📧 Email: support@yofix.dev
- 💬 Discord: [Join our community](https://discord.gg/yofix)
- 🐛 Issues: [GitHub Issues](https://github.com/yofix/yofix/issues)

## 📄 License

MIT © YoFix

---

Made with ❤️ by the YoFix team. If YoFix helps you ship better UIs, consider [starring us on GitHub](https://github.com/yofix/yofix)!