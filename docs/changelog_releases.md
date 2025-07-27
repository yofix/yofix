# Changelog

All notable changes to YoFix will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- AWS S3 storage provider as alternative to Firebase Storage
- Storage provider auto-detection from environment variables
- Redis caching support for AI responses and expensive operations
- Comprehensive storage setup documentation
- GitHub Action marketplace publishing guide
- Quick start guide for new users

### Changed
- Storage configuration now supports multiple providers (Firebase, S3)
- Action inputs reorganized for better clarity
- Cache manager now falls back to in-memory when Redis unavailable

### Fixed
- TypeScript type definitions for storage providers
- Environment variable handling for optional configurations

## [1.0.0] - 2024-01-XX

### Added
- 🤖 AI-powered visual issue detection using Claude Sonnet
- 🔧 Automatic fix generation with code suggestions
- 📸 Multi-viewport screenshot capture (desktop, tablet, mobile)
- 🎯 Intelligent route detection for React, Next.js, and Vue apps
- 💬 Natural language bot commands (@yofix scan, @yofix fix)
- 🔐 Authentication support for protected routes
- 📊 Visual regression testing with baseline management
- 🎨 Smart fix templates for common UI issues:
  - Layout shifts and element overlap
  - Responsive breakpoint issues
  - Text overflow problems
  - Button sizing issues
  - Color contrast improvements
  - Hover state fixes
  - Spacing consistency
  - Alignment corrections
- 🧠 Codebase context analysis:
  - AST parsing for route extraction
  - Component dependency mapping
  - Style system detection (CSS/Tailwind/styled-components)
  - Pattern matching for contextual fixes
- 🖼️ Advanced baseline management:
  - Visual diff algorithm
  - Smart baseline selection strategies
  - Version control integration
- ⚡ Performance optimizations:
  - WebP image conversion
  - Intelligent caching system
  - Batch processing for AI calls
  - Request queuing
- 🔌 MCP (Model Context Protocol) integration:
  - Browser automation support
  - Natural language command parsing
  - Security sandbox for safe execution
- 📝 Comprehensive PR reporting:
  - Visual test summaries
  - Issue detection with severity levels
  - Fix suggestions with confidence scores
  - Direct links to screenshots and reports

### Technical Stack
- **Core**: TypeScript, Node.js
- **Testing**: Playwright for browser automation
- **AI**: Claude API (Anthropic)
- **Storage**: Firebase Storage (primary), AWS S3 (alternative)
- **Caching**: Redis with in-memory fallback
- **Image Processing**: Sharp for optimization
- **CI/CD**: GitHub Actions

### Supported Frameworks
- React (with React Router)
- Next.js (Pages Router and App Router)
- Vue.js (with Vue Router)
- Static sites
- Any JavaScript framework with standard routing

### Coming Soon
- Core Web Vitals testing
- Accessibility testing with axe-core
- Slack integration
- GitHub App for easier installation
- More storage providers (Azure, GCS)
- Custom AI model training
- Enterprise features (SSO, audit logs)

---

## Development History

### Phase 1: MVP Core (Weeks 1-2) ✅
- Week 1: Foundation
  - Real fix generation with AI
  - Codebase context system
  - Pattern matching and validation
- Week 2: Core Features
  - Baseline management system
  - Performance optimization
  - Caching implementation

### Phase 2: Enhanced Features (Weeks 3-4) 🚧
- Week 3: MCP browser automation ✅
- Week 4: Advanced testing capabilities (in progress)

[Unreleased]: https://github.com/yofix/yofix/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yofix/yofix/releases/tag/v1.0.0