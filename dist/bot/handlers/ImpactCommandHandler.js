"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpactCommandHandler = exports.DefaultRouteAnalyzerFactory = void 0;
const RouteImpactAnalyzer_1 = require("../../core/analysis/RouteImpactAnalyzer");
class DefaultRouteAnalyzerFactory {
    constructor(githubToken, rootPath = process.cwd()) {
        this.githubToken = githubToken;
        this.rootPath = rootPath;
    }
    create(storageProvider) {
        return new RouteImpactAnalyzer_1.RouteImpactAnalyzer(this.githubToken, storageProvider);
    }
}
exports.DefaultRouteAnalyzerFactory = DefaultRouteAnalyzerFactory;
class ImpactCommandHandler {
    constructor(analyzerFactory, storageProvider, progressReporter) {
        this.analyzerFactory = analyzerFactory;
        this.storageProvider = storageProvider;
        this.progressReporter = progressReporter;
    }
    canHandle(command) {
        return command.action === 'impact';
    }
    async execute(command, context) {
        try {
            await this.progressReporter?.report('🔄 **Analyzing route impact**\n\n📊 Fetching changed files...');
            const analyzer = this.analyzerFactory.create(this.storageProvider);
            await this.progressReporter?.report('🔄 **Analyzing route impact**\n\n🌳 Building import graph with Tree-sitter...');
            const impactTree = await analyzer.analyzePRImpact(context.prNumber);
            await this.progressReporter?.report('🔄 **Analyzing route impact**\n\n🎯 Mapping affected routes...');
            const message = analyzer.formatImpactTree(impactTree);
            return {
                success: true,
                message
            };
        }
        catch (error) {
            return {
                success: false,
                message: `❌ Impact analysis failed: ${error.message}`
            };
        }
    }
    getHelpText() {
        return '`@yofix impact` - Show route impact tree from PR changes';
    }
}
exports.ImpactCommandHandler = ImpactCommandHandler;
