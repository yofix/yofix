# SOLID Architecture Refactoring for YoFix Bot

## Current Issues

### 1. **Single Responsibility Principle (SRP) Violations**
- `CommandHandler` has too many responsibilities:
  - Command execution
  - Progress reporting
  - Direct instantiation of services
  - Cache management
  - Help text generation

### 2. **Open/Closed Principle (OCP) Violations**
- Adding new commands requires modifying `CommandHandler`
- Switch statement in `execute()` method
- Hard-coded command implementations

### 3. **Liskov Substitution Principle (LSP) Issues**
- No clear abstraction for commands
- Direct coupling to concrete implementations

### 4. **Interface Segregation Principle (ISP) Violations**
- Large interfaces with many methods
- Clients forced to depend on methods they don't use

### 5. **Dependency Inversion Principle (DIP) Violations**
- Direct instantiation of dependencies in constructors
- Tight coupling to concrete classes (e.g., `new VisualAnalyzer()`)

## Proposed SOLID Architecture

### 1. Command Pattern with Strategy

```typescript
// Command abstraction
interface BotCommandHandler {
  canHandle(command: BotCommand): boolean;
  execute(command: BotCommand, context: BotContext): Promise<BotResponse>;
  getHelpText(): string;
}

// Command registry
interface CommandRegistry {
  register(handler: BotCommandHandler): void;
  getHandler(command: BotCommand): BotCommandHandler | null;
  getAllHandlers(): BotCommandHandler[];
}

// Progress reporter abstraction
interface ProgressReporter {
  report(message: string): Promise<void>;
}

// Example: Impact command handler
class ImpactCommandHandler implements BotCommandHandler {
  constructor(
    private readonly analyzer: RouteAnalyzer,
    private readonly formatter: ImpactFormatter,
    private readonly progress?: ProgressReporter
  ) {}

  canHandle(command: BotCommand): boolean {
    return command.action === 'impact';
  }

  async execute(command: BotCommand, context: BotContext): Promise<BotResponse> {
    await this.progress?.report('🔄 Analyzing route impact...');
    const impact = await this.analyzer.analyze(context.prNumber);
    const formatted = this.formatter.format(impact);
    return { success: true, message: formatted };
  }

  getHelpText(): string {
    return '`@yofix impact` - Show route impact tree';
  }
}
```

### 2. Dependency Injection Container

```typescript
// Service container interface
interface ServiceContainer {
  register<T>(token: string, factory: () => T): void;
  get<T>(token: string): T;
}

// Tokens for dependency injection
const TOKENS = {
  GITHUB_CLIENT: 'GithubClient',
  ROUTE_ANALYZER: 'RouteAnalyzer',
  STORAGE_PROVIDER: 'StorageProvider',
  PROGRESS_REPORTER: 'ProgressReporter',
  COMMAND_REGISTRY: 'CommandRegistry'
} as const;

// Factory pattern for creating services
class ServiceFactory {
  static createContainer(config: BotConfig): ServiceContainer {
    const container = new DefaultServiceContainer();
    
    // Register core services
    container.register(TOKENS.GITHUB_CLIENT, () => 
      github.getOctokit(config.githubToken)
    );
    
    container.register(TOKENS.STORAGE_PROVIDER, () => 
      StorageFactory.create(config.storage)
    );
    
    container.register(TOKENS.ROUTE_ANALYZER, () => 
      new TreeSitterRouteAnalyzer(
        config.rootPath,
        container.get(TOKENS.STORAGE_PROVIDER)
      )
    );
    
    return container;
  }
}
```

### 3. Refactored Bot Architecture

```typescript
// Main bot interface
interface Bot {
  handleComment(context: GitHubContext): Promise<void>;
}

// Comment processor abstraction
interface CommentProcessor {
  process(comment: Comment): Promise<ProcessResult>;
}

// GitHub interaction abstraction
interface GitHubInteractor {
  addReaction(commentId: number, reaction: string): Promise<void>;
  createComment(issueNumber: number, body: string): Promise<Comment>;
  updateComment(commentId: number, body: string): Promise<void>;
}

// Refactored YoFixBot
class YoFixBot implements Bot {
  constructor(
    private readonly commentProcessor: CommentProcessor,
    private readonly githubInteractor: GitHubInteractor,
    private readonly commandRegistry: CommandRegistry
  ) {}

  async handleComment(context: GitHubContext): Promise<void> {
    const result = await this.commentProcessor.process(context.comment);
    
    if (!result.isValid) {
      await this.handleInvalidCommand(context);
      return;
    }

    await this.executeCommand(result.command, context);
  }

  private async executeCommand(
    command: BotCommand, 
    context: GitHubContext
  ): Promise<void> {
    // Add acknowledgment
    await this.githubInteractor.addReaction(context.comment.id, 'eyes');
    
    // Get handler
    const handler = this.commandRegistry.getHandler(command);
    if (!handler) {
      await this.handleUnknownCommand(context);
      return;
    }

    // Execute with progress
    const progressComment = await this.createProgressComment(context);
    const progress = new CommentProgressReporter(
      this.githubInteractor,
      progressComment.id
    );

    try {
      const result = await handler.execute(command, {
        prNumber: context.issue.number,
        repo: context.repo,
        progress
      });
      
      await progress.report(result.message);
    } catch (error) {
      await progress.report(`❌ Error: ${error.message}`);
    }
  }
}
```

