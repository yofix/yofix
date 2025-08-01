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
exports.ActionRegistry = void 0;
const core = __importStar(require("@actions/core"));
class ActionRegistry {
    constructor() {
        this.actions = new Map();
        this.middleware = [];
    }
    register(definition, handler) {
        core.debug(`Registering action: ${definition.name}`);
        this.actions.set(definition.name, {
            definition,
            handler
        });
    }
    use(middleware) {
        this.middleware.push(middleware);
    }
    async execute(name, params, context) {
        const action = this.actions.get(name);
        if (!action) {
            core.error(`Unknown action: ${name}`);
            return {
                success: false,
                error: `Unknown action: ${name}. Available actions: ${this.getAvailableActions().join(', ')}`
            };
        }
        core.info(`Executing action: ${name} with params: ${JSON.stringify(params)}`);
        const startTime = Date.now();
        try {
            let index = 0;
            const next = async () => {
                if (index < this.middleware.length) {
                    const currentMiddleware = this.middleware[index++];
                    return currentMiddleware(context, next);
                }
                return action.handler(params, context);
            };
            const result = await next();
            result.duration = Date.now() - startTime;
            if (result.success) {
                core.info(`Action ${name} completed successfully in ${result.duration}ms`);
            }
            else {
                core.warning(`Action ${name} failed: ${result.error}`);
            }
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            core.error(`Action ${name} threw error: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                duration: Date.now() - startTime
            };
        }
    }
    getAvailableActions() {
        return Array.from(this.actions.keys());
    }
    getActionDefinitions() {
        return Array.from(this.actions.values()).map(action => action.definition);
    }
    getActionsForPrompt() {
        const lines = ['Available actions:'];
        for (const [name, action] of this.actions) {
            const def = action.definition;
            lines.push(`\n- ${name}: ${def.description}`);
            if (def.parameters && Object.keys(def.parameters).length > 0) {
                lines.push(`  Parameters: ${JSON.stringify(def.parameters)}`);
            }
            if (def.examples && def.examples.length > 0) {
                lines.push(`  Examples:`);
                def.examples.forEach(ex => lines.push(`    ${ex}`));
            }
        }
        return lines.join('\n');
    }
    validateParams(actionName, params) {
        const action = this.actions.get(actionName);
        if (!action) {
            return { valid: false, errors: [`Unknown action: ${actionName}`] };
        }
        const errors = [];
        const expectedParams = action.definition.parameters || {};
        for (const [key, schema] of Object.entries(expectedParams)) {
            if (schema.required && !(key in params)) {
                errors.push(`Missing required parameter: ${key}`);
            }
            if (key in params) {
                const value = params[key];
                if (schema.type === 'string' && typeof value !== 'string') {
                    errors.push(`Parameter ${key} must be a string`);
                }
                else if (schema.type === 'number' && typeof value !== 'number') {
                    errors.push(`Parameter ${key} must be a number`);
                }
                else if (schema.type === 'boolean' && typeof value !== 'boolean') {
                    errors.push(`Parameter ${key} must be a boolean`);
                }
                else if (schema.type === 'array' && !Array.isArray(value)) {
                    errors.push(`Parameter ${key} must be an array`);
                }
            }
        }
        return { valid: errors.length === 0, errors };
    }
    clear() {
        this.actions.clear();
        this.middleware = [];
    }
    getAction(name) {
        return this.actions.get(name);
    }
    getHandler(name) {
        const action = this.actions.get(name);
        return action?.handler;
    }
    hasAction(name) {
        return this.actions.has(name);
    }
    filter(predicate) {
        const subRegistry = new ActionRegistry();
        for (const [name, action] of this.actions) {
            if (predicate(action)) {
                subRegistry.register(action.definition, action.handler);
            }
        }
        subRegistry.middleware = [...this.middleware];
        return subRegistry;
    }
    merge(other) {
        for (const [name, action] of other.actions) {
            if (this.actions.has(name)) {
                core.warning(`Overriding existing action: ${name}`);
            }
            this.register(action.definition, action.handler);
        }
    }
}
exports.ActionRegistry = ActionRegistry;
