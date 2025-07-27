# YoFix Advanced Architecture Plan

## Overview

YoFix is an AI-powered visual testing and auto-fix system that combines proactive PR analysis with on-demand bot interactions. This document outlines the advanced architecture following modular design and DRY principles.

## Core Architecture Components

### 1. Codebase Context Manager

**Purpose**: Maintain understanding of the entire codebase to provide contextual analysis.

```
src/
├── context/
│   ├── CodebaseIndexer.ts      # Indexes and stores codebase structure
│   ├── ContextAnalyzer.ts      # Analyzes PR changes in context
│   ├── MemoryStore.ts          # Persistent memory of codebase patterns
│   └── RouteExtractor.ts       # Smart route extraction from code
```

**Key Features**:
- **Incremental Indexing**: Only index changed files on each PR
- **Pattern Learning**: Learn UI patterns, component structures, styling conventions
- **Context API**: Provide context to all other modules

### 2. Visual Analysis Engine

**Purpose**: Intelligent screenshot analysis with contextual understanding.

```
src/
├── analysis/
│   ├── VisualAnalyzer.ts       # Main analysis orchestrator
│   ├── ScreenshotCapture.ts    # Smart screenshot capture
│   ├── IssueDetector.ts        # AI-powered issue detection
│   ├── ContextualPrompts.ts    # Generate context-aware prompts
│   └── ObservationLogger.ts    # Log AI observations
```

**Flow**:
1. Capture screenshots with metadata
2. Generate contextual prompts based on code changes
3. Analyze with Claude Vision API
4. Log observations with confidence scores

### 3. Baseline Management System

**Purpose**: Maintain and compare visual baselines.

```
src/
├── baseline/
│   ├── BaselineManager.ts      # Core baseline operations
│   ├── BaselineStorage.ts      # Store baselines (Firebase/S3)
│   ├── DiffGenerator.ts        # Visual diff generation
│   ├── BaselineStrategy.ts     # Branch/tag/main strategies
│   └── ChangeDetector.ts       # Intelligent change detection
```

**Baseline Strategies**:
- **Branch-based**: Each branch maintains its baseline
- **Main-based**: Always compare against main branch
- **Tag-based**: Compare against release tags
- **Smart Selection**: Auto-select strategy based on workflow

### 4. Fix Generation Engine

**Purpose**: Generate context-aware, committable code fixes.

```
src/
├── fixes/
│   ├── FixGenerator.ts         # Main fix generation
│   ├── CodeAnalyzer.ts         # Analyze existing code patterns
│   ├── FixValidator.ts         # Validate fixes won't break
│   ├── SnippetFormatter.ts     # Format as GitHub suggestions
│   └── CommitGenerator.ts      # Generate commit-ready code
```

### 5. On-Demand Bot System

**Purpose**: Interactive bot responding to GitHub comments.

```
src/
├── bot/
│   ├── YoFixBot.ts            # Main bot controller
│   ├── CommandParser.ts       # Parse @yofix commands
│   ├── ActionExecutor.ts      # Execute bot actions
│   ├── MCPIntegration.ts      # MCP browser automation
│   └── ResponseFormatter.ts   # Format bot responses
```

### 6. MCP Integration Layer

**Purpose**: Enable advanced browser automation for on-demand testing.

```
src/
├── mcp/
│   ├── MCPManager.ts          # Manage MCP connections
│   ├── PlaywrightMCP.ts       # Playwright MCP adapter
│   ├── PuppeteerMCP.ts        # Puppeteer MCP adapter
│   ├── BrowserPool.ts         # Manage browser instances
│   └── ActionRecorder.ts      # Record/replay actions
```

## General Flow Implementation

### Phase 1: Codebase Understanding

```typescript
interface CodebaseContext {
  structure: FileTree;
  routes: Route[];
  components: Component[];
  styles: StyleSystem;
  patterns: UIPattern[];
  dependencies: Dependency[];
}

class CodebaseIndexer {
  async indexRepository(repo: string): Promise<CodebaseContext> {
    // 1. Clone/fetch repository
    // 2. Analyze file structure
    // 3. Extract routes and components
    // 4. Identify styling patterns
    // 5. Store in MemoryStore
  }
}
```

### Phase 2: Contextual Analysis

```typescript
class ContextualAnalyzer {
  async analyzeWithContext(
    screenshot: Buffer, 
    route: string,
    prContext: PRContext
  ): Promise<Analysis> {
    const context = await this.contextManager.getRouteContext(route);
    
    const prompt = this.generateContextualPrompt({
      changedFiles: prContext.files,
      relatedComponents: context.components,
      styleChanges: context.styleChanges,
      expectedBehavior: context.patterns
    });
    
    return await this.claude.analyzeWithPrompt(screenshot, prompt);
  }
}
```

### Phase 3: Baseline Comparison

```typescript
interface BaselineComparison {
  hasDifferences: boolean;
  diffImage: Buffer;
  changes: VisualChange[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  explanation: string;
}

class BaselineManager {
  async compareWithBaseline(
    current: Screenshot,
    route: string,
    viewport: Viewport
  ): Promise<BaselineComparison> {
    const baseline = await this.storage.getBaseline(route, viewport);
    const diff = await this.diffGenerator.generate(baseline, current);
    const analysis = await this.analyzer.explainDifferences(diff);
    
    return {
      hasDifferences: diff.percentage > this.threshold,
      diffImage: diff.image,
      changes: analysis.changes,
      severity: this.calculateSeverity(analysis),
      explanation: analysis.explanation
    };
  }
}
```

