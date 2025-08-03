import * as admin from 'firebase-admin';
import * as core from '@actions/core';
import { ServiceAccount } from 'firebase-admin';
import { StorageProvider } from '../../core/baseline/types';
import { 
  createModuleLogger, 
  ErrorCategory, 
  ErrorSeverity, 
  CircuitBreakerFactory,
  WithCircuitBreaker,
  executeOperation,
  retryOperation
} from '../../core';

/**
 * Firebase Storage wrapper for baseline and screenshot management
 */
export class FirebaseStorage implements StorageProvider {
  private app: admin.app.App | null = null;
  private bucket: any = null; // Firebase bucket type
  private bucketName: string;
  
  private logger = createModuleLogger({
    module: 'FirebaseStorage',
    defaultCategory: ErrorCategory.STORAGE
  });
  
  private circuitBreaker = CircuitBreakerFactory.getBreaker({
    serviceName: 'FirebaseStorage',
    failureThreshold: 3,
    resetTimeout: 60000,
    timeout: 30000,
    isFailure: (error) => {
      // Don't trip circuit for auth errors
      return !error.message.includes('auth') && !error.message.includes('permission');
    },
    fallback: () => {
      this.logger.warn('Firebase Storage circuit breaker activated - using fallback');
      return null;
    }
  });

