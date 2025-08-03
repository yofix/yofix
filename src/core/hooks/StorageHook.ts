/**
 * Storage Hook - Abstracts storage provider creation
 * 
 * This interface provides a unified way to create storage providers
 * without tight coupling to specific storage implementations or @actions/core
 */

import { StorageProvider } from '../baseline/types';

/**
 * Storage configuration interface
 */
export interface StorageConfiguration {
  provider: 'firebase' | 's3' | 'github';
  firebase?: {
    credentials: string;
    bucket: string;
  };
  s3?: {
    bucket: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
}

/**
 * Storage hook interface
 */
export interface StorageHook {
  /**
   * Create a storage provider from configuration
   */
  createProvider(config: StorageConfiguration): Promise<StorageProvider>;
  
  /**
   * Create a storage provider from environment/inputs
   */
  createFromEnvironment(): Promise<StorageProvider>;
  
  /**
   * Get available storage providers
   */
  getAvailableProviders(): string[];
  
  /**
   * Check if a storage provider is available
   */
  isProviderAvailable(provider: string): boolean;
}

/**
 * GitHub Actions implementation
 */
export class GitHubActionsStorageHook implements StorageHook {
  constructor(
    private configHook: import('./ConfigurationHook').ConfigurationHook
  ) {}
  
  async createProvider(config: StorageConfiguration): Promise<StorageProvider> {
    const { StorageFactory } = await import('../../providers/storage/StorageFactory');
    return StorageFactory.create(config);
  }
  
  async createFromEnvironment(): Promise<StorageProvider> {
    const { StorageFactory } = await import('../../providers/storage/StorageFactory');
    
    // Get storage provider preference
    const storageProvider = this.configHook.getInput('storage-provider') || 'firebase';
    
    const config: StorageConfiguration = {
      provider: storageProvider as any
    };

    // Firebase configuration from inputs
    const firebaseCredentials = this.configHook.getInput('firebase-credentials');
    const storageBucket = this.configHook.getInput('storage-bucket');
    
    if (firebaseCredentials && storageBucket) {
      config.firebase = {
        credentials: firebaseCredentials,
        bucket: storageBucket
      };
    }

    // S3 configuration from inputs
    const s3Bucket = this.configHook.getInput('s3-bucket');
    
    if (s3Bucket) {
      config.s3 = {
        bucket: s3Bucket,
        region: this.configHook.getInput('aws-region') || undefined,
        accessKeyId: this.configHook.getInput('aws-access-key-id') || undefined,
        secretAccessKey: this.configHook.getInput('aws-secret-access-key') || undefined
      };
    }

    return this.createProvider(config);
  }
  
  getAvailableProviders(): string[] {
    return ['firebase', 's3'];
  }
  
  isProviderAvailable(provider: string): boolean {
    return this.getAvailableProviders().includes(provider);
  }
}

/**
 * Environment-based implementation (for CLI/testing)
 */
export class EnvironmentStorageHook implements StorageHook {
  async createProvider(config: StorageConfiguration): Promise<StorageProvider> {
    const { StorageFactory } = await import('../../providers/storage/StorageFactory');
    return StorageFactory.create(config);
  }
  
  async createFromEnvironment(): Promise<StorageProvider> {
    const { StorageFactory } = await import('../../providers/storage/StorageFactory');
    
    // Try to auto-detect from environment
    const config: StorageConfiguration = {
      provider: 'firebase' // default
    };

    // Check for Firebase configuration
    if (process.env.FIREBASE_CREDENTIALS && process.env.FIREBASE_STORAGE_BUCKET) {
      config.provider = 'firebase';
      config.firebase = {
        credentials: process.env.FIREBASE_CREDENTIALS,
        bucket: process.env.FIREBASE_STORAGE_BUCKET
      };
    }
    // Check for S3 configuration
    else if (process.env.S3_BUCKET) {
      config.provider = 's3';
      config.s3 = {
        bucket: process.env.S3_BUCKET,
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      };
    }

    return this.createProvider(config);
  }
  
  getAvailableProviders(): string[] {
    return ['firebase', 's3'];
  }
  
  isProviderAvailable(provider: string): boolean {
    return this.getAvailableProviders().includes(provider);
  }
}

/**
 * Mock implementation for testing
 */
export class MockStorageHook implements StorageHook {
  private mockProvider: StorageProvider | null = null;
  
  setMockProvider(provider: StorageProvider): void {
    this.mockProvider = provider;
  }
  
  async createProvider(config: StorageConfiguration): Promise<StorageProvider> {
    if (this.mockProvider) {
      return this.mockProvider;
    }
    throw new Error('Mock storage provider not set');
  }
  
  async createFromEnvironment(): Promise<StorageProvider> {
    return this.createProvider({ provider: 'firebase' });
  }
  
  getAvailableProviders(): string[] {
    return ['mock'];
  }
  
  isProviderAvailable(provider: string): boolean {
    return provider === 'mock';
  }
}

/**
 * Storage hook factory
 */
export class StorageHookFactory {
  private static instance: StorageHook | null = null;
  
  /**
   * Get storage hook instance
   */
  static getStorageHook(): StorageHook {
    if (!this.instance) {
      // Auto-detect environment and create appropriate implementation
      if (process.env.NODE_ENV === 'test') {
        this.instance = new MockStorageHook();
      } else if (process.env.GITHUB_ACTIONS) {
        // Use configuration hook for GitHub Actions
        const { getConfiguration } = require('./ConfigurationHook');
        this.instance = new GitHubActionsStorageHook(getConfiguration());
      } else {
        this.instance = new EnvironmentStorageHook();
      }
    }
    return this.instance;
  }
  
  /**
   * Set storage hook instance (for testing)
   */
  static setStorageHook(hook: StorageHook): void {
    this.instance = hook;
  }
  
  /**
   * Reset storage hook instance
   */
  static reset(): void {
    this.instance = null;
  }
}

/**
 * Convenience function to get storage hook
 */
export function getStorageHook(): StorageHook {
  return StorageHookFactory.getStorageHook();
}