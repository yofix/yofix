import * as core from '@actions/core';
import { StorageProvider } from '../../core/baseline/types';
import crypto from 'crypto';
import path from 'path';

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

  constructor(config: {
    bucket: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    urlExpiry?: number;
  }) {
    if (!S3Client) {
      throw new Error('AWS SDK is not installed. Please install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner to use S3 storage.');
    }
    
    this.bucket = config.bucket;
    this.region = config.region || 'us-east-1';
    this.urlExpiry = config.urlExpiry || 3600;

    // Initialize S3 client
    this.client = new S3Client({
      region: this.region,
      credentials: config.accessKeyId && config.secretAccessKey ? {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      } : undefined // Use default credentials if not provided
    });
  }

  /**
   * Initialize storage (create bucket if needed)
   */
  async initialize(): Promise<void> {
    try {
      // Check if bucket exists
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: '.yofix'
      });
      
      await this.client.send(command);
      core.info(`✅ S3 bucket ${this.bucket} is accessible`);
    } catch (error) {
      if (error.name === 'NotFound') {
        // Create marker file
        await this.uploadFile('.yofix', Buffer.from('YoFix Storage'), {
          contentType: 'text/plain'
        });
      } else {
        throw new Error(`S3 initialization failed: ${error.message}`);
      }
    }
  }

  /**
   * Upload file to S3
   */
  async uploadFile(
    filePath: string, 
    content: Buffer, 
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
      Body: content,
      ContentType: options?.contentType || 'application/octet-stream',
      Metadata: options?.metadata,
      // Make files publicly readable
      ACL: 'public-read'
    });

    await this.client.send(command);
    
    // Return public URL
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${filePath}`;
  }

  /**
   * Get signed URL for private access
   */
  async getSignedUrl(filePath: string, expiresIn?: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: filePath
    });

    return await getSignedUrl(this.client, command, {
      expiresIn: expiresIn || this.urlExpiry
    });
  }

  /**
   * Download file from S3
   */
  async downloadFile(filePath: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: filePath
    });

    const response = await this.client.send(command);
    
    if (!response.Body) {
      throw new Error(`No content found for ${filePath}`);
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }

  /**
   * Delete file from S3
   */
  async deleteFile(filePath: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: filePath
    });

    await this.client.send(command);
  }

  /**
   * List files with prefix
   */
  async listFiles(prefix: string, maxResults?: number): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: maxResults || 1000
    });

    const response = await this.client.send(command);
    
    return (response.Contents || [])
      .map(obj => obj.Key)
      .filter((key): key is string => key !== undefined);
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

    return await Promise.all(uploadPromises);
  }

  /**
   * Generate storage console URL
   */
  generateStorageConsoleUrl(): string {
    return `https://s3.console.aws.amazon.com/s3/buckets/${this.bucket}`;
  }

  /**
   * Clean up old artifacts
   */
  async cleanupOldArtifacts(daysToKeep: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      // List all objects
      const objects = await this.listFiles('screenshots/');
      
      // Check each object's last modified date
      for (const key of objects) {
        if (!key) continue;
        
        const headCommand = new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key
        });
        
        try {
          const response = await this.client.send(headCommand);
          
          if (response.LastModified && response.LastModified < cutoffDate) {
            await this.deleteFile(key);
            core.info(`Deleted old artifact: ${key}`);
          }
        } catch (error) {
          core.warning(`Failed to check artifact ${key}: ${error.message}`);
        }
      }
    } catch (error) {
      core.warning(`Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Calculate file fingerprint
   */
  calculateFingerprint(buffer: Buffer): string {
    return crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    oldestFile?: Date;
    newestFile?: Date;
  }> {
    const objects = await this.listFiles('');
    let totalSize = 0;
    let oldestFile: Date | undefined;
    let newestFile: Date | undefined;

    for (const key of objects) {
      if (!key) continue;
      
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      
      try {
        const response = await this.client.send(headCommand);
        
        if (response.ContentLength) {
          totalSize += response.ContentLength;
        }
        
        if (response.LastModified) {
          if (!oldestFile || response.LastModified < oldestFile) {
            oldestFile = response.LastModified;
          }
          if (!newestFile || response.LastModified > newestFile) {
            newestFile = response.LastModified;
          }
        }
      } catch (error) {
        // Skip files we can't access
      }
    }

    return {
      totalFiles: objects.length,
      totalSize,
      oldestFile,
      newestFile
    };
  }
}

/**
 * Factory function to create S3 storage from environment
 */
export function createS3StorageFromEnv(): S3Storage | null {
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  
  if (!bucket) {
    return null;
  }

  return new S3Storage({
    bucket,
    region: process.env.AWS_REGION || process.env.S3_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    urlExpiry: parseInt(process.env.S3_URL_EXPIRY || '3600', 10)
  });
}