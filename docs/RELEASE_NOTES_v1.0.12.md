# YoFix v1.0.12 Release Notes

## 🐛 Bug Fixes

### Firebase URL Validation
- Fixed validation error for Firebase preview URLs with combined project ID format
- Added support for URLs like `arboreal-vision-339901--pr-3135-k9b9ruug.web.app`
- Improved URL parsing to handle multiple Firebase URL patterns

### EnhancedContextProvider Fixes
- Fixed `TypeError: files.sort is not a function` error in context building
- Added proper glob pattern expansion before file loading
- Added array validation checks to prevent runtime errors
- Improved handling of glob patterns in `buildContext` method

## 📊 Technical Details

### Firebase URL Handler Changes
- Added `FIREBASE_COMBINED_REGEX` pattern for combined format URLs
- Enhanced `parseFirebaseUrl` to try multiple patterns
- Better fallback handling for non-standard URL formats

### Context Provider Improvements
- Glob patterns (e.g., `tests/**/*.spec.ts`) are now properly expanded
- Added safety checks for array parameters
- Improved error handling with debug logging

## 🔄 Migration

No breaking changes. Simply update to v1.0.12:

```yaml
- uses: yofix/yofix@v1.0.12
```

---

**Full Changelog**: https://github.com/yofix/yofix/compare/v1.0.11...v1.0.12