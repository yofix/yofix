# Changelog

All notable changes to this project will be documented in this file.

## [1.0.18] - 2025-01-19

### Major Improvements
- 🏗️ **Centralized Architecture**: Complete refactor with centralized utilities, error handling, and configuration management
- 📁 **File Organization**: Reorganized project structure with proper separation of concerns
- 🔧 **Enhanced Error Handling**: Comprehensive centralized error handling with categorization and recovery
- 💾 **Storage Providers**: Complete Firebase and S3 implementations with batch operations and cleanup

### Added
- New centralized validation patterns and async utilities (`ValidationPatterns`, `AsyncUtilities`)
- Comprehensive error categorization and reporting system
- Storage provider batch operations and console URL generation
- Enhanced configuration management with hierarchical access
- Circuit breaker pattern for reliable operations
- Improved logging with clean console output (removed HTML tags)

### Fixed
- All TypeScript compilation errors resolved after file reorganization
- Fixed storage provider interface compliance with missing methods
- Resolved import/export issues after centralized utilities migration
- Fixed test configuration paths and all tests now passing
- Fixed async operation handling in storage provider constructors
- Cleaned up HTML tags in console logs for better readability

### Developer Experience
- Improved code organization and maintainability
- Better error messages and debugging information
- Consistent patterns across all modules
- Enhanced type safety with proper interfaces

### Internal
- Updated ESLint configuration for better code quality
- Fixed Jest test setup for proper mocking
- Added experimental decorators support for TypeScript
- Comprehensive code cleanup and optimization

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