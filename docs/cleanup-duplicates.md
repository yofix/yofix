# YoFix Cleanup Plan - Remove Duplicates (DRY)

## Problem: Code Duplication

We have **duplicate implementations** of storage and screenshot logic:

### OLD (Built into yofix):
- ❌ `src/providers/storage/FirebaseStorage.ts`
- ❌ `src/providers/storage/S3Storage.ts`
- ❌ `src/providers/storage/StorageFactory.ts`
- ❌ `src/providers/storage/FirebaseStorageManager.ts`
- ❌ Screenshot capture in `BaselineManager.ts`
- ❌ Screenshot capture in `DeterministicRunner.ts`

### NEW (External packages - DRY):
- ✅ `@yofix/storage` (reusable package)
- ✅ `@yofix/browser` (reusable package)
- ✅ `src/core/storage/StorageUploader.ts` (wrapper)
- ✅ `src/core/screenshot/BrowserScreenshotCapture.ts` (wrapper)

## Cleanup Tasks

### 1. Remove Old Storage Providers ❌

**Files to DELETE:**
```bash
rm src/providers/storage/FirebaseStorage.ts
rm src/providers/storage/S3Storage.ts
rm src/providers/storage/StorageFactory.ts
rm src/providers/storage/types.ts
```

**Keep (for now, may need refactoring):**
- `src/providers/storage/FirebaseStorageManager.ts` - Used for baseline storage, might be different use case

**Replace with:**
- Use `@yofix/storage` package
- Use `src/core/storage/StorageUploader.ts` wrapper

---

### 2. Refactor BaselineManager ✏️

**File:** `src/core/baseline/BaselineManager.ts`

**Current:** Has its own Playwright screenshot capture code

**Change to:** Use `@yofix/browser` package

**Before:**
```typescript
// BaselineManager.ts (OLD)
import { chromium } from 'playwright';

async createBaseline() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  const screenshot = await page.screenshot();
  // ...
}
```

**After:**
```typescript
// BaselineManager.ts (NEW)
import { captureRouteScreenshots } from '@yofix/browser';

async createBaseline() {
  const result = await captureRouteScreenshots({
    routes: ['/'],
    baseUrl: productionUrl,
    options: { /* ... */ }
  });
  // Use result.screenshots
}
```

---

### 3. Refactor DeterministicRunner ✏️

**File:** `src/core/deterministic/testing/DeterministicRunner.ts`

**Current:** Has its own Playwright screenshot capture code

**Change to:** Use `@yofix/browser` package

**Before:**
```typescript
// DeterministicRunner.ts (OLD)
async testRoute(route: string) {
  await this.page.goto(route);
  const screenshot = await this.page.screenshot();
  // ...
}
```

**After:**
```typescript
// DeterministicRunner.ts (NEW)
import { captureRouteScreenshots } from '@yofix/browser';

async testRoute(route: string) {
  const result = await captureRouteScreenshots({
    routes: [route],
    baseUrl: this.baseUrl,
    // Reuse browser context if possible
  });
  return result.screenshots[0];
}
```

---

### 4. Update Main Orchestrator (index.ts) 🔄

**File:** `src/index.ts`

**Remove usage of:**
- OLD `TestGenerator` with built-in screenshots
- OLD `FirebaseStorageManager.uploadScreenshots()`
- OLD `StorageFactory.create()`

**Replace with:**
```typescript
import { captureScreenshotsWithBrowser } from './core/screenshot/BrowserScreenshotCapture';
import { uploadScreenshots, mapStorageUrlsToScreenshots } from './core/storage/StorageUploader';

// Step 1: Capture (browser only)
const capture = await captureScreenshotsWithBrowser({ /* ... */ });

// Step 2: Upload (storage only)
const upload = await uploadScreenshots({
  screenshots: capture.screenshots,
  outputDirectory: capture.outputDirectory,
  prNumber,
  storageProvider: 'firebase'
});

// Step 3: Map URLs
const withUrls = mapStorageUrlsToScreenshots(capture.screenshots, upload.uploadedFiles);
```

---

### 5. Check FirebaseStorageManager Usage 🔍

**File:** `src/providers/storage/FirebaseStorageManager.ts`

**Questions to answer:**
1. Is this ONLY for baseline storage? (different from screenshot uploads)
2. Does it have unique functionality not in `@yofix/storage`?
3. Can we migrate it to use `@yofix/storage` internally?

