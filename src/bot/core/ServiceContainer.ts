/**
 * Service container for dependency injection
 * Follows Dependency Inversion Principle
 */

export interface ServiceContainer {
  register<T>(token: string | symbol, factory: () => T): void;
  registerSingleton<T>(token: string | symbol, factory: () => T): void;
  get<T>(token: string | symbol): T;
  has(token: string | symbol): boolean;
}

/**
 * Service tokens for type-safe dependency injection
 */
export const SERVICE_TOKENS = {
  // Core services
  GITHUB_CLIENT: Symbol('GithubClient'),
  STORAGE_PROVIDER: Symbol('StorageProvider'),
  
  // Analyzers
  ROUTE_ANALYZER: Symbol('RouteAnalyzer'),
  ROUTE_ANALYZER_FACTORY: Symbol('RouteAnalyzerFactory'),
  VISUAL_ANALYZER: Symbol('VisualAnalyzer'),
  
  // Bot services
  COMMAND_REGISTRY: Symbol('CommandRegistry'),
  PROGRESS_REPORTER: Symbol('ProgressReporter'),
  COMMENT_PROCESSOR: Symbol('CommentProcessor'),
  
  // Configuration
  BOT_CONFIG: Symbol('BotConfig'),
  GITHUB_TOKEN: Symbol('GithubToken'),
  CLAUDE_API_KEY: Symbol('ClaudeApiKey'),
} as const;

/**
 * Default implementation of service container
 */
export class DefaultServiceContainer implements ServiceContainer {
  private services = new Map<string | symbol, () => any>();
  private singletons = new Map<string | symbol, any>();

  register<T>(token: string | symbol, factory: () => T): void {
    this.services.set(token, factory);
  }

  registerSingleton<T>(token: string | symbol, factory: () => T): void {
    this.services.set(token, () => {
      if (!this.singletons.has(token)) {
        this.singletons.set(token, factory());
      }
      return this.singletons.get(token);
    });
  }

  get<T>(token: string | symbol): T {
    const factory = this.services.get(token);
    if (!factory) {
      throw new Error(`Service not registered: ${String(token)}`);
    }
    return factory();
  }

  has(token: string | symbol): boolean {
    return this.services.has(token);
  }
}

/**
 * Service provider interface for modular service registration
 */
export interface ServiceProvider {
  register(container: ServiceContainer): void;
}

/**
 * Composite service provider
 */
export class CompositeServiceProvider implements ServiceProvider {
  constructor(private providers: ServiceProvider[]) {}

  register(container: ServiceContainer): void {
    this.providers.forEach(provider => provider.register(container));
  }
}

/**
 * Example service provider for bot services
 */
export class BotServiceProvider implements ServiceProvider {
  register(container: ServiceContainer): void {
    // Register GitHub token
    container.registerSingleton(SERVICE_TOKENS.GITHUB_TOKEN, () => {
      const token = process.env.GITHUB_TOKEN || '';
      if (!token) throw new Error('GitHub token not configured');
      return token;
    });

    // Register Claude API key
    container.registerSingleton(SERVICE_TOKENS.CLAUDE_API_KEY, () => {
      const key = process.env.CLAUDE_API_KEY || '';
      if (!key) throw new Error('Claude API key not configured');
      return key;
    });
  }
}