### Phase 4: Fix Generation

```typescript
class FixGenerator {
  async generateFix(
    issue: VisualIssue,
    context: CodebaseContext
  ): Promise<Fix> {
    // 1. Analyze existing code patterns
    const patterns = await this.codeAnalyzer.findSimilarPatterns(issue);
    
    // 2. Generate fix following conventions
    const fix = await this.claude.generateFix({
      issue,
      patterns,
      styleGuide: context.styles,
      framework: context.framework
    });
    
    // 3. Validate fix
    const validation = await this.validator.validate(fix);
    
    // 4. Format as GitHub suggestion
    return this.formatter.asGitHubSuggestion(fix);
  }
}
```

## On-Demand Bot Flow

### Command Structure

```
@yofix test /dashboard with mobile viewport
@yofix compare this with production
@yofix generate fix for navigation overlap
@yofix run custom test "click button and check modal"
```

### Bot Architecture

```typescript
class YoFixBot {
  private mcpManager: MCPManager;
  private commandParser: CommandParser;
  
  async handleCommand(comment: GitHubComment): Promise<void> {
    const command = this.commandParser.parse(comment.body);
    
    switch (command.action) {
      case 'test':
        await this.runCustomTest(command);
        break;
      case 'compare':
        await this.runComparison(command);
        break;
      case 'fix':
        await this.generateFix(command);
        break;
    }
  }
  
  private async runCustomTest(command: BotCommand): Promise<void> {
    // 1. Start MCP session
    const browser = await this.mcpManager.getBrowser();
    
    // 2. Execute test steps
    const results = await browser.execute(command.steps);
    
    // 3. Capture and analyze
    const analysis = await this.analyzer.analyze(results);
    
    // 4. Post results
    await this.postResults(analysis);
  }
}
```

### MCP Integration Strategy

**Recommendation**: Use Playwright MCP as primary, with Puppeteer as fallback.

```typescript
class MCPManager {
  private playwright: PlaywrightMCP;
  private puppeteer: PuppeteerMCP;
  
  async getBrowser(options?: BrowserOptions): Promise<MCPBrowser> {
    try {
      // Try Playwright first (better features)
      return await this.playwright.launch(options);
    } catch (error) {
      // Fallback to Puppeteer (lighter weight)
      return await this.puppeteer.launch(options);
    }
  }
}
```

## Modular Extension Points

### 1. Framework Adapters

```typescript
interface FrameworkAdapter {
  detectFramework(): Framework;
  extractRoutes(): Route[];
  parseComponents(): Component[];
  getStyleSystem(): StyleSystem;
}

// Implementations
class ReactAdapter implements FrameworkAdapter {}
class VueAdapter implements FrameworkAdapter {}
class AngularAdapter implements FrameworkAdapter {}
```

### 2. Storage Providers

```typescript
interface StorageProvider {
  saveScreenshot(screenshot: Buffer): Promise<string>;
  getBaseline(route: string): Promise<Buffer>;
  updateBaseline(route: string, screenshot: Buffer): Promise<void>;
}

// Implementations
class FirebaseStorage implements StorageProvider {}
class S3Storage implements StorageProvider {}
class LocalStorage implements StorageProvider {}
```

### 3. AI Providers

```typescript
interface AIProvider {
  analyzeImage(image: Buffer, prompt: string): Promise<Analysis>;
  generateFix(context: FixContext): Promise<Fix>;
}

// Implementations
class ClaudeProvider implements AIProvider {}
class OpenAIProvider implements AIProvider {}
```

## Performance Optimizations

### 1. Caching Strategy

- **Context Cache**: Cache codebase analysis for 24 hours
- **Screenshot Cache**: Cache unchanged routes
- **Analysis Cache**: Cache AI responses for identical inputs

### 2. Parallel Processing

- Run multiple viewport tests in parallel
- Batch AI API calls when possible
- Use worker threads for heavy processing

### 3. Incremental Analysis

- Only analyze changed routes
- Skip unchanged components
- Reuse baseline comparisons

## Security Considerations

### 1. Credential Management

- Encrypt stored credentials
- Use GitHub Secrets for sensitive data
- Implement credential rotation

### 2. Access Control

- Verify PR permissions
- Limit bot actions to authorized users
- Audit all bot activities

### 3. Data Privacy

- Don't store sensitive screenshots
- Anonymize data in logs
- Comply with data retention policies

## Deployment Architecture

### GitHub Action Mode

```yaml
- uses: yofix/yofix@v1
  with:
    mode: action
    preview-url: ${{ steps.deploy.outputs.url }}
    baseline-strategy: branch
```

### GitHub App Mode

```yaml
# Automatic via GitHub App installation
# No workflow file needed
```

### Self-Hosted Mode

```yaml
# Deploy YoFix on your infrastructure
docker run yofix/yofix-server
```

## Success Metrics

1. **Analysis Accuracy**: >90% issue detection rate
2. **Fix Success Rate**: >80% of generated fixes work without modification  
3. **Performance**: <2 minutes for full PR analysis
4. **Cost Efficiency**: <$0.10 per PR analysis

## Next Steps

1. Implement CodebaseIndexer for repository understanding
2. Build MCP integration layer
3. Create baseline management system
4. Enhance bot command parsing
5. Add framework adapters starting with React