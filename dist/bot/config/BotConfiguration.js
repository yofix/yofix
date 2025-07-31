"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotConfigurationBuilder = void 0;
exports.createBotConfiguration = createBotConfiguration;
const github = __importStar(require("@actions/github"));
const ServiceContainer_1 = require("../core/ServiceContainer");
const CommandRegistry_1 = require("../core/CommandRegistry");
const StorageFactory_1 = require("../../providers/storage/StorageFactory");
const ImpactCommandHandler_1 = require("../handlers/ImpactCommandHandler");
const ProgressReporter_1 = require("../core/ProgressReporter");
const core = __importStar(require("@actions/core"));
class BotConfigurationBuilder {
    constructor(config) {
        this.container = new ServiceContainer_1.DefaultServiceContainer();
        this.config = config;
    }
    configureCoreServices() {
        this.container.registerSingleton(ServiceContainer_1.SERVICE_TOKENS.GITHUB_CLIENT, () => github.getOctokit(this.config.githubToken));
        this.container.registerSingleton(ServiceContainer_1.SERVICE_TOKENS.STORAGE_PROVIDER, async () => {
            try {
                if (this.config.storageProvider && this.config.storageProvider !== 'github') {
                    return await StorageFactory_1.StorageFactory.createFromInputs();
                }
            }
            catch (error) {
                core.debug(`Storage provider initialization failed: ${error}`);
            }
            return null;
        });
        this.container.registerSingleton(ServiceContainer_1.SERVICE_TOKENS.ROUTE_ANALYZER_FACTORY, () => new ImpactCommandHandler_1.DefaultRouteAnalyzerFactory(this.config.githubToken, this.config.rootPath));
        return this;
    }
    configureCommandHandlers() {
        const registry = new CommandRegistry_1.CommandRegistryBuilder();
        const analyzerFactory = this.container.get(ServiceContainer_1.SERVICE_TOKENS.ROUTE_ANALYZER_FACTORY);
        const storageProvider = this.container.get(ServiceContainer_1.SERVICE_TOKENS.STORAGE_PROVIDER);
        registry.add(new ImpactCommandHandler_1.ImpactCommandHandler(analyzerFactory, storageProvider, this.container.has(ServiceContainer_1.SERVICE_TOKENS.PROGRESS_REPORTER)
            ? this.container.get(ServiceContainer_1.SERVICE_TOKENS.PROGRESS_REPORTER)
            : new ProgressReporter_1.NullProgressReporter()));
        this.container.registerSingleton(ServiceContainer_1.SERVICE_TOKENS.COMMAND_REGISTRY, () => registry.build());
        return this;
    }
    withProgressReporter(reporter) {
        this.container.register(ServiceContainer_1.SERVICE_TOKENS.PROGRESS_REPORTER, () => reporter);
        return this;
    }
    build() {
        this.configureCoreServices();
        this.configureCommandHandlers();
        return this.container;
    }
}
exports.BotConfigurationBuilder = BotConfigurationBuilder;
function createBotConfiguration(config) {
    return new BotConfigurationBuilder(config)
        .configureCoreServices()
        .configureCommandHandlers()
        .build();
}