### 4. Route Analysis Abstraction

```typescript
// Route analyzer abstraction
interface RouteAnalyzer {
  analyze(prNumber: number): Promise<RouteImpact>;
  clearCache(): Promise<void>;
  getCacheStatus(): CacheStatus;
}

// Cache abstraction
interface CacheManager {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  clear(): Promise<void>;
  getStatus(): CacheStatus;
}

// Formatter abstraction
interface ImpactFormatter {
  format(impact: RouteImpact): string;
}

// Implementation with proper separation
class CachedRouteAnalyzer implements RouteAnalyzer {
  constructor(
    private readonly analyzer: RouteAnalyzer,
    private readonly cache: CacheManager
  ) {}

  async analyze(prNumber: number): Promise<RouteImpact> {
    const cacheKey = `impact-${prNumber}`;
    const cached = await this.cache.get<RouteImpact>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await this.analyzer.analyze(prNumber);
    await this.cache.set(cacheKey, result);
    return result;
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  getCacheStatus(): CacheStatus {
    return this.cache.getStatus();
  }
}
```

### 5. Command Factory Pattern

```typescript
// Command factory
class CommandHandlerFactory {
  static createHandlers(container: ServiceContainer): BotCommandHandler[] {
    return [
      new ImpactCommandHandler(
        container.get(TOKENS.ROUTE_ANALYZER),
        new MarkdownImpactFormatter(),
        container.get(TOKENS.PROGRESS_REPORTER)
      ),
      new CacheCommandHandler(
        container.get(TOKENS.ROUTE_ANALYZER),
        container.get(TOKENS.PROGRESS_REPORTER)
      ),
      new ScanCommandHandler(
        container.get(TOKENS.VISUAL_ANALYZER),
        container.get(TOKENS.PROGRESS_REPORTER)
      ),
      // ... other handlers
    ];
  }
}

// Registration
function registerCommands(
  registry: CommandRegistry,
  container: ServiceContainer
): void {
  const handlers = CommandHandlerFactory.createHandlers(container);
  handlers.forEach(handler => registry.register(handler));
}
```

## Benefits of This Architecture

### 1. **Single Responsibility**
- Each class has one clear responsibility
- Commands are self-contained
- Separation of concerns is maintained

### 2. **Open/Closed**
- New commands can be added without modifying existing code
- Just create a new handler and register it

### 3. **Liskov Substitution**
- All command handlers implement the same interface
- Can be substituted without breaking the system

### 4. **Interface Segregation**
- Small, focused interfaces
- Clients only depend on what they need

### 5. **Dependency Inversion**
- Depend on abstractions, not concretions
- All dependencies are injected
- Easy to test with mocks

## Migration Strategy

### Phase 1: Create Abstractions
1. Define all interfaces
2. Create adapters for existing code
3. No breaking changes

### Phase 2: Refactor Commands
1. Extract each command to its own handler
2. Implement command registry
3. Update bot to use registry

### Phase 3: Implement DI Container
1. Create service container
2. Register all services
3. Update constructors to use injection

### Phase 4: Complete Migration
1. Remove old CommandHandler
2. Clean up unused code
3. Update tests

## Testing Strategy

```typescript
// Easy to test with mocks
describe('ImpactCommandHandler', () => {
  it('should analyze route impact', async () => {
    const mockAnalyzer = {
      analyze: jest.fn().mockResolvedValue({ routes: ['/'] })
    };
    const mockFormatter = {
      format: jest.fn().mockReturnValue('Formatted impact')
    };
    const mockProgress = {
      report: jest.fn()
    };

    const handler = new ImpactCommandHandler(
      mockAnalyzer,
      mockFormatter,
      mockProgress
    );

    const result = await handler.execute(
      { action: 'impact', args: '' },
      { prNumber: 123 }
    );

    expect(mockAnalyzer.analyze).toHaveBeenCalledWith(123);
    expect(mockFormatter.format).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
```

## Configuration

```typescript
// config/bot.config.ts
export interface BotConfig {
  githubToken: string;
  claudeApiKey: string;
  storage: StorageConfig;
  rootPath: string;
}

// config/container.config.ts
export function configureBotContainer(config: BotConfig): ServiceContainer {
  const container = ServiceFactory.createContainer(config);
  
  // Register command handlers
  const registry = new DefaultCommandRegistry();
  registerCommands(registry, container);
  container.register(TOKENS.COMMAND_REGISTRY, () => registry);
  
  return container;
}

// main.ts
async function createBot(config: BotConfig): Promise<Bot> {
  const container = configureBotContainer(config);
  
  return new YoFixBot(
    new DefaultCommentProcessor(),
    container.get(TOKENS.GITHUB_INTERACTOR),
    container.get(TOKENS.COMMAND_REGISTRY)
  );
}
```

This architecture provides:
- Clear separation of concerns
- Easy testing
- Simple extension points
- No tight coupling
- Follows all SOLID principles