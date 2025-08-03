# GitHub API Dependencies in YoFix

## Overview
This document maps all GitHub API calls in YoFix, what information they fetch, and whether they're essential for core functionality.

## API Endpoints Used

### 1. Pull Request Files (`pulls.listFiles`)
**Location**: `RouteImpactAnalyzer.getChangedFiles()`
```typescript
await octokit.rest.pulls.listFiles({
  owner: github.context.repo.owner,
  repo: github.context.repo.repo,
  pull_number: prNumber,
  per_page: 100
});
```
**Information Retrieved**:
- List of files changed in the PR
- File paths and modification status (added/modified/deleted)
- Essential for route impact analysis

**Essential?**: ✅ YES - Core functionality depends on knowing which files changed

### 2. Issue Comments (`issues.createComment`)
**Multiple Locations**:
- `index.ts` - Posts route impact tree
- `GitHubCommentEngine` - Creates/updates comments
- `RobustPRReporter` - Posts test results
- `YoFixBot` - Responds to commands

```typescript
await octokit.rest.issues.createComment({
  owner: owner,
  repo: repo,
  issue_number: prNumber,
  body: commentBody
});
```
**Information Retrieved**: None (Write operation)
**Purpose**: Communication with users

**Essential?**: ❌ NO - Results could be output elsewhere

### 3. List Comments (`issues.listComments`)
**Locations**:
- `YoFixBot` - Finding preview URLs
- `GitHubCommentEngine` - Finding existing comments to update
- `RobustPRReporter` - Checking for duplicate comments

```typescript
await octokit.rest.issues.listComments({
  owner: owner,
  repo: repo,
  issue_number: prNumber
});
```
**Information Retrieved**:
- Existing comments on PR
- Used to find preview URLs or avoid duplicates

**Essential?**: ❌ NO - Optional optimization

### 4. Update Comment (`issues.updateComment`)
**Locations**:
- `GitHubCommentEngine` - Update existing comments
- `RobustPRReporter` - Update test results

```typescript
await octokit.rest.issues.updateComment({
  owner: owner,
  repo: repo,
  comment_id: commentId,
  body: updatedBody
});
```
**Information Retrieved**: None (Write operation)
**Purpose**: Avoid comment spam

**Essential?**: ❌ NO - Could create new comments instead

### 5. Repository Content (`repos.getContent`)
**Location**: `FirebaseConfigDetector`
```typescript
await octokit.rest.repos.getContent({
  owner: owner,
  repo: repo,
  path: 'firebase.json',
  ref: sha
});
```
**Information Retrieved**:
- Firebase configuration file
- Build system detection

**Essential?**: ❌ NO - Could be read from local filesystem

### 6. Check Runs (`checks.create`, `checks.update`, `checks.listForRef`)
**Location**: `RobustPRReporter`
```typescript
await octokit.rest.checks.create({
  owner: owner,
  repo: repo,
  name: 'YoFix Visual Testing',
  head_sha: sha,
  status: 'completed',
  conclusion: conclusion
});
```
**Information Retrieved**: 
- Existing check runs (for updates)

**Purpose**: GitHub UI integration

**Essential?**: ❌ NO - Nice to have for GitHub UI

### 7. Reactions (`reactions.createForIssueComment`)
**Locations**:
- `GitHubCommentEngine` - Add reactions to comments
- `YoFixBot` - Acknowledge commands

```typescript
await octokit.rest.reactions.createForIssueComment({
  owner: owner,
  repo: repo,
  comment_id: commentId,
  content: '+1' // or 'eyes', 'rocket', etc.
});
```
**Information Retrieved**: None (Write operation)
**Purpose**: User feedback

**Essential?**: ❌ NO - Pure UX enhancement

### 8. Create Issue (`issues.create`)
**Location**: `AuthMetrics` - Telemetry reporting
```typescript
await octokit.rest.issues.create({
  owner: 'yofix',
  repo: 'yofix',
  title: 'Authentication Metrics Report',
  body: metricsReport
});
```
**Information Retrieved**: None (Write operation)
**Purpose**: Analytics/telemetry

**Essential?**: ❌ NO - Optional telemetry

## Summary Table

| API Endpoint | Purpose | Essential | Alternative |
|-------------|---------|-----------|-------------|
| `pulls.listFiles` | Get changed files | ✅ YES | Git diff locally |
| `issues.createComment` | Post results | ❌ NO | File/console output |
| `issues.listComments` | Find existing comments | ❌ NO | Always create new |
| `issues.updateComment` | Update comments | ❌ NO | Create new comment |
| `repos.getContent` | Read config files | ❌ NO | Read from filesystem |
| `checks.*` | GitHub UI integration | ❌ NO | Skip checks |
| `reactions.*` | User feedback | ❌ NO | Skip reactions |
| `issues.create` | Telemetry | ❌ NO | Local logging |

## Core Dependencies Analysis

### Absolutely Essential:
1. **Changed Files List** - Without this, can't determine which routes to test
   - Alternative: Use local git commands if running locally

### Nice to Have:
1. **PR Comments** - Communication channel
2. **Check Runs** - GitHub UI integration
3. **Reactions** - User experience

### Not Essential:
1. **Comment Updates** - Could always create new
2. **Config File Reading** - Can read locally
3. **Telemetry** - Optional analytics

## Refactoring for Local Execution

To run YoFix locally without GitHub, you'd need to:

### 1. Replace Changed Files API
```typescript
// Instead of GitHub API
const changedFiles = await this.octokit.rest.pulls.listFiles();

// Use git command
const changedFiles = await exec('git diff --name-only main...HEAD');
```

### 2. Replace Output Methods
```typescript
// Instead of PR comments
await octokit.rest.issues.createComment({ body: results });

// Use file output
await fs.writeFile('visual-test-results.json', results);
console.log(results);
```

### 3. Create Abstraction Layer
```typescript
interface ChangeDetector {
  getChangedFiles(): Promise<string[]>;
}

interface ResultPublisher {
  publish(results: TestResults): Promise<void>;
}

// GitHub implementation
class GitHubChangeDetector implements ChangeDetector {
  async getChangedFiles() {
    return await this.octokit.rest.pulls.listFiles(...);
  }
}

// Local implementation
class GitChangeDetector implements ChangeDetector {
  async getChangedFiles() {
    return await exec('git diff --name-only');
  }
}
```

## Conclusion

Only **1 out of 8** GitHub API dependencies is truly essential - getting the list of changed files. Everything else is for GitHub-specific features (comments, checks, reactions) that could be replaced with local alternatives for standalone execution.