import * as admin from 'firebase-admin';
import * as core from '@actions/core';
import { ServiceAccount } from 'firebase-admin';

/**
 * Firebase Storage wrapper for baseline and screenshot management
 */
export class FirebaseStorage {
  private app: admin.app.App | null = null;
  private bucket: any = null; // Firebase bucket type
  private bucketName: string;

  constructor(config?: any) {
    const serviceAccount = config || this.getServiceAccountFromEnv();
    
    if (serviceAccount) {
      try {
        this.app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount as ServiceAccount),
          storageBucket: serviceAccount.project_id ? `${serviceAccount.project_id}.appspot.com` : undefined
        }, `yofix-${Date.now()}`);
        
        this.bucketName = this.app.options.storageBucket || '';
      } catch (error) {
        core.warning(`Failed to initialize Firebase: ${error.message}`);
      }
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
    
    // Test connection
    try {
      await this.bucket.exists();
      core.info('✅ Firebase Storage connected');
    } catch (error) {
      throw new Error(`Failed to connect to Firebase Storage: ${error.message}`);
    }
  }

  /**
   * Upload file to storage
   */
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
    
    await file.save(buffer, {
      metadata: {
        contentType: metadata?.contentType || 'application/octet-stream',
        metadata: metadata?.metadata || {}
      },
      resumable: false
    });
    
    // Make file publicly readable
    await file.makePublic();
    
    return file.publicUrl();
  }

  /**
   * Get signed URL for private access
   */
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
    
    const file = this.bucket.file(path);
    await file.delete({ ignoreNotFound: true });
  }

  /**
   * Check if file exists
   */
  async exists(path: string): Promise<boolean> {
    if (!this.bucket) {
      throw new Error('Storage not initialized');
    }
    
    const file = this.bucket.file(path);
    const [exists] = await file.exists();
    return exists;
  }

  /**
   * List files with prefix
   */
  async listFiles(prefix: string): Promise<string[]> {
    if (!this.bucket) {
      throw new Error('Storage not initialized');
    }
    
    const [files] = await this.bucket.getFiles({ prefix });
    return files.map(file => file.name);
  }

  /**
   * Get service account from environment
   */
  private getServiceAccountFromEnv(): any {
    const base64Creds = process.env.FIREBASE_SERVICE_ACCOUNT || 
                       process.env.FE_FIREBASE_SERVICE_ACCOUNT_ARBOREAL_VISION_339901 ||
                       core.getInput('firebase-service-account');
    
    if (!base64Creds) {
      return null;
    }
    
    try {
      const decoded = Buffer.from(base64Creds, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      core.warning(`Failed to parse Firebase credentials: ${error.message}`);
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.app) {
      await this.app.delete();
      this.app = null;
      this.bucket = null;
    }
  }
}