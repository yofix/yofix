# YoFix Documentation

## 📚 Documentation Structure

### 🚀 Getting Started
- [**Quick Start Guide**](guide_quickstart.md) - Get YoFix running in 5 minutes
- [**Integration Guide**](guide_integration.md) - Integrate YoFix into your workflow
- [**CLI Usage**](guide_cli-usage.md) - Command line interface reference

### 📖 User Guides
- [**Deployment Guide**](guide_deployment.md) - Deploy YoFix in production
- [**Publishing Guide**](guide_publishing.md) - Complete guide to publish on GitHub Marketplace
- [**Bot Natural Language**](guide_bot-natural-language.md) - Using natural language commands
- [**Browser Automation Examples**](guide_browser-automation-examples.md) - Example automation scripts
- [**Local Development**](guide_local-development.md) - Set up local development environment
- [**Testing Before Release**](guide_testing-before-release.md) - Pre-release testing checklist

### ⚙️ Configuration
- [**Secrets Setup Guide**](guide_secrets-setup.md) - Complete guide for API keys and secrets
- [**Authentication Setup**](config_authentication.md) - Configure authentication
- [**Storage Setup**](config_storage-setup.md) - Configure storage providers (Firebase/S3)
- [**Production URL Setup**](config_production-url-setup.md) - Configure production URL
- [**Configuration System**](config_configuration-system.md) - Understanding the config system
- [**Defaults and Error Handling**](config_defaults-and-error-handling.md) - Config defaults

### 🏗️ Architecture & Development
- [**Code Structure**](reference_code-structure.md) - Source code organization
- [**GitHub Service Factory**](guide_github-service-factory.md) - Centralized GitHub integration
- [**Hook Architecture**](guide_hook-architecture.md) - Hook system design
- [**Centralized Utilities**](guide_centralized-utilities.md) - Core utilities
- [**Centralized Error Handling**](guide_centralized-error-handling.md) - Error management

### 🔧 Technical Guides
- [**Baseline Creation**](guide_baseline-creation.md) - Visual baseline management
- [**LLM Authentication**](guide_llm-authentication.md) - AI-powered auth
- [**Migration to Browser Agent**](guide_migration-to-browser-agent.md) - Browser automation migration
- [**Fix Hanging Browser Agent**](guide_fix-hanging-browser-agent.md) - Troubleshooting guide

### 📝 Reference
- [**PR Workflow**](reference_pr-workflow.md) - Pull request workflow details
- [**GitHub API Usage**](reference_github-api-usage.md) - GitHub API integration
- [**MCP Integration**](reference_mcp-integration.md) - Model Context Protocol
- [**MCP Official Server**](reference_mcp-official-server.md) - Using official Playwright MCP
- [**Browser Agent vs Browser Use**](reference_browser-agent-vs-browser-use.md) - Comparison
- [**Visual Testing Improvements**](reference_visual-testing-improvements.md) - Testing enhancements

### 📅 Changelog
- [**Cleanup Summary**](changelog_cleanup-summary.md) - Recent code cleanup history

## 🗂️ Documentation Naming Convention

All documentation follows this naming pattern:
- `guide_` - How-to guides and tutorials
- `config_` - Configuration documentation
- `reference_` - API references and technical specs
- `changelog_` - Release notes and change logs
- `feature_` - Feature documentation

## 🔍 Quick Links

### For Users
1. Start with [Quick Start Guide](guide_quickstart.md)
2. Configure with [Storage Setup](config_storage-setup.md)
3. Learn commands in [Bot Natural Language](guide_bot-natural-language.md)

### For Contributors
1. Understand [Code Structure](reference_code-structure.md)
2. Review [Architecture Guides](guide_github-service-factory.md)
3. Check [Cleanup Summary](changelog_cleanup-summary.md) for recent changes

### For Deployment
1. Follow [Deployment Guide](guide_deployment.md)
2. Use [Publishing Guide](guide_publishing.md) for GitHub Marketplace

## 📌 Recent Major Changes (Nov 2024)

- **Route Analysis**: Now using external `route-impact-analyzer` package
- **File Naming**: Removed confusing "Smart/Dynamic" prefixes
- **Code Cleanup**: Removed ~4,300 lines of dead/redundant code
- **Bundle Size**: Reduced from 5.9MB to 4.2MB (-28.8%)

See [DEPRECATION.md](../DEPRECATION.md) and [CLAUDE.md](../CLAUDE.md) in root for migration guides.
