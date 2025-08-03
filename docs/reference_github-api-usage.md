# GitHub API Usage Reference

This document provides a comprehensive overview of all GitHub API endpoints and services used by YoFix.

## Summary

YoFix uses the GitHub REST API v3 (Octokit) exclusively. No GraphQL endpoints are used.

## GitHub REST API Endpoints

### 1. Pull Request Operations

#### `pulls.listFiles`
- **Location**: `GitHubHook`, `RouteImpactAnalyzer` (formerly)
- **Purpose**: Get list of files changed in a pull request
- **Usage**:
```typescript
octokit.rest.pulls.listFiles({
  owner: string,
  repo: string,
  pull_number: number,
  per_page: 100
})
```

### 2. Issue/PR Comments

#### `issues.createComment`
- **Location**: Multiple components (GitHubHook, GitHubCommentEngine, RobustPRReporter, index.ts, YoFixBotRefactored)
- **Purpose**: Create comments on PRs (PRs are treated as issues in GitHub API)
- **Usage**:
```typescript
octokit.rest.issues.createComment({
  owner: string,
  repo: string,
  issue_number: number,
  body: string
})
```

#### `issues.updateComment`
- **Location**: GitHubCommentEngine, RobustPRReporter, YoFixBotRefactored
- **Purpose**: Update existing comments
- **Usage**:
```typescript
octokit.rest.issues.updateComment({
  owner: string,
  repo: string,
  comment_id: number,
  body: string
})
```

#### `issues.listComments`
- **Location**: GitHubCommentEngine, RobustPRReporter, YoFixBot
- **Purpose**: List all comments on a PR to find existing bot comments
- **Usage**:
```typescript
octokit.rest.issues.listComments({
  owner: string,
  repo: string,
  issue_number: number,
  per_page?: number
})
```

### 3. Reactions

#### `reactions.createForIssueComment`
- **Location**: GitHubCommentEngine, YoFixBotRefactored
- **Purpose**: Add reactions (👀, ✅, ❌) to comments
- **Usage**:
```typescript
octokit.rest.reactions.createForIssueComment({
  owner: string,
  repo: string,
  comment_id: number,
  content: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'
})
```

### 4. Repository Content

#### `repos.getContent`
- **Location**: FirebaseConfigDetector
- **Purpose**: Read file contents from repository (firebase.json, package.json)
- **Usage**:
```typescript
octokit.rest.repos.getContent({
  owner: string,
  repo: string,
  path: string,
  ref?: string
})
```

### 5. Check Runs

#### `checks.listForRef`
- **Location**: RobustPRReporter
- **Purpose**: List existing check runs for a commit
- **Usage**:
```typescript
octokit.rest.checks.listForRef({
  owner: string,
  repo: string,
  ref: string,
  check_name?: string
})
```

#### `checks.create`
- **Location**: RobustPRReporter
- **Purpose**: Create new check run for visual testing results
- **Usage**:
```typescript
octokit.rest.checks.create({
  owner: string,
  repo: string,
  name: string,
  head_sha: string,
  status: 'completed',
  conclusion: 'success' | 'failure',
  output: {
    title: string,
    summary: string,
    annotations?: Array
  }
})
```

#### `checks.update`
- **Location**: RobustPRReporter
- **Purpose**: Update existing check run
- **Usage**:
```typescript
octokit.rest.checks.update({
  owner: string,
  repo: string,
  check_run_id: number,
  status: string,
  conclusion?: string,
  output?: object
})
```

### 6. Issues (General)

#### `issues.create`
- **Location**: AuthMetrics
- **Purpose**: Create feedback issues in YoFix repository
- **Usage**:
```typescript
octokit.rest.issues.create({
  owner: 'yofix',
  repo: 'yofix',
  title: string,
  body: string,
  labels?: string[]
})
```

## GitHub Context Data

YoFix also uses GitHub context information provided by GitHub Actions:

```typescript
github.context.repo.owner    // Repository owner
github.context.repo.repo     // Repository name
github.context.sha          // Current commit SHA
github.context.payload.pull_request?.number  // PR number
github.context.payload.comment  // Comment data (for bot commands)
```

## Authentication

All API calls use a GitHub token obtained from:
1. GitHub Actions input: `core.getInput('github-token')`
2. Environment variable: `GITHUB_TOKEN`
3. Constructor parameter (for some components)

## Rate Limiting Considerations

- Most endpoints use pagination with `per_page: 100`
- No explicit rate limit handling implemented
- Relies on Octokit's built-in retry logic

## Components Using GitHub API

1. **Core Components**:
   - GitHubCommentEngine: Main comment management
   - GitHubHook: Abstraction layer (new)
   - RobustPRReporter: PR reporting with fallbacks

2. **Bot Components**:
   - YoFixBot: Bot command handling
   - YoFixBotRefactored: Refactored bot implementation

3. **Utility Components**:
   - FirebaseConfigDetector: Reads repo configuration
   - AuthMetrics: Creates feedback issues

4. **Main Entry**:
   - index.ts: Direct API calls for error reporting

## Migration Status

- ✅ GitHubHook interface created for abstraction
- ✅ Some components migrated to use GitHubHook
- ❌ Many components still use Octokit directly
- ❌ No caching layer for API responses
- ❌ No unified error handling for API failures

## Recommendations

1. **Complete Hook Migration**: Migrate all components to use GitHubHook
2. **Add Caching**: Implement caching for frequently accessed data (PR files, comments)
3. **Rate Limit Handling**: Add explicit rate limit monitoring and handling
4. **Error Handling**: Centralize GitHub API error handling
5. **Mock Testing**: Use GitHubHook's MockGitHub for all tests