/**
 * Environment Variable Access Hook
 * 
 * Provides an abstraction layer for environment variable access,
 * supporting different runtime environments and testing scenarios.
 * Uses default configuration when no environment variables are set.
 */

import { environmentDefaults, getEnvWithDefaults } from '../../config/default.config';

/**
 * Environment variable access interface
 */
export interface EnvironmentHook {
  /**
   * Get environment variable value
   */
  get(name: string): string | undefined;
  
  /**
   * Get environment variable with default value
   */
  get(name: string, defaultValue: string): string;
  
  /**
   * Get required environment variable (throws if missing)
   */
  getRequired(name: string): string;
  
  /**
   * Check if environment variable exists
   */
  has(name: string): boolean;
  
  /**
   * Get all environment variables matching a prefix
   */
  getByPrefix(prefix: string): Record<string, string>;
  
  /**
   * Set environment variable (useful for testing)
   */
  set(name: string, value: string): void;
  
  /**
   * Unset environment variable (useful for testing)
   */
  unset(name: string): void;
  
  /**
   * Get current environment type
   */
  getEnvironment(): 'production' | 'development' | 'test' | 'unknown';
  
  /**
   * Get environment variable with smart defaults from config
   * This eliminates the need for environment files in development
   */
  getWithDefaults(name: string): string | undefined;
}

/**
 * Node.js environment implementation
 */
export class NodeEnvironmentHook implements EnvironmentHook {
  get(name: string): string | undefined;
  get(name: string, defaultValue: string): string;
  get(name: string, defaultValue?: string): string | undefined {
    const value = process.env[name];
    return value !== undefined ? value : defaultValue;
  }
  
  getRequired(name: string): string {
    const value = process.env[name];
    if (value === undefined) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
  }
  
  has(name: string): boolean {
    return name in process.env;
  }
  
  getByPrefix(prefix: string): Record<string, string> {
    const result: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value !== undefined) {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  set(name: string, value: string): void {
    process.env[name] = value;
  }
  
  unset(name: string): void {
    delete process.env[name];
  }
  
  getEnvironment(): 'production' | 'development' | 'test' | 'unknown' {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    
    switch (nodeEnv) {
      case 'production':
        return 'production';
      case 'development':
        return 'development';
      case 'test':
        return 'test';
      default:
        return 'unknown';
    }
  }
  
  getWithDefaults(name: string): string | undefined {
    // Use the enhanced configuration system that includes .env.local support
    return getEnvWithDefaults(name);
  }
}

/**
 * Mock environment implementation for testing
 */
export class MockEnvironmentHook implements EnvironmentHook {
  private env: Map<string, string> = new Map();
  
  constructor(initialEnv: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initialEnv)) {
      this.env.set(key, value);
    }
  }
  
  get(name: string): string | undefined;
  get(name: string, defaultValue: string): string;
  get(name: string, defaultValue?: string): string | undefined {
    const value = this.env.get(name);
    return value !== undefined ? value : defaultValue;
  }
  
  getRequired(name: string): string {
    const value = this.env.get(name);
    if (value === undefined) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
  }
  
  has(name: string): boolean {
    return this.env.has(name);
  }
  
  getByPrefix(prefix: string): Record<string, string> {
    const result: Record<string, string> = {};
    
    for (const [key, value] of this.env.entries()) {
      if (key.startsWith(prefix)) {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  set(name: string, value: string): void {
    this.env.set(name, value);
  }
  
  unset(name: string): void {
    this.env.delete(name);
  }
  
  getEnvironment(): 'production' | 'development' | 'test' | 'unknown' {
    const nodeEnv = this.env.get('NODE_ENV')?.toLowerCase();
    
    switch (nodeEnv) {
      case 'production':
        return 'production';
      case 'development':
        return 'development';
      case 'test':
        return 'test';
      default:
        return 'unknown';
    }
  }
  
  getWithDefaults(name: string): string | undefined {
    // First check mock environment
    const mockValue = this.env.get(name);
    if (mockValue !== undefined) {
      return mockValue;
    }
    
    // For mock environment, fall back to the centralized defaults
    // This ensures consistent behavior between Mock and Node environments
    return getEnvWithDefaults(name);
  }
  
  /**
   * Clear all environment variables (useful for testing)
   */
  clear(): void {
    this.env.clear();
  }
  
  /**
   * Load from object (useful for testing)
   */
  loadFromObject(env: Record<string, string>): void {
    this.clear();
    for (const [key, value] of Object.entries(env)) {
      this.env.set(key, value);
    }
  }
}

/**
 * Environment hook factory
 */
export class EnvironmentHookFactory {
  private static instance?: EnvironmentHook;
  
  /**
   * Get or create environment hook instance
   */
  static getHook(): EnvironmentHook {
    if (!this.instance) {
      this.instance = this.createDefaultHook();
    }
    return this.instance;
  }
  
  /**
   * Set custom environment hook (useful for testing)
   */
  static setHook(hook: EnvironmentHook): void {
    this.instance = hook;
  }
  
  /**
   * Reset the factory (useful for testing)
   */
  static reset(): void {
    this.instance = undefined;
  }
  
  /**
   * Create default environment hook based on runtime
   */
  private static createDefaultHook(): EnvironmentHook {
    // In test environment, use mock by default
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      return new MockEnvironmentHook(process.env as Record<string, string>);
    }
    
    // In Node.js environment
    if (typeof process !== 'undefined' && process.env) {
      return new NodeEnvironmentHook();
    }
    
    // Fallback to mock for other environments
    return new MockEnvironmentHook();
  }
}

/**
 * Convenience function to get environment hook
 */
export function getEnvironment(): EnvironmentHook {
  return EnvironmentHookFactory.getHook();
}

/**
 * Common environment variable getters using the hook
 */
export const env = {
  get: (name: string, defaultValue?: string) => getEnvironment().get(name, defaultValue as string),
  getRequired: (name: string) => getEnvironment().getRequired(name),
  getWithDefaults: (name: string) => getEnvironment().getWithDefaults(name),
  has: (name: string) => getEnvironment().has(name),
  is: (name: string, value: string) => getEnvironment().get(name) === value,
  isDevelopment: () => getEnvironment().getEnvironment() === 'development',
  isProduction: () => getEnvironment().getEnvironment() === 'production',
  isTest: () => getEnvironment().getEnvironment() === 'test',
};