import * as core from '@actions/core';
import { StorageProvider } from '../../core/baseline/types';
import { FirebaseStorage } from './FirebaseStorage';
import { S3Storage, createS3StorageFromEnv } from './S3Storage';

export interface StorageConfig {
  provider: 'firebase' | 's3' | 'auto';
  firebase?: {
    credentials: string;
    bucket: string;
    projectId?: string;
  };
  s3?: {
    bucket: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
}

/**
 * Factory for creating storage providers
 */
export class StorageFactory {
  /**
   * Create storage provider from configuration
   */
  static async create(config: StorageConfig): Promise<StorageProvider> {
    let provider: StorageProvider;

    switch (config.provider) {
      case 'firebase':
        if (!config.firebase) {
          throw new Error('Firebase configuration required for firebase provider');
        }
        provider = new FirebaseStorage({
          credentials: config.firebase.credentials,
          bucket: config.firebase.bucket,
          projectId: config.firebase.projectId
        });
        break;

      case 's3':
        if (!config.s3) {
          throw new Error('S3 configuration required for s3 provider');
        }
        provider = new S3Storage(config.s3);
        break;

      case 'auto':
        // Try to auto-detect from environment
        provider = await this.autoDetect(config);
        break;

      default:
        throw new Error(`Unknown storage provider: ${config.provider}`);
    }

    // Initialize the provider
    await provider.initialize();
    core.info(`✅ Storage provider initialized: ${config.provider}`);

    return provider;
  }

  /**
   * Auto-detect storage provider from environment
   */
  private static async autoDetect(config: StorageConfig): Promise<StorageProvider> {
    // Check for Firebase configuration first
    if (config.firebase || process.env.FIREBASE_CREDENTIALS) {
      core.info('Auto-detected Firebase storage configuration');
      return new FirebaseStorage({
        credentials: config.firebase?.credentials || process.env.FIREBASE_CREDENTIALS!,
        bucket: config.firebase?.bucket || process.env.FIREBASE_STORAGE_BUCKET!,
        projectId: config.firebase?.projectId || process.env.FIREBASE_PROJECT_ID
      });
    }

    // Check for S3 configuration
    const s3Storage = createS3StorageFromEnv();
    if (s3Storage || config.s3) {
      core.info('Auto-detected S3 storage configuration');
      return s3Storage || new S3Storage(config.s3!);
    }

    throw new Error(
      'No storage configuration found. Please configure either Firebase or S3 storage.'
    );
  }

  /**
   * Create storage provider from GitHub Action inputs
   */
  static async createFromInputs(): Promise<StorageProvider> {
    // Check which provider to use
    const storageProvider = core.getInput('storage-provider') || 'auto';
    
    const config: StorageConfig = {
      provider: storageProvider as any
    };

    // Firebase configuration from inputs
    const firebaseCredentials = core.getInput('firebase-credentials');
    const storageBucket = core.getInput('storage-bucket');
    
    if (firebaseCredentials && storageBucket) {
      config.firebase = {
        credentials: firebaseCredentials,
        bucket: storageBucket,
        projectId: core.getInput('firebase-project-id') || undefined
      };
    }

    // S3 configuration from inputs
    const s3Bucket = core.getInput('s3-bucket');
    
    if (s3Bucket) {
      config.s3 = {
        bucket: s3Bucket,
        region: core.getInput('aws-region') || undefined,
        accessKeyId: core.getInput('aws-access-key-id') || undefined,
        secretAccessKey: core.getInput('aws-secret-access-key') || undefined
      };
    }

    return this.create(config);
  }

  /**
   * Get storage provider info for logging
   */
  static getProviderInfo(provider: StorageProvider): string {
    if (provider instanceof FirebaseStorage) {
      return 'Firebase Storage';
    } else if (provider instanceof S3Storage) {
      return 'AWS S3';
    }
    return 'Unknown';
  }
}