**Action:**
- If it's only for baselines: Keep but refactor to use `@yofix/storage`
- If it's for screenshot uploads: DELETE and use `StorageUploader.ts`

---

## Migration Strategy

### Phase 1: Safety (No Breaking Changes)
1. ✅ Create new modules (`BrowserScreenshotCapture.ts`, `StorageUploader.ts`)
2. ✅ Add `@yofix/*` packages as dependencies
3. ⏳ Keep old code temporarily (backwards compatibility)

### Phase 2: Gradual Migration
1. ⏳ Update `index.ts` to use new modules
2. ⏳ Refactor `BaselineManager` to use `@yofix/browser`
3. ⏳ Refactor `DeterministicRunner` to use `@yofix/browser`
4. ⏳ Test each change incrementally

### Phase 3: Cleanup
1. ⏳ Remove old storage providers
2. ⏳ Remove old TestGenerator if not needed
3. ⏳ Remove any unused imports
4. ⏳ Update tests

---

## File Dependency Analysis

### Who Uses Old Storage Providers?

```bash
# Find who imports old storage
grep -r "from.*providers/storage" src/
grep -r "StorageFactory" src/
grep -r "FirebaseStorage" src/
grep -r "S3Storage" src/
```

**Expected Results:**
- `index.ts` - Main orchestrator (UPDATE to use StorageUploader)
- `BaselineManager.ts` - Baseline creation (UPDATE to use @yofix/storage)
- Tests - (UPDATE tests)

### Who Uses Old Screenshot Logic?

```bash
# Find direct Playwright usage
grep -r "page\.screenshot" src/
grep -r "chromium\.launch" src/
```

**Expected Results:**
- `BaselineManager.ts` - (UPDATE to use @yofix/browser)
- `DeterministicRunner.ts` - (UPDATE to use @yofix/browser)
- `TestGenerator.ts` - (EVALUATE: keep or replace?)

---

## Benefits After Cleanup

### 1. Single Source of Truth (DRY)
- ✅ Storage logic: Only in `@yofix/storage`
- ✅ Screenshot logic: Only in `@yofix/browser`
- ✅ No duplicate implementations

### 2. Reduced Bundle Size
- Remove ~30KB of duplicate code
- Smaller action.yml distribution

### 3. Easier Maintenance
- Fix storage bugs in ONE place (`@yofix/storage`)
- Fix browser bugs in ONE place (`@yofix/browser`)
- Update features in ONE place

### 4. Better Testing
- Test storage independently
- Test browser independently
- Mock dependencies easily

### 5. Reusability
- Other projects can use `@yofix/storage`
- Other projects can use `@yofix/browser`
- No vendor lock-in to yofix

---

## Rollback Plan

If issues arise:

1. **Keep git history:**
   ```bash
   git tag before-cleanup
   git commit -m "Remove duplicate storage/screenshot code"
   ```

2. **If need to rollback:**
   ```bash
   git revert HEAD
   # Or
   git reset --hard before-cleanup
   ```

3. **Gradual rollout:**
   - Use feature flags to toggle new/old code
   - Test in staging first
   - Monitor error rates

---

## Testing Checklist

After cleanup, verify:

- [ ] Screenshot capture works with @yofix/browser
- [ ] Firebase upload works with @yofix/storage
- [ ] S3 upload works with @yofix/storage
- [ ] Baseline creation still works
- [ ] PR comments include correct URLs
- [ ] No import errors
- [ ] No runtime errors
- [ ] Tests pass
- [ ] GitHub Action runs successfully

---

## Code Size Comparison

### Before Cleanup:
```
src/providers/storage/          ~40KB
src/core/baseline/              ~15KB (with Playwright)
src/core/deterministic/testing/ ~20KB (with Playwright)
Total duplicate code:           ~75KB
```

### After Cleanup:
```
@yofix/storage (external)
@yofix/browser (external)
src/core/storage/StorageUploader.ts     ~8KB (wrapper only)
src/core/screenshot/BrowserScreenshotCapture.ts  ~4KB (wrapper only)
Total wrapper code:             ~12KB
```

**Savings:** ~63KB removed from yofix bundle! 🎉

---

## Summary

**Goal:** Remove ALL duplicate code and use external packages

**Approach:** Gradual migration with safety nets

**Result:** Cleaner, smaller, more maintainable codebase

**Timeline:**
1. Phase 1 (Done): Create new modules
2. Phase 2 (Next): Update main files
3. Phase 3 (Final): Remove old code

Let's proceed with Phase 2! 🚀
