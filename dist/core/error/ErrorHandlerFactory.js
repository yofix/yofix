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
exports.createModuleLogger = createModuleLogger;
exports.wrapAsync = wrapAsync;
exports.createTryCatch = createTryCatch;
const __1 = require("..");
const core = __importStar(require("@actions/core"));
function createModuleLogger(options) {
    const { module, debug = false, skipGitHubPost = true, defaultSeverity = __1.ErrorSeverity.MEDIUM, defaultCategory = __1.ErrorCategory.MODULE } = options;
    return {
        debug: (message, ...args) => {
            if (debug || core.isDebug()) {
                core.debug(`[${module}] ${message}`);
                if (args.length > 0) {
                    core.debug(`[${module}] ${JSON.stringify(args)}`);
                }
            }
        },
        info: (message, ...args) => {
            core.info(`[${module}] ${message}`);
            if (args.length > 0 && (debug || core.isDebug())) {
                core.debug(`[${module}] ${JSON.stringify(args)}`);
            }
        },
        warn: (message, ...args) => {
            core.warning(`[${module}] ${message}`);
            if (args.length > 0 && (debug || core.isDebug())) {
                core.debug(`[${module}] ${JSON.stringify(args)}`);
            }
        },
        error: async (error, context) => {
            const errorObj = error instanceof Error ? error : new Error(error);
            await __1.errorHandler.handleError(errorObj, {
                severity: context?.severity || defaultSeverity,
                category: context?.category || defaultCategory,
                userAction: context?.userAction || `${module} operation`,
                metadata: {
                    module,
                    ...context?.metadata
                },
                recoverable: context?.recoverable !== false,
                skipGitHubPost: context?.skipGitHubPost !== undefined ? context.skipGitHubPost : skipGitHubPost
            });
        }
    };
}
function wrapAsync(fn, options) {
    return (async (...args) => {
        try {
            return await fn(...args);
        }
        catch (error) {
            const metadata = options.extractMetadata ? options.extractMetadata(...args) : {};
            await __1.errorHandler.handleError(error, {
                severity: options.severity || __1.ErrorSeverity.MEDIUM,
                category: options.category || __1.ErrorCategory.MODULE,
                userAction: `${options.module}: ${options.operation}`,
                metadata: {
                    module: options.module,
                    operation: options.operation,
                    ...metadata
                },
                recoverable: true,
                skipGitHubPost: true
            });
            throw error;
        }
    });
}
function createTryCatch(logger) {
    return async function tryCatch(operation, context) {
        try {
            return await operation();
        }
        catch (error) {
            await logger.error(error, context);
            if (context.rethrow) {
                throw error;
            }
            return context.fallback;
        }
    };
}
