# YoFix CLI Usage

The YoFix CLI allows you to run visual analysis locally without needing GitHub Actions.

## Installation

```bash
npm install -g yofix
# or
yarn global add yofix
```

## Setup

Set your Claude API key:

```bash
export CLAUDE_API_KEY=your-api-key-here
```

## Commands

### Test Installation

```bash
yofix test
```

### Scan a URL

Scan a website for visual issues:

```bash
# Scan homepage
yofix scan https://example.com

# Scan specific routes
yofix scan https://example.com --routes /about /contact

# Test specific viewports
yofix scan https://example.com --viewports mobile tablet

# Save results to file
yofix scan https://example.com -o scan-results.json
```

### Generate Fixes

Generate fixes for issues found in a scan:

```bash
# Generate fixes from scan results
yofix fix scan-results.json

# Save fixes to file
yofix fix scan-results.json -o fixes.md
```

## Examples

### Full Workflow

```bash
# 1. Scan your staging site
yofix scan https://staging.example.com \
  --routes / /products /about \
  --viewports desktop mobile \
  -o staging-issues.json

# 2. Review the issues
cat staging-issues.json

# 3. Generate fixes
yofix fix staging-issues.json -o fixes.md

# 4. Review and apply fixes
cat fixes.md
```

### CI/CD Integration

```yaml
# .github/workflows/visual-check.yml
name: Visual Check
on: [pull_request]

jobs:
  visual-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install YoFix
        run: npm install -g yofix
      
      - name: Run Visual Scan
        env:
          CLAUDE_API_KEY: ${{ secrets.CLAUDE_API_KEY }}
        run: |
          yofix scan ${{ env.PREVIEW_URL }} \
            --routes / /dashboard \
            -o scan-results.json
      
      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: visual-scan-results
          path: scan-results.json
```

## Configuration

Create a `.yofix.yml` file in your project root to set default options:

```yaml
# .yofix.yml
scan:
  routes:
    - /
    - /products
    - /about
  viewports:
    - desktop
    - mobile
  maxRoutes: 10

ai:
  model: claude-3-haiku
  temperature: 0.3
```

## Debugging

Enable debug logging:

```bash
DEBUG=yofix:* yofix scan https://example.com
```

View help for any command:

```bash
yofix --help
yofix scan --help
yofix fix --help
```