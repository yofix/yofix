/**
 * Configuration Hook - Abstracts configuration access
 * 
 * This interface provides a unified way to access configuration values
 * from different sources (GitHub Actions inputs, environment variables, etc.)
 * without tight coupling to @actions/core
 */

/**
 * Configuration access interface
 */
export interface ConfigurationHook {
  /**
   * Get a configuration value by key
   */
  getInput(name: string): string;
  
  /**
   * Get a boolean configuration value
   */
  getBooleanInput(name: string): boolean;
  
  /**
   * Get a multi-line configuration value
   */
  getMultilineInput(name: string): string[];
  
  /**
   * Get a required configuration value (throws if missing)
   */
  getRequiredInput(name: string): string;
  
  /**
   * Check if running in GitHub Actions environment
   */
  isInGitHubActions(): boolean;
}

/**
 * GitHub Actions implementation
 */
export class GitHubActionsConfigurationHook implements ConfigurationHook {
  constructor(private core: typeof import('@actions/core')) {}
  
  getInput(name: string): string {
    return this.core.getInput(name);
  }
  
  getBooleanInput(name: string): boolean {
    return this.core.getBooleanInput(name);
  }
  
  getMultilineInput(name: string): string[] {
    return this.core.getMultilineInput(name);
  }
  
  getRequiredInput(name: string): string {
    const value = this.core.getInput(name);
    if (!value) {
      throw new Error(`Required input '${name}' not provided`);
    }
    return value;
  }
  
  isInGitHubActions(): boolean {
    return !!process.env.GITHUB_ACTIONS;
  }
}

/**
 * Environment variables implementation (for testing and CLI usage)
 */
export class EnvironmentConfigurationHook implements ConfigurationHook {
  getInput(name: string): string {
    // Try INPUT_* format first (GitHub Actions convention)
    const inputKey = `INPUT_${name.toUpperCase().replace(/-/g, '_')}`;
    return process.env[inputKey] || process.env[name] || '';
  }
  
  getBooleanInput(name: string): boolean {
    const value = this.getInput(name).toLowerCase();
    return value === 'true' || value === '1';
  }
  
  getMultilineInput(name: string): string[] {
    const value = this.getInput(name);
    return value ? value.split('\n').map(line => line.trim()) : [];
  }
  
  getRequiredInput(name: string): string {
    const value = this.getInput(name);
    if (!value) {
      throw new Error(`Required input '${name}' not provided`);
    }
    return value;
  }
  
  isInGitHubActions(): boolean {
    return !!process.env.GITHUB_ACTIONS;
  }
}

/**
 * Mock implementation for testing
 */
export class MockConfigurationHook implements ConfigurationHook {
  constructor(private mockValues: Record<string, string> = {}) {}
  
  setMockValue(name: string, value: string): void {
    this.mockValues[name] = value;
  }
  
  getInput(name: string): string {
    return this.mockValues[name] || '';
  }
  
  getBooleanInput(name: string): boolean {
    const value = this.getInput(name).toLowerCase();
    return value === 'true' || value === '1';
  }
  
  getMultilineInput(name: string): string[] {
    const value = this.getInput(name);
    return value ? value.split('\n').map(line => line.trim()) : [];
  }
  
  getRequiredInput(name: string): string {
    const value = this.getInput(name);
    if (!value) {
      throw new Error(`Required input '${name}' not provided`);
    }
    return value;
  }
  
  isInGitHubActions(): boolean {
    return false; // Always false for testing
  }
}

/**
 * Configuration factory
 */
export class ConfigurationFactory {
  private static instance: ConfigurationHook | null = null;
  
  /**
   * Get configuration hook instance
   */
  static getConfiguration(): ConfigurationHook {
    if (!this.instance) {
      // Auto-detect environment and create appropriate implementation
      if (process.env.NODE_ENV === 'test') {
        this.instance = new MockConfigurationHook();
      } else if (process.env.GITHUB_ACTIONS) {
        // Lazy import to avoid issues when @actions/core isn't available
        const core = require('@actions/core');
        this.instance = new GitHubActionsConfigurationHook(core);
      } else {
        this.instance = new EnvironmentConfigurationHook();
      }
    }
    return this.instance;
  }
  
  /**
   * Set configuration instance (for testing)
   */
  static setConfiguration(config: ConfigurationHook): void {
    this.instance = config;
  }
  
  /**
   * Reset configuration instance
   */
  static reset(): void {
    this.instance = null;
  }
}

/**
 * Convenience function to get configuration
 */
export function getConfiguration(): ConfigurationHook {
  return ConfigurationFactory.getConfiguration();
}