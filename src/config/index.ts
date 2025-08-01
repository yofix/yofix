/**
 * Configuration Manager
 * Loads and merges configuration from various sources
 */

import { YoFixConfig, defaultConfig } from './default.config';
import * as path from 'path';
import { exists, read, safeJSONParse } from '../core';

class ConfigManager {
  private config: YoFixConfig;
  private configCache: Map<string, any> = new Map();

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from various sources and merge
   */
  private loadConfig(): YoFixConfig {
    let config = { ...defaultConfig };

    // Load from environment-specific config file if exists
    const env = process.env.NODE_ENV || 'development';
    const envConfigPath = path.join(__dirname, `${env}.config.js`);
    // Use sync check for require compatibility
    try {
      const envConfig = require(envConfigPath).default;
      config = this.deepMerge(config, envConfig);
    } catch (error) {
      // Config file doesn't exist or failed to load
    }

    // Load from user config file if exists (.yofix.config.json in project root)
    const userConfigPaths = [
      path.join(process.cwd(), '.yofix.config.json'),
      path.join(process.cwd(), '.yofix.config.js'),
      path.join(process.cwd(), 'yofix.config.json'),
      path.join(process.cwd(), 'yofix.config.js')
    ];

    for (const configPath of userConfigPaths) {
      try {
        if (configPath.endsWith('.json')) {
          // Use sync read for config loading
          const fs = require('fs');
          const content = fs.readFileSync(configPath, 'utf-8');
          const parseResult = safeJSONParse(content);
          if (parseResult.success) {
            config = this.deepMerge(config, parseResult.data);
          }
        } else {
          const userConfig = require(configPath);
          config = this.deepMerge(config, userConfig);
        }
        break;
      } catch (error) {
        // Config file doesn't exist or failed to load - continue to next
      }
    }

    // Override with environment variables
    config = this.applyEnvironmentOverrides(config);

    return config;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(config: YoFixConfig): YoFixConfig {
    // AI Model overrides
    if (process.env.YOFIX_AI_MODEL) {
      config.ai.claude.defaultModel = process.env.YOFIX_AI_MODEL;
    }
    if (process.env.YOFIX_AI_MAX_TOKENS) {
      config.ai.claude.maxTokens.default = parseInt(process.env.YOFIX_AI_MAX_TOKENS, 10);
    }

    // Browser overrides
    if (process.env.YOFIX_BROWSER_HEADLESS !== undefined) {
      config.browser.headless = process.env.YOFIX_BROWSER_HEADLESS === 'true';
    }
    if (process.env.YOFIX_BROWSER_TIMEOUT) {
      config.browser.defaultTimeout = parseInt(process.env.YOFIX_BROWSER_TIMEOUT, 10);
    }

    // Storage provider override
    if (process.env.YOFIX_STORAGE_PROVIDER) {
      config.storage.defaultProvider = process.env.YOFIX_STORAGE_PROVIDER as 'firebase' | 's3';
    }

    // Auth mode override
    if (process.env.YOFIX_AUTH_MODE) {
      config.auth.defaultMode = process.env.YOFIX_AUTH_MODE as 'selectors' | 'ai';
    }

    // Logging level override
    if (process.env.YOFIX_LOG_LEVEL) {
      config.logging.level = process.env.YOFIX_LOG_LEVEL as any;
    }

    return config;
  }

  /**
   * Get the full configuration
   */
  getConfig(): YoFixConfig {
    return this.config;
  }

  /**
   * Get a specific configuration value by path
   */
  get<T = any>(path: string, defaultValue?: T): T {
    if (this.configCache.has(path)) {
      return this.configCache.get(path);
    }

    const keys = path.split('.');
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        value = defaultValue;
        break;
      }
    }

    this.configCache.set(path, value);
    return value;
  }

  /**
   * Set a configuration value (runtime only, not persisted)
   */
  set(path: string, value: any): void {
    const keys = path.split('.');
    let target: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    target[keys[keys.length - 1]] = value;
    this.configCache.delete(path); // Clear cache for this path
  }

  /**
   * Reload configuration
   */
  reload(): void {
    this.configCache.clear();
    this.config = this.loadConfig();
  }
}

// Export singleton instance
export const config = new ConfigManager();

// Export types
export { YoFixConfig } from './default.config';

// Convenience exports
export default config;