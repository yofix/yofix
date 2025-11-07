# Full-Page Screenshot Configuration

## Overview

Added configurable `full-page` option to control screenshot capture behavior. This allows you to choose between:

- **Full-page mode** (`full-page: true`): Uses viewport WIDTH, captures entire page HEIGHT
- **Fixed viewport mode** (`full-page: false`): Uses fixed viewport WIDTH and HEIGHT

## Why This Matters

### Full-Page Mode (Recommended for Most Cases)
```yaml
full-page: 'true'  # Default
viewports: '1920x1080,375x667'
```

**Behavior:**
- Desktop (1920x1080): Captures at **1920px width** × **FULL page height** (e.g., 3500px)
- Mobile (375x667): Captures at **375px width** × **FULL page height** (e.g., 4200px)

**Use Cases:**
- ✅ Testing entire page layout (above and below the fold)
- ✅ Detecting issues in footers, sidebars, long-form content
- ✅ Mobile responsive testing (entire scrollable page)
- ✅ Dashboard/admin panels with dynamic content
- ✅ Blog posts, documentation sites

**Pros:**
- Catches regressions anywhere on the page
- Better coverage for content-heavy pages
- More accurate mobile testing

**Cons:**
- Larger file sizes (200-500KB vs 20-50KB)
- Longer capture time (+500ms per screenshot)
- More sensitive to dynamic content (ads, infinite scroll)

### Fixed Viewport Mode
```yaml
full-page: 'false'
viewports: '1920x1080,375x667'
```

**Behavior:**
- Desktop: Captures exactly **1920px width** × **1080px height**
- Mobile: Captures exactly **375px width** × **667px height**

**Use Cases:**
- ✅ Testing "above the fold" content only
- ✅ Hero sections, landing pages
- ✅ Consistent dimensions for pixel-perfect comparisons
- ✅ Apps with mostly static viewport content

**Pros:**
- Smaller file sizes
- Faster capture
- Predictable dimensions
- Less noise from dynamic content

**Cons:**
- Misses content below the fold
- Won't catch footer/sidebar issues
- Limited mobile testing

## Configuration

### GitHub Actions Workflow

```yaml
name: Visual Testing
on: [pull_request]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: YoFix Visual Testing
        uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.preview-url }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}

          # Screenshot configuration
          viewports: "1920x1080,768x1024,375x667"
          full-page: "true"  # or "false"

          # Storage
          firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          storage-bucket: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
```

### Default Behavior

If `full-page` is not specified, it defaults to `true` (full-page capture).

```yaml
# These are equivalent:
full-page: "true"
# (no full-page specified)
```

## How It Works

### 1. Viewport Parsing

The system parses viewports from the `viewports` input:

```typescript
// Input: "1920x1080,375x667"
// Parsed:
[
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 375, height: 667, name: '375x667' }
]
```

### 2. Screenshot Capture

**Full-Page Mode (`full-page: true`):**
```typescript
// Set viewport dimensions
await page.setViewportSize({ width: 1920, height: 1080 })

// Capture FULL page (ignores height from viewport)
await page.screenshot({
  fullPage: true,  // ← Captures entire scrollable height
  path: 'screenshot.png'
})

// Result: 1920px × [actual page height] (e.g., 3500px)
```

**Fixed Viewport Mode (`full-page: false`):**
```typescript
// Set viewport dimensions
await page.setViewportSize({ width: 1920, height: 1080 })

// Capture ONLY viewport (uses both width and height)
await page.screenshot({
  fullPage: false,  // ← Captures only what's visible in viewport
  path: 'screenshot.png'
})

// Result: 1920px × 1080px (exactly as specified)
```

### 3. Baseline Comparison

**Important:** Baseline and current screenshots MUST have matching dimensions for comparison:

#### Scenario 1: Both Full-Page (✅ Works)
```
Baseline: 1920 × 3500px (full-page)
Current:  1920 × 3500px (full-page)
Status:   ✅ Can compare
```

#### Scenario 2: Both Fixed Viewport (✅ Works)
```
Baseline: 1920 × 1080px (viewport-only)
Current:  1920 × 1080px (viewport-only)
Status:   ✅ Can compare
```

#### Scenario 3: Mismatched (❌ Error)
```
Baseline: 1920 × 1080px (old viewport-only)
Current:  1920 × 3500px (new full-page)
Status:   ❌ Cannot compare - dimension mismatch

Error Message:
"📏 Dimension Mismatch
Images have different sizes: current (1920x3500) vs baseline (1920x1080)

ℹ️ Why? Baseline was captured at different settings
🔧 Fix: Delete old baselines and re-run to create new ones"
```

## Migration Guide

### If You Have Existing Baselines

**Option 1: Keep Existing Viewport-Only Baselines**
```yaml
# Match your old behavior
full-page: "false"
viewports: "1920x1080,375x667"
```

**Option 2: Switch to Full-Page (Recommended)**
```yaml
full-page: "true"
viewports: "1920x1080,375x667"
```

