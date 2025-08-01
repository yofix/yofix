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
exports.ConfigPattern = exports.BotOperations = exports.GitHubOperations = void 0;
exports.executeOperation = executeOperation;
exports.retryOperation = retryOperation;
exports.executeParallel = executeParallel;
const __1 = require("..");
const GitHubCommentEngine_1 = require("../github/GitHubCommentEngine");
const BotActivityHandler_1 = require("../bot/BotActivityHandler");
const core = __importStar(require("@actions/core"));
async function executeOperation(operation, context) {
    const startTime = Date.now();
    try {
        const data = await operation();
        return {
            success: true,
            data,
            metadata: {
                duration: Date.now() - startTime,
                ...context.metadata
            }
        };
    }
    catch (error) {
        await __1.errorHandler.handleError(error, {
            severity: context.severity || __1.ErrorSeverity.MEDIUM,
            category: context.category || __1.ErrorCategory.UNKNOWN,
            userAction: context.name,
            metadata: {
                ...context.metadata,
                duration: Date.now() - startTime
            },
            recoverable: true
        });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: context.fallback,
            metadata: {
                duration: Date.now() - startTime,
                ...context.metadata
            }
        };
    }
}
class GitHubOperations {
    static async postProgress(message, threadId) {
        await this.commentEngine.postComment(message, {
            threadId,
            updateExisting: true,
            signature: 'yofix-progress'
        });
    }
    static async postResult(result, operation) {
        const emoji = result.success ? '✅' : '❌';
        const status = result.success ? 'Success' : 'Failed';
        let message = `${emoji} **${operation}**: ${status}`;
        if (result.error) {
            message += `\n\n**Error**: ${result.error}`;
        }
        if (result.data && typeof result.data === 'object') {
            message += '\n\n**Details**:\n```json\n' + JSON.stringify(result.data, null, 2) + '\n```';
        }
        await this.commentEngine.postComment(message, {
            updateExisting: true,
            signature: `yofix-${operation.toLowerCase().replace(/\s+/g, '-')}`
        });
    }
}
exports.GitHubOperations = GitHubOperations;
GitHubOperations.commentEngine = (0, GitHubCommentEngine_1.getGitHubCommentEngine)();
class BotOperations {
    static async trackOperation(operation, context) {
        await this.botActivityHandler.startActivity(context.id, context.command);
        try {
            for (const step of context.steps) {
                await this.botActivityHandler.addStep(step.name, 'running');
                try {
                    await step.operation();
                    await this.botActivityHandler.updateStep(step.name, 'completed');
                }
                catch (error) {
                    await this.botActivityHandler.updateStep(step.name, 'failed');
                    throw error;
                }
            }
            const result = await operation();
            await this.botActivityHandler.completeActivity(result);
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            await this.botActivityHandler.failActivity(error instanceof Error ? error.message : 'Operation failed');
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}
exports.BotOperations = BotOperations;
BotOperations.botActivityHandler = BotActivityHandler_1.botActivity;
class ConfigPattern {
    static get(path, defaultValue) {
        try {
            const envKey = `YOFIX_${path.toUpperCase().replace(/\./g, '_')}`;
            const envValue = process.env[envKey];
            if (envValue !== undefined) {
                try {
                    return JSON.parse(envValue);
                }
                catch {
                    return envValue;
                }
            }
            const inputKey = path.toLowerCase().replace(/\./g, '-');
            const inputValue = core.getInput(inputKey);
            if (inputValue) {
                try {
                    return JSON.parse(inputValue);
                }
                catch {
                    return inputValue;
                }
            }
            return defaultValue;
        }
        catch (error) {
            core.debug(`Failed to get config ${path}: ${error}`);
            return defaultValue;
        }
    }
}
exports.ConfigPattern = ConfigPattern;
async function retryOperation(operation, options = {}) {
    const { maxAttempts = 3, delayMs = 1000, backoff = true, onRetry } = options;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            if (attempt < maxAttempts) {
                if (onRetry) {
                    onRetry(attempt, lastError);
                }
                const delay = backoff ? delayMs * attempt : delayMs;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}
async function executeParallel(operations) {
    const results = await Promise.allSettled(operations.map(async ({ name, operation }) => {
        try {
            const result = await operation();
            return { name, result };
        }
        catch (error) {
            return { name, error: error };
        }
    }));
    const processedResults = results.map((result, index) => {
        if (result.status === 'fulfilled') {
            return result.value;
        }
        else {
            return {
                name: operations[index].name,
                error: result.reason
            };
        }
    });
    for (const result of processedResults) {
        if (result.error) {
            await __1.errorHandler.handleError(result.error, {
                severity: __1.ErrorSeverity.MEDIUM,
                category: __1.ErrorCategory.UNKNOWN,
                userAction: `Parallel operation: ${result.name}`,
                recoverable: true,
                skipGitHubPost: true
            });
        }
    }
    return {
        results: processedResults,
        hasErrors: processedResults.some(r => r.error !== undefined)
    };
}
