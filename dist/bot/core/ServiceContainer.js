"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotServiceProvider = exports.CompositeServiceProvider = exports.DefaultServiceContainer = exports.SERVICE_TOKENS = void 0;
exports.SERVICE_TOKENS = {
    GITHUB_CLIENT: Symbol('GithubClient'),
    STORAGE_PROVIDER: Symbol('StorageProvider'),
    ROUTE_ANALYZER: Symbol('RouteAnalyzer'),
    ROUTE_ANALYZER_FACTORY: Symbol('RouteAnalyzerFactory'),
    VISUAL_ANALYZER: Symbol('VisualAnalyzer'),
    COMMAND_REGISTRY: Symbol('CommandRegistry'),
    PROGRESS_REPORTER: Symbol('ProgressReporter'),
    COMMENT_PROCESSOR: Symbol('CommentProcessor'),
    BOT_CONFIG: Symbol('BotConfig'),
    GITHUB_TOKEN: Symbol('GithubToken'),
    CLAUDE_API_KEY: Symbol('ClaudeApiKey'),
};
class DefaultServiceContainer {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
    }
    register(token, factory) {
        this.services.set(token, factory);
    }
    registerSingleton(token, factory) {
        this.services.set(token, () => {
            if (!this.singletons.has(token)) {
                this.singletons.set(token, factory());
            }
            return this.singletons.get(token);
        });
    }
    get(token) {
        const factory = this.services.get(token);
        if (!factory) {
            throw new Error(`Service not registered: ${String(token)}`);
        }
        return factory();
    }
    has(token) {
        return this.services.has(token);
    }
}
exports.DefaultServiceContainer = DefaultServiceContainer;
class CompositeServiceProvider {
    constructor(providers) {
        this.providers = providers;
    }
    register(container) {
        this.providers.forEach(provider => provider.register(container));
    }
}
exports.CompositeServiceProvider = CompositeServiceProvider;
class BotServiceProvider {
    register(container) {
        container.registerSingleton(exports.SERVICE_TOKENS.GITHUB_TOKEN, () => {
            const token = process.env.GITHUB_TOKEN || '';
            if (!token)
                throw new Error('GitHub token not configured');
            return token;
        });
        container.registerSingleton(exports.SERVICE_TOKENS.CLAUDE_API_KEY, () => {
            const key = process.env.CLAUDE_API_KEY || '';
            if (!key)
                throw new Error('Claude API key not configured');
            return key;
        });
    }
}
exports.BotServiceProvider = BotServiceProvider;
