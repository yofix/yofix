/**
 * Centralized Configuration Manager
 * Provides consistent access to environment variables, GitHub inputs, and configuration
 */

import * as core from '@actions/core';
import { getConfiguration } from '../hooks/ConfigurationHook';
import { errorHandler, ErrorCategory, ErrorSeverity } from '../error/CentralizedErrorHandler';
import { createModuleLogger } from '../error/ErrorHandlerFactory';

export interface ConfigOptions {
  required?: boolean;
  defaultValue?: string;
  validate?: (value: string) => boolean;
  transform?: (value: string) => any;
  sensitive?: boolean;
}

export interface ValidationRule {
  test: (value: any) => boolean;
  message: string;
}

/**
 * Configuration source priority (highest to lowest):
 * 1. GitHub Action inputs (core.getInput)
 * 2. Environment variables (process.env)
 * 3. Default values
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private cache: Map<string, any> = new Map();
  private validators: Map<string, ValidationRule[]> = new Map();
  
  private logger = createModuleLogger({
    module: 'ConfigurationManager',
    defaultCategory: ErrorCategory.CONFIGURATION
  });

  private constructor() {
    this.setupDefaultValidators();
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Get configuration value with fallback chain
   */
  get(key: string, options: ConfigOptions = {}): string {
    const cacheKey = this.getCacheKey(key, options);
    
    // Check cache first
    if (this.cache.has(cacheKey) && !options.sensitive) {
      return this.cache.get(cacheKey);
    }

    let value: string | undefined;

    // Try GitHub Action input first
    try {
      const inputKey = this.toInputKey(key);
      value = getConfiguration().getInput(inputKey);
      if (value) {
        this.logger.debug(`Found ${key} in GitHub inputs`);
      }
    } catch (error) {
      // Not in GitHub Action context
    }

    // Try environment variable
    if (!value) {
      const envKey = this.toEnvKey(key);
      value = process.env[envKey];
      if (value) {
        this.logger.debug(`Found ${key} in environment`);
      }
    }

    // Use default value
    if (!value && options.defaultValue !== undefined) {
      value = options.defaultValue;
      this.logger.debug(`Using default value for ${key}`);
    }

    // Check required
    if (!value && options.required) {
      const error = new Error(`Required configuration '${key}' is not set`);
      errorHandler.handleError(error, {
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.CONFIGURATION,
        userAction: `Set configuration value for ${key}`,
        metadata: { key, options }
      });
      throw error;
    }

    // Validate
    if (value && options.validate && !options.validate(value)) {
      const error = new Error(`Invalid value for configuration '${key}': ${options.sensitive ? '[REDACTED]' : value}`);
      errorHandler.handleError(error, {
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.CONFIGURATION,
        metadata: { key }
      });
      throw error;
    }

    // Run registered validators
    if (value && this.validators.has(key)) {
      const rules = this.validators.get(key)!;
      for (const rule of rules) {
        if (!rule.test(value)) {
          throw new Error(`Configuration '${key}' validation failed: ${rule.message}`);
        }
      }
    }

    // Transform if needed
    if (value && options.transform) {
      try {
        value = options.transform(value);
      } catch (error) {
        this.logger.error(`Failed to transform ${key}: ${error}`);
        throw error;
      }
    }

    // Cache non-sensitive values
    if (value && !options.sensitive) {
      this.cache.set(cacheKey, value);
    }

    return value || '';
  }

  /**
   * Get boolean configuration value
   */
  getBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = this.get(key, {
      defaultValue: defaultValue.toString(),
      transform: (v) => v.toLowerCase() === 'true' || v === '1'
    });
    return typeof value === 'boolean' ? value : value === 'true';
  }

  /**
   * Get number configuration value
   */
  getNumber(key: string, defaultValue?: number): number {
    const value = this.get(key, {
      defaultValue: defaultValue?.toString(),
      validate: (v) => !isNaN(Number(v)),
      transform: (v) => Number(v)
    });
    return Number(value);
  }

  /**
   * Get JSON configuration value
   */
  getJSON<T = any>(key: string, defaultValue?: T): T {
    const value = this.get(key, {
      defaultValue: defaultValue ? JSON.stringify(defaultValue) : undefined,
      transform: (v) => {
        try {
          return JSON.parse(v);
        } catch (error) {
          throw new Error(`Invalid JSON in ${key}: ${error}`);
        }
      }
    });
    return value as T;
  }

  /**
   * Get array configuration value (comma-separated)
   */
  getArray(key: string, defaultValue: string[] = []): string[] {
    const value = this.get(key, {
      defaultValue: defaultValue.join(','),
      transform: (v) => v.split(',').map(s => s.trim()).filter(Boolean)
    });
    return Array.isArray(value) ? value : [];
  }

  /**
   * Get sensitive configuration (no caching, no logging)
   */
  getSecret(key: string): string {
    return this.get(key, {
      required: true,
      sensitive: true
    });
  }

  /**
   * Set configuration value (for testing)
   */
  set(key: string, value: any): void {
    const envKey = this.toEnvKey(key);
    process.env[envKey] = String(value);
    this.cache.delete(key); // Clear cache
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Register custom validator
   */
  addValidator(key: string, rule: ValidationRule): void {
    if (!this.validators.has(key)) {
      this.validators.set(key, []);
    }
    this.validators.get(key)!.push(rule);
  }

  /**
   * Get all configuration keys
   */
  getAllKeys(): string[] {
    const keys = new Set<string>();
    
    // Add environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('INPUT_') || key.startsWith('YOFIX_')) {
        keys.add(this.fromEnvKey(key));
      }
    });

    return Array.from(keys);
  }

  /**
   * Convert to GitHub input key format
   */
  private toInputKey(key: string): string {
    return key.toLowerCase().replace(/_/g, '-');
  }

  /**
   * Convert to environment variable key format
   */
  private toEnvKey(key: string): string {
    return `INPUT_${key.toUpperCase().replace(/-/g, '_')}`;
  }

  /**
   * Convert from environment variable key
   */
  private fromEnvKey(envKey: string): string {
    return envKey
      .replace(/^INPUT_/, '')
      .toLowerCase()
      .replace(/_/g, '-');
  }

  /**
   * Get cache key
   */
  private getCacheKey(key: string, options: ConfigOptions): string {
    return `${key}:${JSON.stringify(options)}`;
  }

  /**
   * Setup default validators
   */
  private setupDefaultValidators(): void {
    // URL validation
    this.addValidator('preview-url', {
      test: (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Must be a valid URL'
    });

    // Timeout validation
    this.addValidator('test-timeout', {
      test: (value) => {
        const match = value.match(/^(\d+)(s|m|ms)?$/);
        return !!match;
      },
      message: 'Must be a valid timeout (e.g., 30s, 5m, 1000ms)'
    });

    // Storage provider validation
    this.addValidator('storage-provider', {
      test: (value) => ['firebase', 's3', 'github'].includes(value),
      message: 'Must be one of: firebase, s3, github'
    });

    // Auth mode validation
    this.addValidator('auth-mode', {
      test: (value) => ['selectors', 'ai', 'llm', 'smart', 'none'].includes(value),
      message: 'Must be one of: selectors, ai, llm, smart, none'
    });
  }
}

// Export singleton instance
export const config = ConfigurationManager.getInstance();

// Export helper functions for common patterns
export function getRequiredConfig(key: string): string {
  return config.get(key, { required: true });
}

export function getOptionalConfig(key: string, defaultValue?: string): string {
  return config.get(key, { defaultValue });
}

export function getSecretConfig(key: string): string {
  return config.getSecret(key);
}

export function getBooleanConfig(key: string, defaultValue: boolean = false): boolean {
  return config.getBoolean(key, defaultValue);
}

export function getNumberConfig(key: string, defaultValue?: number): number {
  return config.getNumber(key, defaultValue);
}

export function getArrayConfig(key: string, defaultValue: string[] = []): string[] {
  return config.getArray(key, defaultValue);
}

export function getJSONConfig<T = any>(key: string, defaultValue?: T): T {
  return config.getJSON(key, defaultValue);
}