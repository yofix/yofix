# Ensuring GitHub Comments Are Posted

## Overview

This guide explains how to ensure YoFix reliably posts comments to your GitHub PRs.

## Common Issues and Solutions

### 1. **Missing Permissions**

The most common reason for comments not being posted is insufficient GitHub token permissions.

#### Solution:

```yaml
- uses: yofix/yofix@v1.0.12
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    # OR use a PAT with more permissions
    github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
```

**Required Permissions:**
- `pull-requests: write` - To post comments
- `contents: read` - To read PR content
- `issues: write` - To create/update comments

#### Using GitHub's Default Token:
```yaml
jobs:
  visual-test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: yofix/yofix@v1.0.12
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### Using Personal Access Token (PAT):
1. Create a PAT at https://github.com/settings/tokens
2. Select scopes: `repo`, `write:discussion`
3. Add as repository secret: `YOFIX_GITHUB_TOKEN`

### 2. **PR Context Issues**

YoFix needs to run in PR context to post comments.

#### Solution:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]

  # NOT on push - this won't have PR context
  # push:
  #   branches: [main]
```

### 3. **Rate Limiting**

GitHub API has rate limits that might prevent comment posting.

#### Solution:

Use the robust reporter that implements retry logic:

```yaml
- uses: yofix/yofix@v1.0.12
  with:
    enable-robust-reporting: 'true'  # Coming in next version
```

### 4. **Network Issues**

Transient network issues can prevent API calls.

#### Current Workaround:

Check workflow logs for posted results if comment fails:
1. Go to Actions tab
2. Click on the workflow run
3. View "YoFix Analysis" job
4. Results are logged even if comment fails

##
ging Comment Issues

### Step 1: Check Permissions

```bash
# In your workflow, add this debug step
- name: Check Token Permissions
  run: |
    curl -H "Authorization: token ${{ secrets.GITHUB_TOKEN }}" \
         -H "Accept: application/vnd.github.v3+json" \
         https://api.github.com/repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}
```

### Step 2: Enable Debug Logging

```yaml
- uses: yofix/yofix@v1.0.12
  env:
    ACTIONS_STEP_DEBUG: true
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Step 3: Check Workflow Logs

Look for these key messages:
- `📝 Step 6: Posting results to PR...`
- `Created new PR comment` ✅
- `Updated existing PR comment` ✅
- `Failed to post PR comment` ❌

## Alternative Output Methods

If comments aren't working, YoFix provides alternatives:

### 1. **Workflow Summary**

Results are always posted to workflow summary:
- Go to workflow run
- Click "Summary" on the left
- View YoFix results

### 2. **Check Runs**

Enable check run reporting:
```yaml
- uses: yofix/yofix@v1.0.12
  with:
    use-check-runs: 'true'  # Coming soon
```

### 3. **Status Checks**

Results affect PR status checks:
- ✅ All tests pass → Green check
- ❌ Tests fail → Red check
- ⚠️ Partial pass → Yellow check

### 4. **Action Outputs**

Access results programmatically:
```yaml
- uses: yofix/yofix@v1.0.12
  id: yofix

- name: Use Results
  run: |
    echo "Status: ${{ steps.yofix.outputs.status }}"
    echo "Results: ${{ steps.yofix.outputs.test-results }}"
    echo "Screenshots: ${{ steps.yofix.outputs.screenshots-url }}"
```

## Recommended Configuration

For maximum reliability:

```yaml
name: Visual Testing
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
      checks: write  # For check runs

    steps:
      - uses: actions/checkout@v4

      # Your deployment step here

      - name: YoFix Visual Testing
        uses: yofix/yofix@v1.0.12
        id: yofix
        with:
          preview-url: ${{ steps.deploy.outputs.preview-url }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}

          # Storage
          firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          storage-bucket: ${{ secrets.FIREBASE_STORAGE_BUCKET }}

          # Enhanced reporting
          enable-robust-reporting: 'true'
          fallback-to-summary: 'true'

      # Fallback: Post results as separate step
      - name: Post Results (Fallback)
        if: failure() || cancelled()
        run: |
          echo "YoFix Status: ${{ steps.yofix.outputs.status }}"
          echo "Test Results: ${{ steps.yofix.outputs.test-results }}"
```

## Using the Robust Reporter

YoFix v1.0.13+ includes a robust reporter with multiple fallback strategies:

1. **Primary**: Post via Issues API
2. **Fallback 1**: Post via Check Runs API
3. **Fallback 2**: Post minimal comment
4. **Fallback 3**: Post to workflow summary

This ensures results are always visible somewhere.

## Troubleshooting Checklist

- [ ] Using `pull_request` event trigger
- [ ] GitHub token has required permissions
- [ ] PR number is available in context
- [ ] No rate limiting errors in logs
- [ ] Network connectivity to GitHub API
- [ ] Workflow has write permissions
- [ ] Using latest YoFix version

## Getting Help

If comments still aren't posting:

1. Check workflow logs for specific errors
2. Open an issue at https://github.com/yofix/yofix/issues
3. Include:
   - YoFix version
   - Workflow configuration
   - Error messages from logs
   - GitHub Action run URL