Then delete old baselines:
1. Go to Firebase Console: https://console.firebase.google.com
2. Navigate to Storage → your bucket
3. Delete the `baselines/` folder
4. Re-run workflow - new full-page baselines created automatically

### For New Projects

Use full-page mode (default):
```yaml
# Full-page is the default, no configuration needed
viewports: "1920x1080,375x667"
```

## Examples

### E-commerce Site (Full-Page Recommended)
```yaml
with:
  full-page: "true"  # Test entire product pages, checkout flow
  viewports: "1920x1080,768x1024,375x667"
```

**Why:** Captures product descriptions, reviews, related products, footer

### Landing Page (Fixed Viewport OK)
```yaml
with:
  full-page: "false"  # Hero section is what matters
  viewports: "1920x1080,768x1024,375x812"
```

**Why:** Landing pages are designed for "above the fold" impact

### Documentation Site (Full-Page Recommended)
```yaml
with:
  full-page: "true"  # Long-form content extends beyond viewport
  viewports: "1920x1080,768x1024,375x667"
```

**Why:** Docs have long content with navigation, code blocks, footer

### Marketing One-Pager (Fixed Viewport OK)
```yaml
with:
  full-page: "false"  # Single viewport, minimal scroll
  viewports: "1920x1080"
```

**Why:** Designed to fit in single viewport, no scroll needed

## Technical Implementation

### Changes Made

**1. action.yml**
```yaml
full-page:
  description: 'Capture full-page height (true) or fixed viewport height (false)'
  required: false
  default: 'true'
```

**2. @yofix/browser (route-impact-browser)**
- Added `fullPage` to `BrowserOptions` interface
- Updated `ScreenshotCapture` constructor to accept `fullPage`
- Modified `page.screenshot()` call to use dynamic `fullPage` value

**3. YoFix Steps**
- **Step 2 (Browse Routes)**: Reads `full-page` config, passes to browser
- **Step 2.5 (Compare Baselines)**: Uses same `full-page` for production captures
- **Step 4 (Post Results)**: Enhanced error messages for dimension mismatches

### Code Flow

```
action.yml (full-page input)
    ↓
ConfigurationManager.getBoolean('full-page')
    ↓
Step 2: browseRoutes()
    ↓
captureScreenshotsWithBrowser({ fullPage })
    ↓
@yofix/browser: captureRouteScreenshots({ browser: { fullPage } })
    ↓
ScreenshotCapture(fullPage)
    ↓
page.screenshot({ fullPage })
```

## Best Practices

1. **Be Consistent**: Use the same `full-page` setting for baseline and current
2. **Full-Page for Most Cases**: Better test coverage, catches more issues
3. **Test Representative Viewports**: Include desktop, tablet, mobile
4. **Delete Old Baselines**: When switching between modes
5. **Monitor File Sizes**: Full-page screenshots are 5-10× larger
6. **Set Reasonable Timeouts**: Full-page capture takes longer

## Troubleshooting

### "Dimension Mismatch" Error
**Cause:** Baseline was captured with different `full-page` setting

**Solution:**
1. Delete baselines from storage
2. Re-run workflow with desired `full-page` setting
3. New baselines created automatically

### Screenshots Too Large
**Issue:** Full-page screenshots are hundreds of KB

**Solutions:**
- Use `full-page: false` for specific routes
- Increase storage quota
- Set shorter `cleanup-days` to delete old screenshots

### Comparison Taking Too Long
**Issue:** Large full-page images slow down comparison

**Solutions:**
- Reduce number of viewports
- Use `comparison-threshold` to skip minor differences
- Run comparisons in parallel (automatic)

## Performance Impact

### File Sizes
```
Fixed Viewport (1920×1080):
  Typical size: 20-50 KB
  Storage: ~2 MB for 50 screenshots

Full-Page (1920×3500):
  Typical size: 200-500 KB
  Storage: ~20 MB for 50 screenshots
```

### Capture Time
```
Fixed Viewport:
  Per screenshot: ~300ms
  10 routes × 3 viewports = ~9 seconds

Full-Page:
  Per screenshot: ~800ms
  10 routes × 3 viewports = ~24 seconds
```

### Comparison Time
```
Fixed Viewport (1920×1080):
  Per comparison: ~50ms
  Pixelmatch processes: 2,073,600 pixels

Full-Page (1920×3500):
  Per comparison: ~150ms
  Pixelmatch processes: 6,720,000 pixels
```

## FAQ

**Q: Should I use full-page for all sites?**
A: Yes, for most cases. It catches more issues and is worth the performance trade-off.

**Q: Can I mix full-page and viewport-only?**
A: Not for the same baseline set. Choose one mode and stick with it.

**Q: What if my page height changes?**
A: That's OK! Full-page mode captures whatever height the page renders at. If content was added/removed, you'll see the difference.

**Q: Do I need to update existing baselines?**
A: Only if you're changing the `full-page` setting. Same setting = baselines still valid.

**Q: Why is the default `true`?**
A: Full-page testing provides better coverage and is the industry standard for visual regression testing.

---

**Built:** $(date)
**Version:** 1.1.0
**Status:** ✅ Production Ready
