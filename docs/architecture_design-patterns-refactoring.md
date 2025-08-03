# YoFix Architecture Refactoring: Design Patterns & Recommendations

## Executive Summary

Transform YoFix from a tightly-coupled GitHub Action into a modular visual regression engine that can run anywhere.

## Recommended Design Patterns

### 1. **Hexagonal Architecture (Ports & Adapters)**

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Boundary                      │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                                                     │  │
│  │              Core Domain (Pure Logic)               │  │
│  │                                                     │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐ │  │
│  │  │Route Impact │  │Visual Testing│  │ Analysis  │ │  │
│  │  │  Analyzer   │  │   Engine     │  │ Engine   │ │  │
│  │  └─────────────┘  └──────────────┘  └──────────┘ │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                            ▲                                │
│  ┌─────────────────────────┼─────────────────────────────┐ │
│  │                    Port Interfaces                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐ │ │
│  │  │ChangeSet │  │ Preview  │  │ Results  │  │Logger│ │ │
│  │  │ Provider │  │ Provider │  │Publisher │  │      │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────┘ │ │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────┼─────────────────────────────┐
│                        Adapters                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  GitHub  │  │   Git    │  │  File    │  │ Console  │ │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ Adapter  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 2. **Dependency Injection with Interfaces**

```typescript
// Core Domain Interfaces (Ports)
interface ChangeSetProvider {
  getChangedFiles(): Promise<string[]>;
  getCodebasePath(): string;
}

interface PreviewProvider {
  getPreviewUrl(route: string): string;
  isAuthenticated(): Promise<boolean>;
}

interface ResultsPublisher {
  publish(results: VisualTestResults): Promise<void>;
  publishProgress(message: string): Promise<void>;
}

interface Logger {
  info(message: string): void;
  error(message: string, error?: Error): void;
  debug(message: string): void;
}

// Core Engine with Dependency Injection
export class VisualRegressionEngine {
  constructor(
    private changeProvider: ChangeSetProvider,
    private previewProvider: PreviewProvider,
    private publisher: ResultsPublisher,
    private logger: Logger
  ) {}

  async run(): Promise<void> {
    this.logger.info('Starting visual regression testing');
    
    const changedFiles = await this.changeProvider.getChangedFiles();
    const impactedRoutes = await this.analyzeImpact(changedFiles);
    
    for (const route of impactedRoutes) {
      const url = this.previewProvider.getPreviewUrl(route);
      const results = await this.testRoute(url);
      await this.publisher.publish(results);
    }
  }
}
```

### 3. **Strategy Pattern for Different Contexts**

```typescript
// Strategy Interface
interface ExecutionStrategy {
  initialize(): Promise<void>;
  execute(config: VisualTestConfig): Promise<VisualTestResults>;
  cleanup(): Promise<void>;
}

// GitHub Actions Strategy
class GitHubActionsStrategy implements ExecutionStrategy {
  async initialize() {
    // Setup GitHub context
  }
  
  async execute(config: VisualTestConfig) {
    // Execute with GitHub integrations
  }
  
  async cleanup() {
    // Post to PR, update checks
  }
}

// Local Development Strategy
class LocalDevStrategy implements ExecutionStrategy {
  async initialize() {
    // Setup local environment
  }
  
  async execute(config: VisualTestConfig) {
    // Execute with local tools
  }
  
  async cleanup() {
    // Save to files, open browser
  }
}

// API Service Strategy
class APIServiceStrategy implements ExecutionStrategy {
  async initialize() {
    // Setup API context
  }
  
  async execute(config: VisualTestConfig) {
    // Execute as service
  }
  
  async cleanup() {
    // Return JSON response
  }
}
```

### 4. **Factory Pattern for Adapter Creation**

```typescript
export class AdapterFactory {
  static createAdapters(context: ExecutionContext): Adapters {
    switch (context.type) {
      case 'github-action':
        return {
          changeProvider: new GitHubChangeProvider(context.githubToken),
          previewProvider: new GitHubPreviewProvider(context.previewUrl),
          publisher: new GitHubCommentPublisher(context.githubToken),
          logger: new GitHubActionLogger()
        };
        
      case 'local':
        return {
          changeProvider: new GitDiffProvider(context.repoPath),
          previewProvider: new LocalPreviewProvider(context.baseUrl),
          publisher: new FileSystemPublisher(context.outputDir),
          logger: new ConsoleLogger()
        };
        
      case 'api':
        return {
          changeProvider: new APIChangeProvider(context.changedFiles),
          previewProvider: new RemotePreviewProvider(context.previewUrl),
          publisher: new APIResponsePublisher(),
          logger: new StructuredLogger()
        };
        
      default:
        throw new Error(`Unknown context: ${context.type}`);
    }
  }
}
```

