import * as core from '@actions/core';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { promises as fs } from 'fs';
import path from 'path';
import { FirebaseConfig, FirebaseStorageConfig, Screenshot, Video } from '../../types';
import { FirebaseErrorHandler } from '../firebase/FirebaseErrorHandler';

export class FirebaseStorageManager {
  private static instance: FirebaseStorageManager | null = null;
  private bucket: any;
  private config: FirebaseStorageConfig;
  private firebaseConfig: FirebaseConfig;
  private prNumber: number;
  private app: any; // Store app reference for cleanup

  private constructor(
    firebaseConfig: FirebaseConfig,
    storageConfig: FirebaseStorageConfig,
    serviceAccountBase64: string
  ) {
    this.config = storageConfig;
    this.prNumber = this.extractPRNumber(firebaseConfig.previewUrl);
    
    // Extract project ID from service account before initializing
    const serviceAccount = this.parseServiceAccount(serviceAccountBase64);
    this.firebaseConfig = {
      ...firebaseConfig,
      projectId: serviceAccount.project_id || firebaseConfig.projectId
    };
    
    this.initializeFirebase(serviceAccountBase64);
  }

  /**
   * Get singleton instance of FirebaseStorageManager
   */
  static getInstance(
    firebaseConfig: FirebaseConfig,
    storageConfig: FirebaseStorageConfig,
    serviceAccountBase64: string
  ): FirebaseStorageManager {
    // Check if instance exists and has same configuration
    if (FirebaseStorageManager.instance) {
      const currentConfig = FirebaseStorageManager.instance.config;
      const currentFirebaseConfig = FirebaseStorageManager.instance.firebaseConfig;
      
      // If configuration has changed, cleanup old instance and create new one
      if (currentConfig.bucket !== storageConfig.bucket || 
          currentFirebaseConfig.projectId !== firebaseConfig.projectId) {
        core.info('Firebase configuration changed, creating new instance...');
        FirebaseStorageManager.instance.cleanup();
        FirebaseStorageManager.instance = null;
      } else {
        // Update PR number if it changed
        FirebaseStorageManager.instance.prNumber = FirebaseStorageManager.instance.extractPRNumber(firebaseConfig.previewUrl);
        return FirebaseStorageManager.instance;
      }
    }
    
    // Create new instance
    FirebaseStorageManager.instance = new FirebaseStorageManager(
      firebaseConfig,
      storageConfig,
      serviceAccountBase64
    );
    
    return FirebaseStorageManager.instance;
  }

  /**
   * Initialize Firebase Admin SDK with enhanced error handling
   */
  private initializeFirebase(serviceAccountBase64: string): void {
    // Validate configuration first
    FirebaseErrorHandler.validateFirebaseConfig({
      projectId: this.firebaseConfig.projectId,
      serviceAccount: serviceAccountBase64,
      storageBucket: this.config.bucket
    });

    try {
      core.info('Initializing Firebase Admin SDK for storage...');
      
      // Decode service account
      const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(serviceAccountJson);
      
      // Check if Firebase app is already initialized
      const appName = `yofix-storage-${Date.now()}`;
      const existingApps = getApps();
      
      // Create a new app instance for this storage manager
      this.app = initializeApp({
        credential: cert(serviceAccount),
        storageBucket: this.config.bucket
      }, appName);

      // Get storage instance from the specific app
      const storage = getStorage(this.app);
      this.bucket = storage.bucket();
      
      core.info(`Firebase Storage initialized for bucket: ${this.config.bucket}`);
    } catch (error) {
      FirebaseErrorHandler.handleError(error, 'Firebase Storage initialization');
    }
  }

  /**
   * Parse service account from base64
   */
  private parseServiceAccount(serviceAccountBase64: string): any {
    try {
      const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
      return JSON.parse(serviceAccountJson);
    } catch (error) {
      core.warning('Failed to parse service account for project ID extraction');
      return {};
    }
  }

  /**
   * Extract PR number from Firebase preview URL
   */
  private extractPRNumber(previewUrl: string): number {
    const match = previewUrl.match(/--pr-(\d+)-/);
    return match ? parseInt(match[1], 10) : Date.now(); // Fallback to timestamp
  }

