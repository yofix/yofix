# Guide: Fixing GitHub Script Version Error

## Problem
When using YoFix v1.0.13, you might encounter an error:
```
Unable to resolve action actions/github-script@v1.0.13, package version not found
```

This happens when GitHub Actions incorrectly resolves the version of `actions/github-script`.

## Solutions

### Solution 1: Use Full Version Tag (Recommended)
Update your workflow to use the full version tag:

```yaml
- name: Trigger Yofix Visual Test
  uses: actions/github-script@v7.0.1  # Use specific version
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    script: |
      await github.rest.actions.createWorkflowDispatch({
        owner: context.repo.owner,
        repo: context.repo.repo,
        workflow_id: 'yofix.yml',
        ref: '${{ github.head_ref }}',
        inputs: {
          'preview-url': '${{ needs.build_and_preview.outputs.preview-url }}',
          'pr-number': '${{ github.event.pull_request.number }}'
        }
      });
```

### Solution 2: Use Commit SHA
For maximum stability, use the commit SHA:

```yaml
- name: Trigger Yofix Visual Test
  uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea  # v7.0.1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    # ... rest of configuration
```

### Solution 3: Clear GitHub Actions Cache
If the issue persists, it might be a caching problem:

1. Go to your repository's Actions tab
2. Click on "Management" in the left sidebar
3. Click on "Caches"
4. Delete any caches related to the workflow

### Solution 4: Alternative Approach - Direct API Call
If the issue continues, you can use a direct API call instead:

```yaml
- name: Trigger Yofix Visual Test
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    curl -X POST \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github.v3+json" \
      https://api.github.com/repos/${{ github.repository }}/actions/workflows/yofix.yml/dispatches \
      -d '{
        "ref": "${{ github.head_ref }}",
        "inputs": {
          "preview-url": "${{ needs.build_and_preview.outputs.preview-url }}",
          "pr-number": "${{ github.event.pull_request.number }}"
        }
      }'
```

## Root Cause
This issue can occur when:
1. GitHub's action resolution cache gets confused
2. There's a version conflict between different actions
3. The workflow file has been recently updated

## Prevention
To prevent this issue in the future:
1. Always use specific version tags instead of major version tags
2. Consider using commit SHAs for critical workflows
3. Test workflow changes in a separate branch first