### 5. **Chain of Responsibility for Processing Pipeline**

```typescript
abstract class TestStepHandler {
  protected next: TestStepHandler | null = null;
  
  setNext(handler: TestStepHandler): TestStepHandler {
    this.next = handler;
    return handler;
  }
  
  async handle(context: TestContext): Promise<TestContext> {
    const result = await this.process(context);
    if (this.next) {
      return this.next.handle(result);
    }
    return result;
  }
  
  abstract process(context: TestContext): Promise<TestContext>;
}

// Concrete Handlers
class RouteExtractionHandler extends TestStepHandler {
  async process(context: TestContext) {
    context.routes = await this.extractRoutes(context.changedFiles);
    return context;
  }
}

class AuthenticationHandler extends TestStepHandler {
  async process(context: TestContext) {
    if (context.requiresAuth) {
      await this.authenticate(context);
    }
    return context;
  }
}

class ScreenshotHandler extends TestStepHandler {
  async process(context: TestContext) {
    context.screenshots = await this.captureScreenshots(context.routes);
    return context;
  }
}

class AnalysisHandler extends TestStepHandler {
  async process(context: TestContext) {
    context.analysis = await this.analyzeScreenshots(context.screenshots);
    return context;
  }
}

// Usage
const pipeline = new RouteExtractionHandler();
pipeline
  .setNext(new AuthenticationHandler())
  .setNext(new ScreenshotHandler())
  .setNext(new AnalysisHandler());

const result = await pipeline.handle(initialContext);
```

### 6. **Observer Pattern for Progress Reporting**

```typescript
interface TestObserver {
  onTestStart(route: string): void;
  onTestProgress(route: string, step: string, progress: number): void;
  onTestComplete(route: string, results: TestResult): void;
  onTestError(route: string, error: Error): void;
}

class VisualTestSubject {
  private observers: TestObserver[] = [];
  
  attach(observer: TestObserver): void {
    this.observers.push(observer);
  }
  
  notify(event: TestEvent): void {
    this.observers.forEach(observer => {
      switch (event.type) {
        case 'start':
          observer.onTestStart(event.route);
          break;
        case 'progress':
          observer.onTestProgress(event.route, event.step, event.progress);
          break;
        case 'complete':
          observer.onTestComplete(event.route, event.results);
          break;
        case 'error':
          observer.onTestError(event.route, event.error);
          break;
      }
    });
  }
}

// Different Observers
class GitHubCheckObserver implements TestObserver {
  onTestProgress(route: string, step: string, progress: number) {
    // Update GitHub check run
  }
}

class ConsoleObserver implements TestObserver {
  onTestProgress(route: string, step: string, progress: number) {
    console.log(`[${route}] ${step}: ${progress}%`);
  }
}

class WebSocketObserver implements TestObserver {
  onTestProgress(route: string, step: string, progress: number) {
    this.ws.send({ route, step, progress });
  }
}
```

## Architectural Changes

### 1. **Layered Architecture**

```
┌─────────────────────────────────────────┐
│          Presentation Layer             │
│   (CLI, API, GitHub Action, Web UI)    │
├─────────────────────────────────────────┤
│          Application Layer              │
│   (Use Cases, Orchestration)           │
├─────────────────────────────────────────┤
│           Domain Layer                  │
│   (Core Business Logic, Entities)      │
├─────────────────────────────────────────┤
│        Infrastructure Layer             │
│   (External Services, Persistence)     │
└─────────────────────────────────────────┘
```

### 2. **Module Structure**

```
yofix/
├── packages/
│   ├── core/                    # Pure business logic
│   │   ├── src/
│   │   │   ├── domain/         # Core entities
│   │   │   ├── services/       # Domain services
│   │   │   └── ports/          # Interface definitions
│   │   └── package.json
│   │
│   ├── adapters/               # External integrations
│   │   ├── github/
│   │   ├── git/
│   │   ├── filesystem/
│   │   └── api/
│   │
│   ├── cli/                    # CLI application
│   │   └── src/
│   │       └── commands/
│   │
│   ├── github-action/          # GitHub Action wrapper
│   │   └── src/
│   │       └── index.ts
│   │
│   └── api/                    # REST API service
│       └── src/
│           └── routes/
│
├── examples/                   # Usage examples
└── docs/                      # Documentation
```

