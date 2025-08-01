# Changelog

All notable changes to this project will be documented in this file.

## [1.0.17] - 2024-08-01

### Added
- Support for custom login URLs with `auth-login-url` parameter
- Persistent authentication session across route tests
- Automatic re-authentication when session expires
- Authentication state saving for debugging
- Improved login form detection with multiple selector strategies

### Changed
- Visual tester now maintains browser context for session persistence
- Route extractor uses tree-sitter AST analysis with regex fallback
- Renamed AINavigationAnalyzer to AIRouteDiscovery for clarity

### Fixed
- Authentication now works with dedicated login pages (e.g., `/login/password`)
- Better error handling and reporting for authentication failures

### Removed
- Removed redundant EnhancedRouteAnalyzer class

### Documentation
- Added comprehensive authentication setup guide
- Added route analysis components reference
- Documented the difference between route-extractor and RouteImpactAnalyzer

## [1.0.16] - 2024-07-31

### Fixed
- Fixed native module loading issues with tree-sitter
- Improved modular action architecture

## [1.0.15] - 2024-07-31

### Fixed
- Externalized tree-sitter modules from webpack bundle
- Fixed CI workflow failures

## Previous versions...

[1.0.17]: https://github.com/yofix/yofix/releases/tag/v1.0.17
[1.0.16]: https://github.com/yofix/yofix/releases/tag/v1.0.16
[1.0.15]: https://github.com/yofix/yofix/releases/tag/v1.0.15