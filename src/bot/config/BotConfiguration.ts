import { ServiceContainer, DefaultServiceContainer, SERVICE_TOKENS } from '../core/ServiceContainer';
import { CommandRegistry, CommandRegistryBuilder } from '../core/CommandRegistry';
import { StorageFactory } from '../../providers/storage/StorageFactory';
import { ImpactCommandHandler, DefaultRouteAnalyzerFactory } from '../handlers/ImpactCommandHandler';
import { ProgressReporter, NullProgressReporter } from '../core/ProgressReporter';
import { GitHubHook, GitHubFactory, GitHubActionsHook } from '../../core/hooks/GitHubHook';
import { LoggerHook, LoggerFactory } from '../../core/hooks/LoggerHook';
// import * as github from '@actions/github'; // Removed - now using GitHubServiceFactory
import { GitHubServiceFactory } from '../../core/github/GitHubServiceFactory';
import * as core from '@actions/core';

/**
 * Bot configuration interface
 */
export interface BotConfig {
  // githubToken: string; // Removed - now handled by GitHubServiceFactory
  claudeApiKey: string;
  rootPath?: string;
  storageProvider?: string;
}

/**
 * Configuration builder for the bot
 * Follows Builder pattern and Dependency Injection
 */
export class BotConfigurationBuilder {
  private container: ServiceContainer = new DefaultServiceContainer();
  private config: BotConfig;

  constructor(config: BotConfig) {
    this.config = config;
  }

  /**
   * Configure core services
   */
  configureCoreServices(): this {
    // GitHub client
    this.container.registerSingleton(SERVICE_TOKENS.GITHUB_CLIENT, () => 
      GitHubServiceFactory.getService()
    );

    // Storage provider
    this.container.registerSingleton(SERVICE_TOKENS.STORAGE_PROVIDER, async () => {
      try {
        if (this.config.storageProvider && this.config.storageProvider !== 'github') {
          return await StorageFactory.createFromInputs();
        }
      } catch (error) {
        core.debug(`Storage provider initialization failed: ${error}`);
      }
      return null;
    });

    // Route analyzer factory
    this.container.registerSingleton(SERVICE_TOKENS.ROUTE_ANALYZER_FACTORY, () => 
      new DefaultRouteAnalyzerFactory(
        this.config.rootPath
      )
    );

    return this;
  }

  /**
   * Configure command handlers
   */
  configureCommandHandlers(): this {
    const registry = new CommandRegistryBuilder();

    // Get services from container
    const analyzerFactory = this.container.get(SERVICE_TOKENS.ROUTE_ANALYZER_FACTORY) as any;
    const storageProvider = this.container.get(SERVICE_TOKENS.STORAGE_PROVIDER) as any;

    // Register impact command handler
    registry.add(new ImpactCommandHandler(
      analyzerFactory,
      storageProvider,
      this.container.has(SERVICE_TOKENS.PROGRESS_REPORTER) 
        ? this.container.get(SERVICE_TOKENS.PROGRESS_REPORTER)
        : new NullProgressReporter()
    ));

    // Register other command handlers here...
    // registry.add(new CacheCommandHandler(...));
    // registry.add(new ScanCommandHandler(...));

    // Register the built registry
    this.container.registerSingleton(
      SERVICE_TOKENS.COMMAND_REGISTRY, 
      () => registry.build()
    );

    return this;
  }

  /**
   * Set progress reporter
   */
  withProgressReporter(reporter: ProgressReporter): this {
    this.container.register(SERVICE_TOKENS.PROGRESS_REPORTER, () => reporter);
    return this;
  }

  /**
   * Build the configured container
   */
  build(): ServiceContainer {
    // Ensure all required services are configured
    this.configureCoreServices();
    this.configureCommandHandlers();
    
    return this.container;
  }
}

/**
 * Factory method for creating a configured bot
 */
export function createBotConfiguration(config: BotConfig): ServiceContainer {
  return new BotConfigurationBuilder(config)
    .configureCoreServices()
    .configureCommandHandlers()
    .build();
}

/**
 * Example usage:
 * 
 * const config: BotConfig = {
 *   githubToken: process.env.GITHUB_TOKEN,
 *   claudeApiKey: process.env.CLAUDE_API_KEY,
 *   rootPath: process.cwd()
 * };
 * 
 * const container = createBotConfiguration(config);
 * const registry = container.get(SERVICE_TOKENS.COMMAND_REGISTRY);
 * 
 * // Now registry has all commands registered and ready to use
 */