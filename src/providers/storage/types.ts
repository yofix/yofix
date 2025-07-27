/**
 * Storage provider types and interfaces
 */

export { StorageProvider } from '../../core/baseline/types';

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

export interface FirebaseStorageConfig {
  bucket: string;
  prPath: string;
  cleanupDays: number;
}

export interface StorageResult {
  url: string;
  path: string;
  size?: number;
  metadata?: Record<string, any>;
}