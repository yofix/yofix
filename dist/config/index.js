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
exports.config = void 0;
const default_config_1 = require("./default.config");
const path = __importStar(require("path"));
const core_1 = require("../core");
class ConfigManager {
    constructor() {
        this.configCache = new Map();
        this.config = this.loadConfig();
    }
    loadConfig() {
        let config = { ...default_config_1.defaultConfig };
        const env = process.env.NODE_ENV || 'development';
        const envConfigPath = path.join(__dirname, `${env}.config.js`);
        try {
            const envConfig = require(envConfigPath).default;
            config = this.deepMerge(config, envConfig);
        }
        catch (error) {
        }
        const userConfigPaths = [
            path.join(process.cwd(), '.yofix.config.json'),
            path.join(process.cwd(), '.yofix.config.js'),
            path.join(process.cwd(), 'yofix.config.json'),
            path.join(process.cwd(), 'yofix.config.js')
        ];
        for (const configPath of userConfigPaths) {
            try {
                if (configPath.endsWith('.json')) {
                    const fs = require('fs');
                    const content = fs.readFileSync(configPath, 'utf-8');
                    const parseResult = (0, core_1.safeJSONParse)(content);
                    if (parseResult.success) {
                        config = this.deepMerge(config, parseResult.data);
                    }
                }
                else {
                    const userConfig = require(configPath);
                    config = this.deepMerge(config, userConfig);
                }
                break;
            }
            catch (error) {
            }
        }
        config = this.applyEnvironmentOverrides(config);
        return config;
    }
    deepMerge(target, source) {
        const output = { ...target };
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    }
                    else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                }
                else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    applyEnvironmentOverrides(config) {
        if (process.env.YOFIX_AI_MODEL) {
            config.ai.claude.defaultModel = process.env.YOFIX_AI_MODEL;
        }
        if (process.env.YOFIX_AI_MAX_TOKENS) {
            config.ai.claude.maxTokens.default = parseInt(process.env.YOFIX_AI_MAX_TOKENS, 10);
        }
        if (process.env.YOFIX_BROWSER_HEADLESS !== undefined) {
            config.browser.headless = process.env.YOFIX_BROWSER_HEADLESS === 'true';
        }
        if (process.env.YOFIX_BROWSER_TIMEOUT) {
            config.browser.defaultTimeout = parseInt(process.env.YOFIX_BROWSER_TIMEOUT, 10);
        }
        if (process.env.YOFIX_STORAGE_PROVIDER) {
            config.storage.defaultProvider = process.env.YOFIX_STORAGE_PROVIDER;
        }
        if (process.env.YOFIX_AUTH_MODE) {
            config.auth.defaultMode = process.env.YOFIX_AUTH_MODE;
        }
        if (process.env.YOFIX_LOG_LEVEL) {
            config.logging.level = process.env.YOFIX_LOG_LEVEL;
        }
        return config;
    }
    getConfig() {
        return this.config;
    }
    get(path, defaultValue) {
        if (this.configCache.has(path)) {
            return this.configCache.get(path);
        }
        const keys = path.split('.');
        let value = this.config;
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            }
            else {
                value = defaultValue;
                break;
            }
        }
        this.configCache.set(path, value);
        return value;
    }
    set(path, value) {
        const keys = path.split('.');
        let target = this.config;
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in target) || typeof target[key] !== 'object') {
                target[key] = {};
            }
            target = target[key];
        }
        target[keys[keys.length - 1]] = value;
        this.configCache.delete(path);
    }
    reload() {
        this.configCache.clear();
        this.config = this.loadConfig();
    }
}
exports.config = new ConfigManager();
exports.default = exports.config;