  constructor(config?: any) {
    let serviceAccount = null;
    
    if (config?.credentials) {
      // Parse base64 encoded credentials
      try {
        const credentialsString = Buffer.from(config.credentials, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(credentialsString);
        
        // Validate required fields
        if (!serviceAccount.project_id) {
          throw new Error('Service account object must contain a string "project_id" property.');
        }
        
        // Set bucket name from config if provided
        if (config.bucket) {
          this.bucketName = config.bucket;
        }
      } catch (error) {
        this.logger.error(error, {
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.CONFIGURATION,
          userAction: 'Parse Firebase credentials'
        });
        throw error;
      }
    } else {
      serviceAccount = config || this.getServiceAccountFromEnv();
    }
    
    if (serviceAccount) {
      executeOperation(
        () => this.initializeApp(serviceAccount),
        {
          name: 'Initialize Firebase app',
          category: ErrorCategory.CONFIGURATION,
          severity: ErrorSeverity.HIGH
        }
      ).then(result => {
        if (!result.success) {
          this.logger.warn('Failed to initialize Firebase app');
        }
      }).catch(error => {
        this.logger.error(error, {
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.CONFIGURATION,
          userAction: 'Initialize Firebase app'
        });
      });
    }
  }
  
  private async initializeApp(serviceAccount: any): Promise<void> {
    // Use the bucket name from constructor if set, otherwise derive from project_id
    const storageBucket = this.bucketName || 
      (serviceAccount.project_id ? `${serviceAccount.project_id}.appspot.com` : undefined);
    
    this.app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as ServiceAccount),
      storageBucket: storageBucket
    }, `yofix-${Date.now()}`);
    
    // Update bucket name if it wasn't set in constructor
    if (!this.bucketName) {
      this.bucketName = this.app.options.storageBucket || '';
    }
  }

  /**
   * Initialize storage bucket
   */
  async initialize(): Promise<void> {
    if (!this.app) {
      throw new Error('Firebase not initialized');
    }
    
    this.bucket = admin.storage(this.app).bucket();
    
    // Test connection with circuit breaker
    const result = await executeOperation(
      () => this.circuitBreaker.execute(() => this.bucket.exists()),
      {
        name: 'Test Firebase Storage connection',
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.HIGH
      }
    );
    
    if (result.success) {
      this.logger.info('✅ Firebase Storage connected');
    } else {
      throw new Error(`Failed to connect to Firebase Storage: ${result.error}`);
    }
  }

  /**
   * Upload file to storage with circuit breaker protection
   */
  @WithCircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 30000,
    timeout: 60000
  })
  async uploadFile(
    path: string,
    buffer: Buffer,
    metadata?: {
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<string> {
    if (!this.bucket) {
      throw new Error('Storage not initialized');
    }
    
    const file = this.bucket.file(path);
    
    // Upload with retry
    await retryOperation(
      () => file.save(buffer, {
        metadata: {
          contentType: metadata?.contentType || 'application/octet-stream',
          metadata: metadata?.metadata || {}
        },
        resumable: false
      }),
      {
        maxAttempts: 3,
        delay: 1000,
        backoff: 2,
        onRetry: (attempt, error) => {
          this.logger.debug(`Upload retry attempt ${attempt} for ${path}: ${error.message}`);
        }
      }
    );
    
    // Make file publicly readable
    await file.makePublic();
    
    return file.publicUrl();
  }

  /**
   * Get signed URL for private access
   */
  @WithCircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30000
  })
  async getSignedUrl(path: string, expiresIn: number = 3600): Promise<string> {
    if (!this.bucket) {
      throw new Error('Storage not initialized');
    }
    
    const file = this.bucket.file(path);
    
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresIn * 1000
    });
    
    return url;
  }

  /**
   * Delete file from storage
   */
  async deleteFile(path: string): Promise<void> {
    if (!this.bucket) {
      throw new Error('Storage not initialized');
    }
    
    const result = await executeOperation(
      async () => {
        const file = this.bucket.file(path);
        await file.delete();
      },
      {
        name: `Delete file ${path}`,
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.LOW,
        metadata: { path }
      }
    );
    
    if (!result.success) {
      // Log but don't throw - deletion failures are often not critical
      this.logger.warn(`Failed to delete file ${path}: ${result.error}`);
    }
  }

  /**
   * Check if file exists
   */
  async exists(path: string): Promise<boolean> {
    if (!this.bucket) {
      throw new Error('Storage not initialized');
    }
    
    const result = await executeOperation(
      async () => {
        const file = this.bucket.file(path);
        const [exists] = await file.exists();
        return exists;
      },
      {
        name: `Check file exists ${path}`,
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.LOW,
        fallback: false
      }
    );
    
    return result.data ?? false;
  }

  /**
   * Download file from storage
   */
  @WithCircuitBreaker({
    failureThreshold: 3,
    timeout: 120000 // 2 minutes for large files
  })
  async downloadFile(path: string): Promise<Buffer> {
    if (!this.bucket) {
      throw new Error('Storage not initialized');
    }
    
    const file = this.bucket.file(path);
    const [buffer] = await file.download();
    
    return buffer;
  }

  /**
   * List files with prefix
   */
  async listFiles(prefix: string): Promise<string[]> {
    if (!this.bucket) {
      throw new Error('Storage not initialized');
    }
    
    const result = await executeOperation(
      async () => {
        const [files] = await this.bucket.getFiles({ prefix });
        return files.map(file => file.name);
      },
      {
        name: `List files with prefix ${prefix}`,
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.LOW,
        fallback: []
      }
    );
    
    return result.data ?? [];
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(path: string): string {
    if (!this.bucketName) {
      throw new Error('Bucket name not configured');
    }
    
    return `https://storage.googleapis.com/${this.bucketName}/${path}`;
  }

  /**
   * Get service account from environment
   */
  private getServiceAccountFromEnv(): any {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      
      if (!projectId || !clientEmail || !privateKey) {
        this.logger.debug('Firebase credentials not found in environment');
        return null;
      }
      
      return {
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey
      };
    } catch (error) {
      this.logger.debug('Failed to parse Firebase credentials from environment');
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  /**
   * Upload multiple files in batch
   */
  async uploadBatch(files: Array<{
    path: string;
    content: Buffer;
    contentType?: string;
    metadata?: Record<string, string>;
  }>): Promise<string[]> {
    const uploadPromises = files.map(file =>
      this.uploadFile(file.path, file.content, {
        contentType: file.contentType,
        metadata: file.metadata
      })
    );
    
    return Promise.all(uploadPromises);
  }

  /**
   * Generate storage console URL
   */
  generateStorageConsoleUrl(): string {
    const projectId = this.bucketName.replace('.appspot.com', '');
    return `https://console.firebase.google.com/project/${projectId}/storage/${this.bucketName}/files`;
  }

  /**
   * Cleanup old artifacts
   */
  async cleanupOldArtifacts(daysToKeep: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await executeOperation(
      async () => {
        const [files] = await this.bucket.getFiles();
        const deletePromises: Promise<void>[] = [];
        
        for (const file of files) {
          const metadata = file.metadata;
          const created = new Date(metadata.timeCreated);
          
          if (created < cutoffDate) {
            deletePromises.push(
              file.delete().then(() => {
                this.logger.info(`Deleted old file: ${file.name}`);
              })
            );
          }
        }
        
        await Promise.all(deletePromises);
        this.logger.info(`Cleaned up ${deletePromises.length} old artifacts`);
      },
      {
        name: 'Cleanup old artifacts',
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.LOW,
        fallback: undefined
      }
    );
  }

  async cleanup(): Promise<void> {
    if (this.app) {
      await this.app.delete();
      this.app = null;
      this.bucket = null;
      this.logger.info('Firebase app cleaned up');
    }
  }
  
  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return this.circuitBreaker.getStats();
  }
}