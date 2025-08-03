import { BotCommand, BotContext, BotResponse } from '../types';
import { RouteImpactAnalyzer } from '../../core/analysis/RouteImpactAnalyzer';
import { StorageProvider } from '../../core/baseline/types';

/**
 * Command handler interface following SOLID principles
 */
export interface BotCommandHandler {
  canHandle(command: BotCommand): boolean;
  execute(command: BotCommand, context: BotContext): Promise<BotResponse>;
  getHelpText(): string;
}

/**
 * Progress reporter abstraction
 */
export interface ProgressReporter {
  report(message: string): Promise<void>;
}

/**
 * Route analyzer abstraction
 */
export interface RouteAnalyzer {
  analyzePRImpact(prNumber: number): Promise<any>;
  formatImpactTree(tree: any): string;
}

/**
 * Factory for creating route analyzers
 */
export interface RouteAnalyzerFactory {
  create(storageProvider?: StorageProvider, previewUrl?: string): RouteAnalyzer;
}

/**
 * Default factory implementation
 */
export class DefaultRouteAnalyzerFactory implements RouteAnalyzerFactory {
  constructor(
    private readonly githubToken: string,
    private readonly rootPath: string = process.cwd()
  ) {}

  create(storageProvider?: StorageProvider, previewUrl?: string): RouteAnalyzer {
    return new RouteImpactAnalyzer(this.githubToken, storageProvider, previewUrl);
  }
}

/**
 * Impact command handler - follows Single Responsibility Principle
 */
export class ImpactCommandHandler implements BotCommandHandler {
  constructor(
    private readonly analyzerFactory: RouteAnalyzerFactory,
    private readonly storageProvider?: StorageProvider,
    private readonly progressReporter?: ProgressReporter
  ) {}

  canHandle(command: BotCommand): boolean {
    return command.action === 'impact';
  }

  async execute(command: BotCommand, context: BotContext): Promise<BotResponse> {
    try {
      // Report progress if reporter is available
      await this.progressReporter?.report(
        '🔄 **Analyzing route impact**\n\n📊 Fetching changed files...'
      );

      // Create analyzer using factory (Dependency Inversion)
      const analyzer = this.analyzerFactory.create(this.storageProvider, context.previewUrl);

      // Report building graph
      await this.progressReporter?.report(
        '🔄 **Analyzing route impact**\n\n🌳 Building import graph with Tree-sitter...'
      );

      // Analyze impact
      const impactTree = await analyzer.analyzePRImpact(context.prNumber);

      // Report mapping routes
      await this.progressReporter?.report(
        '🔄 **Analyzing route impact**\n\n🎯 Mapping affected routes...'
      );

      // Format result
      const message = analyzer.formatImpactTree(impactTree);

      return {
        success: true,
        message
      };
    } catch (error: any) {
      return {
        success: false,
        message: `❌ Impact analysis failed: ${error.message}`
      };
    }
  }

  getHelpText(): string {
    return '`@yofix impact` - Show route impact tree from PR changes';
  }
}

/**
 * Example usage with dependency injection:
 * 
 * const factory = new DefaultRouteAnalyzerFactory(githubToken);
 * const handler = new ImpactCommandHandler(
 *   factory,
 *   storageProvider,
 *   progressReporter
 * );
 * 
 * // In command registry
 * registry.register(handler);
 */