# Simplified GitHub Workflows Guide

## Overview

We've simplified the GitHub Actions workflows to improve stability and reduce maintenance overhead.

## Current Workflows

### 1. CI Workflow (`ci.yml`)
Simple and focused CI pipeline:
- Triggers on PR and push to main
- Runs only essential checks:
  - Install dependencies
  - Build project
  - Run tests

### 2. Release Workflow (`release.yml`)
Manual release process:
- Triggered via workflow_dispatch
- Creates GitHub releases with tags
- Updates GitHub Marketplace automatically

## Removed Workflows

The following workflows were removed to reduce complexity:
- `test-action.yml` - Complex multi-scenario testing
- `pre-release-test.yml` - Aggressive pre-release testing
- `yofix.yml` - Dogfooding workflow

## Benefits

1. **Faster CI** - Reduced from ~6 minutes to ~2 minutes
2. **More Stable** - Less flaky tests and timeouts
3. **Easier Maintenance** - Simple workflows are easier to debug
4. **Lower Costs** - Fewer workflow minutes consumed

## Local Testing

Before pushing, run these commands locally:
```bash
yarn build
yarn test
```

## Future Improvements

Once the product stabilizes, we can gradually add back:
- Integration tests with real websites
- Cross-platform compatibility tests
- Security scanning

But for now, keeping it simple helps us iterate faster.