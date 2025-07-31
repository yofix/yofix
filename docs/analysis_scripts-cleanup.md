# Scripts Directory Analysis and Cleanup Recommendations

## Overview
The `/scripts` directory contains 19 scripts (17 TypeScript, 1 JavaScript, 2 Shell) totaling 2,871 lines.

## Script Categories

### 1. 🚀 Production Scripts (KEEP)
- `release.sh` (190 lines) - Used in package.json for releases
- `test-locally.sh` (454 lines) - Local testing before publishing

### 2. 🔍 Route Impact Analysis Scripts
**Current Production:**
- `route-impact-improved.ts` (241 lines) - **KEEP** - Current production version with UI

**Older Versions (REMOVE):**
- `analyze-route-impact.ts` (216 lines) - Older version
- `simple-route-impact.ts` (92 lines) - Basic version
- `precise-route-impact.ts` (253 lines) - Another iteration
- `route-impact-graph.ts` (256 lines) - Graphical version

### 3. 🐛 Debug Scripts (REMOVE ALL)
These were created during development and are no longer needed:
- `debug-icon-imports.ts` (94 lines)
- `debug-import-graph.ts` (63 lines)
- `debug-import-resolution.ts` (78 lines)
- `debug-lazy-imports.ts` (91 lines)
- `debug-publicRouter-parsing.ts` (49 lines)
- `debug-test-route-impact.ts` (113 lines)
- `debug-tree-sitter.ts` (107 lines)
- `debug-tree-sitter-enhanced.ts` (115 lines)

### 4. 🧪 Test Scripts
**Keep for development:**
- `test-tree-sitter.ts` (95 lines) - Useful for testing parser
- `test-tree-sitter-import-extraction.ts` (93 lines) - Import testing
- `test-specific-file.ts` (113 lines) - Testing specific files

**Review:**
- `diagnose-comments.js` (158 lines) - Check if still needed for GitHub comments

## Recommendations

### Immediate Actions:
1. **Delete all debug scripts** (8 files, ~700 lines)
2. **Delete old route impact versions** (4 files, ~817 lines)
3. **Keep production scripts** (2 files)
4. **Keep active route impact script** (1 file)
5. **Keep test scripts for development** (3-4 files)

### Result:
- From 19 scripts → 6-7 scripts
- From 2,871 lines → ~1,000 lines
- **65% reduction in scripts**

### Migration Path:
1. Ensure `route-impact-improved.ts` has all needed functionality
2. Move any unique features from old scripts if needed
3. Create a `scripts/archive/` directory for historical reference
4. Update any documentation referencing old scripts

## Script Usage Summary

| Script | Used In | Status |
|--------|---------|--------|
| release.sh | package.json | ✅ KEEP |
| test-locally.sh | Development | ✅ KEEP |
| route-impact-improved.ts | CLI usage | ✅ KEEP |
| debug-*.ts | None | ❌ REMOVE |
| analyze-route-impact.ts | None | ❌ REMOVE |
| simple-route-impact.ts | None | ❌ REMOVE |
| precise-route-impact.ts | None | ❌ REMOVE |
| route-impact-graph.ts | None | ❌ REMOVE |
| test-*.ts | Development | ⚠️ REVIEW |
| diagnose-comments.js | Unknown | ⚠️ REVIEW |