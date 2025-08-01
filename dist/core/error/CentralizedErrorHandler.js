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
exports.errorHandler = exports.CentralizedErrorHandler = exports.YoFixError = exports.ErrorCategory = exports.ErrorSeverity = void 0;
const core = __importStar(require("@actions/core"));
const GitHubCommentEngine_1 = require("../github/GitHubCommentEngine");
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "low";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["CRITICAL"] = "critical";
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["AUTHENTICATION"] = "authentication";
    ErrorCategory["API"] = "api";
    ErrorCategory["NETWORK"] = "network";
    ErrorCategory["CONFIGURATION"] = "configuration";
    ErrorCategory["BROWSER"] = "browser";
    ErrorCategory["ANALYSIS"] = "analysis";
    ErrorCategory["STORAGE"] = "storage";
    ErrorCategory["MODULE"] = "module";
    ErrorCategory["AI"] = "ai";
    ErrorCategory["FILE_SYSTEM"] = "file_system";
    ErrorCategory["VALIDATION"] = "validation";
    ErrorCategory["PROCESSING"] = "processing";
    ErrorCategory["UNKNOWN"] = "unknown";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
class YoFixError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'YoFixError';
        this.severity = options.severity || ErrorSeverity.MEDIUM;
        this.category = options.category || ErrorCategory.UNKNOWN;
        this.recoverable = options.recoverable ?? false;
        this.context = options;
    }
}
exports.YoFixError = YoFixError;
class CentralizedErrorHandler {
    constructor() {
        this.commentEngine = null;
        this.errorBuffer = [];
        this.isTestMode = process.env.NODE_ENV === 'test';
        this.errorStats = {
            total: 0,
            byCategory: {},
            bySeverity: {},
            recovered: 0
        };
        this.initializeErrorStats();
        this.setupGlobalHandlers();
    }
    initializeErrorStats() {
        Object.values(ErrorCategory).forEach(category => {
            this.errorStats.byCategory[category] = 0;
        });
        Object.values(ErrorSeverity).forEach(severity => {
            this.errorStats.bySeverity[severity] = 0;
        });
    }
    static getInstance() {
        if (!CentralizedErrorHandler.instance) {
            CentralizedErrorHandler.instance = new CentralizedErrorHandler();
        }
        return CentralizedErrorHandler.instance;
    }
    initialize(githubToken) {
        try {
            this.commentEngine = new GitHubCommentEngine_1.GitHubCommentEngine(githubToken);
            core.info('Centralized error handler initialized with GitHub integration');
        }
        catch (error) {
            core.warning('Failed to initialize GitHub comment engine, errors will only be logged');
        }
    }
    async handleError(error, options = {}) {
        this.errorStats.total++;
        this.errorStats.byCategory[options.category || ErrorCategory.UNKNOWN] =
            (this.errorStats.byCategory[options.category || ErrorCategory.UNKNOWN] || 0) + 1;
        this.errorStats.bySeverity[options.severity || ErrorSeverity.MEDIUM] =
            (this.errorStats.bySeverity[options.severity || ErrorSeverity.MEDIUM] || 0) + 1;
        const errorObj = error instanceof Error ? error : new Error(String(error));
        this.errorBuffer.push({
            error: errorObj,
            context: options,
            timestamp: new Date()
        });
        this.logError(errorObj, options);
        if (!options.skipGitHubPost && !options.silent && this.commentEngine && !this.isTestMode) {
            await this.postErrorToGitHub(errorObj, options);
        }
        if (options.severity === ErrorSeverity.CRITICAL) {
            await this.handleCriticalError(errorObj, options);
        }
        if (options.recoverable) {
            this.errorStats.recovered++;
        }
    }
    async wrapAsync(fn, context) {
        try {
            return await fn();
        }
        catch (error) {
            await this.handleError(error, context);
            if (context.recoverable) {
                return null;
            }
            throw error;
        }
    }
    wrap(fn, context) {
        try {
            return fn();
        }
        catch (error) {
            this.handleErrorSync(error, context);
            if (context.recoverable) {
                return null;
            }
            throw error;
        }
    }
    createError(message, options = {}) {
        return new YoFixError(message, options);
    }
    async handleAuthError(error, details) {
        await this.handleError(error, {
            category: ErrorCategory.AUTHENTICATION,
            severity: ErrorSeverity.HIGH,
            userAction: 'Authentication attempt',
            metadata: details,
            tips: [
                '🔐 Verify your credentials are correct',
                '🔑 Check if the account is locked',
                '🌐 Ensure the login URL is correct',
                '🤖 Try a different auth mode (llm, selectors, smart)'
            ]
        });
    }
    async handleApiError(error, endpoint, details) {
        await this.handleError(error, {
            category: ErrorCategory.API,
            severity: ErrorSeverity.HIGH,
            location: endpoint,
            metadata: details,
            tips: this.getApiErrorTips(error)
        });
    }
    async handleBrowserError(error, action, details) {
        await this.handleError(error, {
            category: ErrorCategory.BROWSER,
            severity: ErrorSeverity.MEDIUM,
            userAction: action,
            metadata: details,
            recoverable: true,
            tips: [
                '🌐 Check if the page loaded correctly',
                '⏱️ Increase timeout values',
                '🔄 Retry the operation',
                '📱 Verify viewport settings'
            ]
        });
    }
    getErrorSummary() {
        const { total, byCategory, bySeverity, recovered } = this.errorStats;
        let summary = `## 📊 Error Summary\n\n`;
        summary += `**Total Errors**: ${total}\n`;
        summary += `**Recovered**: ${recovered}\n\n`;
        summary += `### By Severity\n`;
        Object.entries(bySeverity).forEach(([severity, count]) => {
            const emoji = this.getSeverityEmoji(severity);
            summary += `- ${emoji} ${severity}: ${count}\n`;
        });
        summary += `\n### By Category\n`;
        Object.entries(byCategory).forEach(([category, count]) => {
            summary += `- ${category}: ${count}\n`;
        });
        return summary;
    }
    async postErrorSummary() {
        if (this.errorStats.total === 0 || !this.commentEngine)
            return;
        await this.commentEngine.postComment(this.getErrorSummary(), {
            signature: 'yofix-error-summary',
            updateExisting: true
        });
    }
    reset() {
        this.errorBuffer = [];
        this.errorStats = {
            total: 0,
            byCategory: {},
            bySeverity: {},
            recovered: 0
        };
        this.initializeErrorStats();
    }
    setupGlobalHandlers() {
        process.on('unhandledRejection', (reason, promise) => {
            this.handleErrorSync(new Error(`Unhandled Promise Rejection: ${reason}`), {
                severity: ErrorSeverity.HIGH,
                category: ErrorCategory.UNKNOWN,
                location: 'Global Promise Handler'
            });
        });
        process.on('uncaughtException', (error) => {
            this.handleErrorSync(error, {
                severity: ErrorSeverity.CRITICAL,
                category: ErrorCategory.UNKNOWN,
                location: 'Global Exception Handler'
            });
        });
    }
    handleErrorSync(error, options) {
        this.errorStats.total++;
        this.errorStats.byCategory[options.category || ErrorCategory.UNKNOWN] =
            (this.errorStats.byCategory[options.category || ErrorCategory.UNKNOWN] || 0) + 1;
        this.errorStats.bySeverity[options.severity || ErrorSeverity.MEDIUM] =
            (this.errorStats.bySeverity[options.severity || ErrorSeverity.MEDIUM] || 0) + 1;
        this.logError(error, options);
        if (!options.skipGitHubPost && !options.silent && this.commentEngine) {
            setImmediate(() => {
                this.postErrorToGitHub(error, options).catch(console.error);
            });
        }
    }
    logError(error, options) {
        const message = `[${options.category || 'UNKNOWN'}] ${error.message}`;
        switch (options.severity) {
            case ErrorSeverity.CRITICAL:
                core.error(`🚨 CRITICAL: ${message}`);
                break;
            case ErrorSeverity.HIGH:
                core.error(`❌ ERROR: ${message}`);
                break;
            case ErrorSeverity.MEDIUM:
                core.warning(`⚠️ WARNING: ${message}`);
                break;
            case ErrorSeverity.LOW:
                core.info(`ℹ️ INFO: ${message}`);
                break;
            default:
                core.error(message);
        }
    }
    async postErrorToGitHub(error, options) {
        if (!this.commentEngine)
            return;
        try {
            await this.commentEngine.postError(error, {
                location: options.location,
                userAction: options.userAction,
                metadata: options.metadata,
                includeStackTrace: options.severity === ErrorSeverity.CRITICAL,
                tips: options.tips
            });
        }
        catch (postError) {
            core.warning(`Failed to post error to GitHub: ${postError}`);
        }
    }
    async handleCriticalError(error, options) {
        core.setFailed(`Critical error: ${error.message}`);
        if (this.commentEngine) {
            await this.commentEngine.postComment(`🚨 **CRITICAL ERROR** 🚨\n\nThe workflow has failed due to a critical error. Please check the logs for details.`, { reactions: ['confused', 'eyes'] });
        }
    }
    getSeverityEmoji(severity) {
        switch (severity) {
            case ErrorSeverity.CRITICAL: return '🚨';
            case ErrorSeverity.HIGH: return '❌';
            case ErrorSeverity.MEDIUM: return '⚠️';
            case ErrorSeverity.LOW: return 'ℹ️';
            default: return '❓';
        }
    }
    getApiErrorTips(error) {
        const errorStr = error.toString();
        const tips = [];
        if (errorStr.includes('401') || errorStr.includes('authentication')) {
            tips.push('🔑 Check your API key is valid');
            tips.push('📋 Ensure the API key has proper permissions');
        }
        if (errorStr.includes('429') || errorStr.includes('rate limit')) {
            tips.push('⏱️ Wait a few minutes for rate limit to reset');
            tips.push('📊 Consider implementing request throttling');
        }
        if (errorStr.includes('500') || errorStr.includes('internal server')) {
            tips.push('🔄 Retry the request after a short delay');
            tips.push('📧 Contact API support if the issue persists');
        }
        if (errorStr.includes('timeout')) {
            tips.push('⏱️ Increase the timeout value');
            tips.push('🌐 Check your network connection');
        }
        return tips;
    }
}
exports.CentralizedErrorHandler = CentralizedErrorHandler;
exports.errorHandler = CentralizedErrorHandler.getInstance();
