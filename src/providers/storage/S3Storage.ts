import * as core from '@actions/core';
import { StorageProvider } from '../../core/baseline/types';
import crypto from 'crypto';
import path from 'path';
import { 
  createModuleLogger, 
  ErrorCategory, 
  ErrorSeverity, 
  CircuitBreakerFactory,
  WithCircuitBreaker,
  executeOperation,
  retryOperation
} from '../../core';

// AWS SDK types - these are optional dependencies
let S3Client: any;
let PutObjectCommand: any;
let GetObjectCommand: any;
let DeleteObjectCommand: any;
let ListObjectsV2Command: any;
let HeadObjectCommand: any;
let getSignedUrl: any;

try {
  const s3Module = require('@aws-sdk/client-s3');
  S3Client = s3Module.S3Client;
  PutObjectCommand = s3Module.PutObjectCommand;
  GetObjectCommand = s3Module.GetObjectCommand;
  DeleteObjectCommand = s3Module.DeleteObjectCommand;
  ListObjectsV2Command = s3Module.ListObjectsV2Command;
  HeadObjectCommand = s3Module.HeadObjectCommand;
  
  const presignerModule = require('@aws-sdk/s3-request-presigner');
  getSignedUrl = presignerModule.getSignedUrl;
} catch (error) {
  // AWS SDK not installed - S3Storage will not be available
}

/**
 * S3 Storage Provider for YoFix
 */
export class S3Storage implements StorageProvider {
  private client: any; // S3Client type from AWS SDK
  private bucket: string;
  private region: string;
  private urlExpiry: number = 3600; // 1 hour default
  
  private logger = createModuleLogger({
    module: 'S3Storage',
    defaultCategory: ErrorCategory.STORAGE
  });
  
  private circuitBreaker = CircuitBreakerFactory.getBreaker({
    serviceName: 'S3Storage',
    failureThreshold: 3,
    resetTimeout: 60000,
    timeout: 30000,
    isFailure: (error) => {
      // Don't trip circuit for auth/permission errors
      const message = error.message.toLowerCase();
      return !message.includes('auth') && 
             !message.includes('permission') &&
             !message.includes('forbidden') &&
             !message.includes('access denied');
    },
    fallback: () => {
      this.logger.warn('S3 Storage circuit breaker activated - using fallback');
      return null;
    }
  });

