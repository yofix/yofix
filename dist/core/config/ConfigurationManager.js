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
exports.config = exports.ConfigurationManager = void 0;
exports.getRequiredConfig = getRequiredConfig;
exports.getOptionalConfig = getOptionalConfig;
exports.getSecretConfig = getSecretConfig;
exports.getBooleanConfig = getBooleanConfig;
exports.getNumberConfig = getNumberConfig;
exports.getArrayConfig = getArrayConfig;
exports.getJSONConfig = getJSONConfig;
const core = __importStar(require("@actions/core"));
const CentralizedErrorHandler_1 = require("../error/CentralizedErrorHandler");
const ErrorHandlerFactory_1 = require("../error/ErrorHandlerFactory");
class ConfigurationManager {
    constructor() {
        this.cache = new Map();
        this.validators = new Map();
        this.logger = (0, ErrorHandlerFactory_1.createModuleLogger)({
            module: 'ConfigurationManager',
            defaultCategory: CentralizedErrorHandler_1.ErrorCategory.CONFIGURATION
        });
        this.setupDefaultValidators();
    }
    static getInstance() {
        if (!ConfigurationManager.instance) {
            ConfigurationManager.instance = new ConfigurationManager();
        }
        return ConfigurationManager.instance;
    }
    get(key, options = {}) {
        const cacheKey = this.getCacheKey(key, options);
        if (this.cache.has(cacheKey) && !options.sensitive) {
            return this.cache.get(cacheKey);
        }
        let value;
        try {
            const inputKey = this.toInputKey(key);
            value = core.getInput(inputKey);
            if (value) {
                this.logger.debug(`Found ${key} in GitHub inputs`);
            }
        }
        catch (error) {
        }
        if (!value) {
            const envKey = this.toEnvKey(key);
            value = process.env[envKey];
            if (value) {
                this.logger.debug(`Found ${key} in environment`);
            }
        }
        if (!value && options.defaultValue !== undefined) {
            value = options.defaultValue;
            this.logger.debug(`Using default value for ${key}`);
        }
        if (!value && options.required) {
            const error = new Error(`Required configuration '${key}' is not set`);
            CentralizedErrorHandler_1.errorHandler.handleError(error, {
                severity: CentralizedErrorHandler_1.ErrorSeverity.HIGH,
                category: CentralizedErrorHandler_1.ErrorCategory.CONFIGURATION,
                userAction: `Set configuration value for ${key}`,
                metadata: { key, options }
            });
            throw error;
        }
        if (value && options.validate && !options.validate(value)) {
            const error = new Error(`Invalid value for configuration '${key}': ${options.sensitive ? '[REDACTED]' : value}`);
            CentralizedErrorHandler_1.errorHandler.handleError(error, {
                severity: CentralizedErrorHandler_1.ErrorSeverity.HIGH,
                category: CentralizedErrorHandler_1.ErrorCategory.CONFIGURATION,
                metadata: { key }
            });
            throw error;
        }
        if (value && this.validators.has(key)) {
            const rules = this.validators.get(key);
            for (const rule of rules) {
                if (!rule.test(value)) {
                    throw new Error(`Configuration '${key}' validation failed: ${rule.message}`);
                }
            }
        }
        if (value && options.transform) {
            try {
                value = options.transform(value);
            }
            catch (error) {
                this.logger.error(`Failed to transform ${key}: ${error}`);
                throw error;
            }
        }
        if (value && !options.sensitive) {
            this.cache.set(cacheKey, value);
        }
        return value || '';
    }
    getBoolean(key, defaultValue = false) {
        const value = this.get(key, {
            defaultValue: defaultValue.toString(),
            transform: (v) => v.toLowerCase() === 'true' || v === '1'
        });
        return typeof value === 'boolean' ? value : value === 'true';
    }
    getNumber(key, defaultValue) {
        const value = this.get(key, {
            defaultValue: defaultValue?.toString(),
            validate: (v) => !isNaN(Number(v)),
            transform: (v) => Number(v)
        });
        return Number(value);
    }
    getJSON(key, defaultValue) {
        const value = this.get(key, {
            defaultValue: defaultValue ? JSON.stringify(defaultValue) : undefined,
            transform: (v) => {
                try {
                    return JSON.parse(v);
                }
                catch (error) {
                    throw new Error(`Invalid JSON in ${key}: ${error}`);
                }
            }
        });
        return value;
    }
    getArray(key, defaultValue = []) {
        const value = this.get(key, {
            defaultValue: defaultValue.join(','),
            transform: (v) => v.split(',').map(s => s.trim()).filter(Boolean)
        });
        return Array.isArray(value) ? value : [];
    }
    getSecret(key) {
        return this.get(key, {
            required: true,
            sensitive: true
        });
    }
    set(key, value) {
        const envKey = this.toEnvKey(key);
        process.env[envKey] = String(value);
        this.cache.delete(key);
    }
    clearCache() {
        this.cache.clear();
    }
    addValidator(key, rule) {
        if (!this.validators.has(key)) {
            this.validators.set(key, []);
        }
        this.validators.get(key).push(rule);
    }
    getAllKeys() {
        const keys = new Set();
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('INPUT_') || key.startsWith('YOFIX_')) {
                keys.add(this.fromEnvKey(key));
            }
        });
        return Array.from(keys);
    }
    toInputKey(key) {
        return key.toLowerCase().replace(/_/g, '-');
    }
    toEnvKey(key) {
        return `INPUT_${key.toUpperCase().replace(/-/g, '_')}`;
    }
    fromEnvKey(envKey) {
        return envKey
            .replace(/^INPUT_/, '')
            .toLowerCase()
            .replace(/_/g, '-');
    }
    getCacheKey(key, options) {
        return `${key}:${JSON.stringify(options)}`;
    }
    setupDefaultValidators() {
        this.addValidator('preview-url', {
            test: (value) => {
                try {
                    new URL(value);
                    return true;
                }
                catch {
                    return false;
                }
            },
            message: 'Must be a valid URL'
        });
        this.addValidator('test-timeout', {
            test: (value) => {
                const match = value.match(/^(\d+)(s|m|ms)?$/);
                return !!match;
            },
            message: 'Must be a valid timeout (e.g., 30s, 5m, 1000ms)'
        });
        this.addValidator('storage-provider', {
            test: (value) => ['firebase', 's3', 'github'].includes(value),
            message: 'Must be one of: firebase, s3, github'
        });
        this.addValidator('auth-mode', {
            test: (value) => ['selectors', 'ai', 'llm', 'smart', 'none'].includes(value),
            message: 'Must be one of: selectors, ai, llm, smart, none'
        });
    }
}
exports.ConfigurationManager = ConfigurationManager;
exports.config = ConfigurationManager.getInstance();
function getRequiredConfig(key) {
    return exports.config.get(key, { required: true });
}
function getOptionalConfig(key, defaultValue) {
    return exports.config.get(key, { defaultValue });
}
function getSecretConfig(key) {
    return exports.config.getSecret(key);
}
function getBooleanConfig(key, defaultValue = false) {
    return exports.config.getBoolean(key, defaultValue);
}
function getNumberConfig(key, defaultValue) {
    return exports.config.getNumber(key, defaultValue);
}
function getArrayConfig(key, defaultValue = []) {
    return exports.config.getArray(key, defaultValue);
}
function getJSONConfig(key, defaultValue) {
    return exports.config.getJSON(key, defaultValue);
}