  /**
   * Generate storage path for PR artifacts
   */
  private generateStoragePath(type: 'screenshots' | 'videos', filename: string): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `${this.config.basePath}/PR-${this.prNumber}/${timestamp}/${type}/${filename}`;
  }

  /**
   * Upload screenshots to Firebase Storage with error handling
   */
  async uploadScreenshots(screenshots: Screenshot[]): Promise<Screenshot[]> {
    core.info(`Uploading ${screenshots.length} screenshots to Firebase Storage...`);
    
    const uploadedScreenshots: Screenshot[] = [];
    
    for (const screenshot of screenshots) {
      try {
        const uploadedScreenshot = await FirebaseErrorHandler.withErrorHandling(
          async () => {
            const storagePath = this.generateStoragePath('screenshots', screenshot.name);
            const file = this.bucket.file(storagePath);
            
            // Upload file
            await file.save(await fs.readFile(screenshot.path), {
              metadata: {
                contentType: 'image/png',
                metadata: {
                  prNumber: this.prNumber.toString(),
                  viewport: screenshot.viewport.name,
                  timestamp: screenshot.timestamp.toString(),
                  firebaseProject: this.firebaseConfig.projectId,
                  firebaseTarget: this.firebaseConfig.target
                }
              }
            });

            // Generate signed URL
            const [signedUrl] = await file.getSignedUrl({
              action: 'read',
              expires: Date.now() + this.config.signedUrlExpiry
            });

            return {
              ...screenshot,
              firebaseUrl: signedUrl
            };
          },
          `screenshot upload (${screenshot.name})`,
          true
        );

        uploadedScreenshots.push(uploadedScreenshot);
        core.info(`Uploaded screenshot: ${screenshot.name}`);
      } catch (error) {
        core.warning(`Failed to upload screenshot ${screenshot.name}, continuing without Firebase URL`);
        // Add screenshot without Firebase URL on failure
        uploadedScreenshots.push(screenshot);
      }
    }

    return uploadedScreenshots;
  }

  /**
   * Upload videos to Firebase Storage
   */
  async uploadVideos(videos: Video[]): Promise<Video[]> {
    if (videos.length === 0) {
      return videos;
    }

    core.info(`Uploading ${videos.length} videos to Firebase Storage...`);
    
    const uploadedVideos: Video[] = [];
    
    for (const video of videos) {
      try {
        // Check if video file exists and has content
        const videoExists = await fs.access(video.path).then(() => true).catch(() => false);
        if (!videoExists) {
          core.warning(`Video file not found: ${video.path}`);
          uploadedVideos.push(video);
          continue;
        }

        // Check video file size
        const videoStats = await fs.stat(video.path);
        if (videoStats.size === 0) {
          core.warning(`Video file is empty: ${video.path}`);
          uploadedVideos.push(video);
          continue;
        }

        core.info(`Uploading video: ${video.name} (${videoStats.size} bytes)`);

        const storagePath = this.generateStoragePath('videos', video.name);
        const file = this.bucket.file(storagePath);
        
        // Read video file content
        const videoContent = await fs.readFile(video.path);
        
        // Determine content type based on file extension
        const contentType = video.name.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
        
        // Upload file with proper metadata
        await file.save(videoContent, {
          metadata: {
            contentType: contentType,
            cacheControl: 'public, max-age=3600',
            metadata: {
              prNumber: this.prNumber.toString(),
              duration: video.duration.toString(),
              timestamp: video.timestamp.toString(),
              fileSize: videoStats.size.toString(),
              firebaseProject: this.firebaseConfig.projectId,
              firebaseTarget: this.firebaseConfig.target,
              mimeType: contentType
            }
          },
          resumable: false // Use simple upload for videos under 5MB
        });

        // Generate signed URL
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + this.config.signedUrlExpiry
        });

        uploadedVideos.push({
          ...video,
          firebaseUrl: signedUrl
        });

        core.info(`Uploaded video: ${video.name}`);
      } catch (error) {
        core.error(`Failed to upload video ${video.name}: ${error}`);
        // Add video without Firebase URL on failure
        uploadedVideos.push(video);
      }
    }

    return uploadedVideos;
  }

  /**
   * Create a summary file with all artifacts and upload it
   */
  async uploadSummary(screenshots: Screenshot[], videos: Video[], testResults: any): Promise<string | null> {
    try {
      core.info('Creating and uploading test summary...');
      
      const summary = {
        prNumber: this.prNumber,
        timestamp: new Date().toISOString(),
        firebaseConfig: this.firebaseConfig,
        testResults: {
          totalTests: testResults.length,
          passedTests: testResults.filter((r: any) => r.status === 'passed').length,
          failedTests: testResults.filter((r: any) => r.status === 'failed').length,
          skippedTests: testResults.filter((r: any) => r.status === 'skipped').length
        },
        artifacts: {
          screenshots: screenshots.map(s => ({
            name: s.name,
            url: s.firebaseUrl,
            viewport: s.viewport
          })),
          videos: videos.map(v => ({
            name: v.name,
            url: v.firebaseUrl,
            duration: v.duration
          }))
        }
      };

      const summaryJson = JSON.stringify(summary, null, 2);
      const summaryPath = this.generateStoragePath('screenshots', 'test-summary.json');
      const file = this.bucket.file(summaryPath);
      
      await file.save(summaryJson, {
        metadata: {
          contentType: 'application/json',
          metadata: {
            prNumber: this.prNumber.toString(),
            type: 'test-summary',
            firebaseProject: this.firebaseConfig.projectId,
            firebaseTarget: this.firebaseConfig.target
          }
        }
      });

      // Generate signed URL for summary
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + this.config.signedUrlExpiry
      });

      core.info('Test summary uploaded successfully');
      return signedUrl;
    } catch (error) {
      core.error(`Failed to upload test summary: ${error}`);
      return null;
    }
  }

  /**
   * Generate Firebase Storage console URL for easy access
   */
  generateStorageConsoleUrl(): string {
    const basePath = `PR-${this.prNumber}`;
    return `https://console.firebase.google.com/project/${this.firebaseConfig.projectId}/storage/${this.config.bucket}/files/${basePath}`;
  }

  /**
   * Clean up old PR artifacts (older than specified days)
   */
  async cleanupOldArtifacts(maxAgeInDays: number): Promise<void> {
    try {
      core.info(`Cleaning up artifacts older than ${maxAgeInDays} days...`);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeInDays);
      
      const [files] = await this.bucket.getFiles({
        prefix: this.config.basePath,
        maxResults: 1000 // Limit to prevent overwhelming
      });

      let deletedCount = 0;
      
      for (const file of files) {
        try {
          const [metadata] = await file.getMetadata();
          const fileDate = new Date(metadata.timeCreated);
          
          if (fileDate < cutoffDate) {
            await file.delete();
            deletedCount++;
          }
        } catch (error) {
          core.warning(`Failed to process file ${file.name} during cleanup: ${error}`);
        }
      }

      if (deletedCount > 0) {
        core.info(`Cleaned up ${deletedCount} old files`);
      } else {
        core.info('No old files found for cleanup');
      }
    } catch (error) {
      core.warning(`Cleanup process failed: ${error}`);
    }
  }

  /**
   * Get public URL for a file if bucket is public
   */
  getPublicUrl(storagePath: string): string {
    return `https://storage.googleapis.com/${this.config.bucket}/${storagePath}`;
  }

  /**
   * Create default storage configuration
   */
  static createDefaultConfig(bucketName: string): FirebaseStorageConfig {
    return {
      bucket: bucketName,
      basePath: 'yofix',
      signedUrlExpiry: 24 * 60 * 60 * 1000 // 24 hours
    };
  }

  /**
   * Batch upload multiple files with progress tracking
   */
  async batchUpload(files: { localPath: string, remotePath: string, contentType: string }[]): Promise<string[]> {
    const uploadPromises = files.map(async (file, index) => {
      try {
        const storageFile = this.bucket.file(file.remotePath);
        await storageFile.save(await fs.readFile(file.localPath), {
          metadata: {
            contentType: file.contentType,
            metadata: {
              prNumber: this.prNumber.toString(),
              uploadBatch: Date.now().toString()
            }
          }
        });

        const [signedUrl] = await storageFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + this.config.signedUrlExpiry
        });

        core.info(`Batch upload progress: ${index + 1}/${files.length}`);
        return signedUrl;
      } catch (error) {
        core.error(`Batch upload failed for ${file.remotePath}: ${error}`);
        throw error;
      }
    });

    return Promise.all(uploadPromises);
  }

  /**
   * Cleanup Firebase app instance
   */
  async cleanup(): Promise<void> {
    if (this.app) {
      await this.app.delete();
      this.app = null;
    }
    // Reset singleton instance
    if (FirebaseStorageManager.instance === this) {
      FirebaseStorageManager.instance = null;
    }
  }

  /**
   * Force reset singleton (useful for testing)
   */
  static reset(): void {
    if (FirebaseStorageManager.instance) {
      FirebaseStorageManager.instance.cleanup();
      FirebaseStorageManager.instance = null;
    }
  }
}