  constructor(config: {
    bucket: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    urlExpiry?: number;
  }) {
    if (!S3Client) {
      const error = new Error('AWS SDK is not installed. Please install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner to use S3 storage.');
      this.logger.error(error, {
        severity: ErrorSeverity.CRITICAL,
        userAction: 'Initialize S3 storage'
      });
      throw error;
    }
    
    this.bucket = config.bucket;
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.urlExpiry = config.urlExpiry || 3600;
    
    // Initialize S3 client
    const clientConfig: any = {
      region: this.region,
    };
    
    // Use explicit credentials if provided
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      };
    }
    // Otherwise rely on AWS SDK credential chain (env vars, IAM role, etc)
    
    this.client = new S3Client(clientConfig);
    
    this.logger.info(`S3 Storage initialized for bucket: ${this.bucket} in region: ${this.region}`);
  }

  /**
   * Initialize and test connection
   */
  async initialize(): Promise<void> {
    const result = await executeOperation(
      () => this.circuitBreaker.execute(async () => {
        // Test bucket access
        const command = new HeadObjectCommand({
          Bucket: this.bucket,
          Key: '.yofix-test'
        });
        
        try {
          await this.client.send(command);
        } catch (error: any) {
          if (error.name !== 'NotFound') {
            throw error;
          }
          // NotFound is expected - bucket is accessible
        }
      }),
      {
        name: 'Test S3 bucket access',
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.HIGH
      }
    );
    
    if (result.success) {
      this.logger.info('✅ S3 Storage connected');
    } else {
      throw new Error(`Failed to connect to S3: ${result.error}`);
    }
  }

  /**
   * Upload file to S3 with circuit breaker protection
   */
  @WithCircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 30000,
    timeout: 60000
  })
  async uploadFile(
    key: string,
    buffer: Buffer,
    metadata?: {
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<string> {
    const uploadParams: any = {
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: metadata?.contentType || 'application/octet-stream',
    };
    
    if (metadata?.metadata) {
      uploadParams.Metadata = metadata.metadata;
    }
    
    // Make screenshots publicly readable
    if (key.includes('screenshot') || key.includes('.png') || key.includes('.jpg')) {
      uploadParams.ACL = 'public-read';
    }
    
    // Upload with retry
    await retryOperation(
      () => this.client.send(new PutObjectCommand(uploadParams)),
      {
        maxAttempts: 3,
        delay: 1000,
        backoff: 2,
        onRetry: (attempt, error) => {
          this.logger.debug(`Upload retry attempt ${attempt} for ${key}: ${error.message}`);
        }
      }
    );
    
    // Return public URL
    return this.getPublicUrl(key);
  }

  /**
   * Get signed URL for private access
   */
  @WithCircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30000
  })
  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    
    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresIn || this.urlExpiry
    });
    
    return url;
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<void> {
    const result = await executeOperation(
      async () => {
        const command = new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key
        });
        await this.client.send(command);
      },
      {
        name: `Delete file ${key}`,
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.LOW,
        metadata: { key }
      }
    );
    
    if (!result.success) {
      // Log but don't throw - deletion failures are often not critical
      this.logger.warn(`Failed to delete file ${key}: ${result.error}`);
    }
  }

  /**
   * Check if file exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await executeOperation(
      async () => {
        const command = new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key
        });
        
        try {
          await this.client.send(command);
          return true;
        } catch (error: any) {
          if (error.name === 'NotFound') {
            return false;
          }
          throw error;
        }
      },
      {
        name: `Check file exists ${key}`,
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.LOW,
        fallback: false
      }
    );
    
    return result.data ?? false;
  }

  /**
   * Download file from S3
   */
  @WithCircuitBreaker({
    failureThreshold: 3,
    timeout: 120000 // 2 minutes for large files
  })
  async downloadFile(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    
    const response = await this.client.send(command);
    
    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body) {
      chunks.push(Buffer.from(chunk));
    }
    
    return Buffer.concat(chunks);
  }

  /**
   * List files with prefix
   */
  async listFiles(prefix: string): Promise<string[]> {
    const result = await executeOperation(
      async () => {
        const command = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix
        });
        
        const response = await this.client.send(command);
        const files = response.Contents || [];
        
        return files.map((file: any) => file.Key).filter(Boolean);
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
  getPublicUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Generate a unique key for uploads
   */
  generateKey(filename: string, prefix?: string): string {
    const timestamp = Date.now();
    const hash = crypto.createHash('sha256')
      .update(`${filename}-${timestamp}`)
      .digest('hex')
      .substring(0, 8);
    
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const uniqueName = `${base}-${hash}${ext}`;
    
    return prefix ? `${prefix}/${uniqueName}` : uniqueName;
  }

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
    return `https://s3.console.aws.amazon.com/s3/buckets/${this.bucket}?region=${this.region}&tab=objects`;
  }

  /**
   * Cleanup old artifacts
   */
  async cleanupOldArtifacts(daysToKeep: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await executeOperation(
      async () => {
        const listParams = {
          Bucket: this.bucket,
          MaxKeys: 1000
        };
        
        const listResult = await this.client.send(new ListObjectsV2Command(listParams));
        const deleteObjects: { Key: string }[] = [];
        
        if (listResult.Contents) {
          for (const obj of listResult.Contents) {
            if (obj.LastModified && new Date(obj.LastModified) < cutoffDate) {
              deleteObjects.push({ Key: obj.Key! });
              this.logger.info(`Marking for deletion: ${obj.Key}`);
            }
          }
        }
        
        if (deleteObjects.length > 0) {
          const deleteParams = {
            Bucket: this.bucket,
            Delete: {
              Objects: deleteObjects,
              Quiet: false
            }
          };
          
          const deleteCommand = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: deleteObjects[0].Key
          });
          
          // Delete objects one by one (AWS SDK v3 doesn't have deleteObjects method)
          for (const obj of deleteObjects) {
            await this.client.send(new DeleteObjectCommand({
              Bucket: this.bucket,
              Key: obj.Key
            }));
          }
          this.logger.info(`Cleaned up ${deleteObjects.length} old artifacts`);
        }
      },
      {
        name: 'Cleanup old artifacts',
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.LOW,
        fallback: undefined
      }
    );
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // S3 client doesn't need explicit cleanup
    this.logger.info('S3 Storage cleaned up');
  }
  
  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return this.circuitBreaker.getStats();
  }
}

/**
 * Create S3 storage from environment variables
 */
export function createS3StorageFromEnv(): S3Storage {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  
  if (!bucket) {
    throw new Error('S3_BUCKET environment variable is required');
  }
  
  return new S3Storage({
    bucket,
    region,
    accessKeyId,
    secretAccessKey
  });
}