### 3. **Configuration Management**

```typescript
// Configuration Schema
interface YoFixConfig {
  // Core settings
  engine: {
    maxConcurrency: number;
    timeout: number;
    retryAttempts: number;
  };
  
  // Provider settings
  providers: {
    change: 'github' | 'git' | 'manual';
    preview: 'url' | 'local' | 'dynamic';
    storage: 'firebase' | 's3' | 'local';
    publisher: 'github' | 'file' | 'console' | 'api';
  };
  
  // Feature flags
  features: {
    smartAuth: boolean;
    aiAnalysis: boolean;
    autoFix: boolean;
    parallelExecution: boolean;
  };
}

// Configuration Loader
class ConfigurationManager {
  private config: YoFixConfig;
  
  load(): YoFixConfig {
    // Priority order:
    // 1. Environment variables
    // 2. Config file (.yofix.yml)
    // 3. Command line arguments
    // 4. Default values
    
    return this.merge(
      this.loadDefaults(),
      this.loadFromFile(),
      this.loadFromEnv(),
      this.loadFromArgs()
    );
  }
}
```

### 4. **Event-Driven Architecture for Extensibility**

```typescript
// Event Bus
class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  
  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }
  
  emit(event: string, data: any): void {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }
}

// Core Events
enum CoreEvents {
  TEST_STARTED = 'test.started',
  ROUTE_DISCOVERED = 'route.discovered',
  SCREENSHOT_CAPTURED = 'screenshot.captured',
  ISSUE_FOUND = 'issue.found',
  TEST_COMPLETED = 'test.completed'
}

// Plugin System
interface YoFixPlugin {
  name: string;
  version: string;
  init(context: PluginContext): void;
}

class PluginManager {
  async loadPlugins(config: PluginConfig): Promise<void> {
    for (const plugin of config.plugins) {
      const module = await import(plugin.package);
      module.default.init(this.context);
    }
  }
}
```

## Implementation Roadmap

### Phase 1: Core Extraction (2 weeks)
1. Extract pure business logic from GitHub dependencies
2. Define core interfaces (ports)
3. Create domain models
4. Write comprehensive tests

### Phase 2: Adapter Implementation (2 weeks)
1. Implement GitHub adapters (current functionality)
2. Implement local development adapters
3. Create API adapters
4. Add adapter tests

### Phase 3: CLI Development (1 week)
1. Create CLI using Commander.js
2. Add local development commands
3. Interactive mode for configuration
4. Progress reporting

### Phase 4: Modularization (1 week)
1. Split into npm packages
2. Setup monorepo with Lerna/Nx
3. Configure package publishing
4. Update documentation

### Phase 5: Plugin System (1 week)
1. Define plugin API
2. Create example plugins
3. Add plugin loader
4. Document plugin development

## Benefits

1. **Flexibility**: Run anywhere (CLI, API, GitHub, CI/CD)
2. **Testability**: Pure functions, mockable dependencies
3. **Maintainability**: Clear separation of concerns
4. **Extensibility**: Plugin system for custom features
5. **Reusability**: Core engine as npm package
6. **Performance**: Parallel execution, caching
7. **Developer Experience**: Better debugging, local testing

## Example Usage After Refactoring

### CLI Usage
```bash
# Local development
yofix test --url http://localhost:3000 --changed "src/**/*.tsx"

# CI/CD pipeline
yofix test --config .yofix.yml --output junit.xml

# Interactive mode
yofix interactive
```

### Programmatic Usage
```typescript
import { VisualRegressionEngine, LocalAdapters } from '@yofix/core';

const engine = new VisualRegressionEngine({
  adapters: LocalAdapters.create({
    repoPath: './my-app',
    previewUrl: 'http://localhost:3000',
    outputDir: './test-results'
  }),
  config: {
    features: {
      smartAuth: true,
      aiAnalysis: true
    }
  }
});

const results = await engine.run();
```

### Plugin Development
```typescript
export default class CustomReporter implements YoFixPlugin {
  name = 'custom-reporter';
  version = '1.0.0';
  
  init(context: PluginContext) {
    context.events.on(CoreEvents.ISSUE_FOUND, (issue) => {
      // Custom reporting logic
      this.sendToSlack(issue);
    });
  }
}
```

## Conclusion

These architectural changes will transform YoFix from a GitHub-specific tool into a versatile visual regression platform that can be used in any context while maintaining backward compatibility with existing GitHub Action usage.