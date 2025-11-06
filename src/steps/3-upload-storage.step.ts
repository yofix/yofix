/**
 * Step 3: Upload to Storage
 *
 * Uploads captured screenshots to Firebase Storage or S3 using @yofix/storage.
 * Generates public URLs for viewing in PR comments.
 *
 * Outputs:
 * - uploadedFiles: Array of uploaded file paths with URLs
 * - storageUrl: Console URL to view all screenshots
 */

import * as core from '@actions/core';
import { promises as fs } from 'fs';
import { getStepDataManager, executeStep, StepData } from './shared/StepDataManager';
import { ErrorSeverity, ErrorCategory, errorHandler, config } from '../core';

interface UploadedFile {
  localPath: string;
  remotePath: string;
  url?: string;
}

/**
 * Main step execution
 */
export async function uploadToStorage(stepData: StepData): Promise<StepData> {
  return executeStep('Upload Screenshots to Storage', async () => {
    const { prNumber, screenshots } = stepData;
    const internal = (stepData as any)._internal;

    if (!screenshots || !internal?.screenshotResult) {
      throw new Error('No screenshots available for upload. Run browse-routes step first.');
    }

    const firebaseCredentials = config.get('firebase-credentials');
    const storageBucket = config.get('storage-bucket');
    const storageProvider = config.get('storage-provider', { defaultValue: 'firebase' });

    // Skip upload if storage not configured
    if (!firebaseCredentials || !storageBucket) {
      core.warning('⚠️ Firebase storage not configured. Screenshots saved locally only.');
      core.warning(`  Firebase credentials present: ${!!firebaseCredentials}`);
      core.warning(`  Storage bucket configured: ${!!storageBucket}`);

      return {
        ...stepData,
        _internal: {
          ...internal,
          uploadedFiles: [],
          storageUrl: ''
        }
      } as any;
    }

    core.info(`📤 Uploading ${screenshots.files.length} screenshots to ${storageProvider} storage...`);
    core.info(`  Storage Bucket: ${storageBucket}`);

    // Prepare files for upload from screenshotResult
    const screenshotMetadataMap = new Map<string, { route: string; viewport: any; metadata: any }>();

    const filesForUpload = internal.screenshotResult.screenshots.flatMap((routeScreenshot: any) =>
      routeScreenshot.screenshots.map((screenshot: any) => {
        // Store metadata for later retrieval
        screenshotMetadataMap.set(screenshot.path, {
          route: routeScreenshot.route,
          viewport: {
            width: screenshot.width,
            height: screenshot.height,
            name: screenshot.viewport
          },
          metadata: screenshot.metadata,
          duration: screenshot.duration || screenshot.metadata?.duration
        });

        return {
          path: screenshot.path,
          destination: screenshot.destination,
          contentType: screenshot.contentType,
          metadata: screenshot.metadata
        };
      })
    );

    // Check if firebaseCredentials is a file path (for testing)
    let credentialsBase64 = firebaseCredentials;
    if (firebaseCredentials.endsWith('.json')) {
      try {
        const credentialsContent = await fs.readFile(firebaseCredentials, 'utf-8');
        credentialsBase64 = Buffer.from(credentialsContent).toString('base64');
        core.info('  Using Firebase credentials from file');
      } catch (error) {
        core.debug(`Not a file path, treating as base64: ${error}`);
      }
    }

    let uploadedFiles: UploadedFile[] = [];
    let storageUrl = '';

    try {
      // Dynamic import to avoid bundling issues
      const { uploadFiles } = await import('@yofix/storage');

      // Upload using @yofix/storage
      const uploadResult = await uploadFiles({
        storage: {
          provider: storageProvider as 'firebase' | 's3',
          config: {
            bucket: storageBucket,
            credentials: credentialsBase64,
            basePath: `pr-${prNumber}/screenshots`
          }
        } as any, // Type assertion for external package
        files: filesForUpload,
        verbose: true,
        onProgress: (progress) => {
          const percentage = ((progress.filesUploaded / progress.totalFiles) * 100).toFixed(1);
          core.info(`  Upload progress: ${progress.filesUploaded}/${progress.totalFiles} files (${percentage}%)`);
        }
      });

      if (!uploadResult.success) {
        const errorMessage = uploadResult.errors?.map(e => e.message).join(', ');
        throw new Error(`Upload failed: ${errorMessage}`);
      }

      uploadedFiles = uploadResult.files;

      core.info('✅ Screenshots uploaded successfully:');
      uploadedFiles.slice(0, 5).forEach(file => {
        core.info(`  📸 ${file.remotePath}: ${file.url || 'pending'}`);
      });
      if (uploadedFiles.length > 5) {
        core.info(`  ... and ${uploadedFiles.length - 5} more files`);
      }
      core.info(`  Total uploaded: ${uploadedFiles.length}/${filesForUpload.length}`);

      // Generate storage console URL
      if (storageProvider === 'firebase') {
        const projectId = storageBucket.split('.')[0] || 'unknown';
        storageUrl = `https://console.firebase.google.com/project/${projectId}/storage/${storageBucket}`;
      } else if (storageProvider === 's3') {
        const region = config.get('aws-region', { defaultValue: 'us-east-1' });
        storageUrl = `https://s3.console.aws.amazon.com/s3/buckets/${storageBucket}?region=${region}`;
      }

      core.info(`\n🔗 View all screenshots: ${storageUrl}`);

    } catch (error) {
      core.warning(`Failed to upload screenshots: ${error}`);
      core.warning('Screenshots are saved locally but not uploaded to cloud storage');

      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.PACKAGE,
        location: '@yofix/storage',
        recoverable: true
      });
    }

    // Update step data with upload results
    // Convert Map to object for JSON serialization
    const metadataObject = Object.fromEntries(screenshotMetadataMap.entries());

    return {
      ...stepData,
      _internal: {
        ...internal,
        uploadedFiles,
        storageUrl,
        screenshotMetadataMap: metadataObject
      }
    } as any;
  });
}

/**
 * Entry point for standalone execution
 */
export async function main(): Promise<void> {
  try {
    const manager = getStepDataManager();
    const stepData = await manager.load();
    const updatedData = await uploadToStorage(stepData);
    await manager.save(updatedData);

    core.info('✅ Step 3: Upload Storage completed successfully');
  } catch (error) {
    core.setFailed(`Step 3 failed: ${error}`);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
