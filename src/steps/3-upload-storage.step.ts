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
    const { prNumber, screenshots, _internal: internal } = stepData;

    if (!screenshots || !internal?.screenshotResult) {
      throw new Error('No screenshots available for upload. Run browse-routes step first.');
    }

    // Skip upload if no screenshots captured
    if (screenshots.files.length === 0) {
      core.info('ℹ️ No screenshots to upload - skipping storage upload');

      return {
        ...stepData,
        _internal: {
          ...internal,
          uploadedFiles: [],
          storageUrl: '',
          screenshotMetadataMap: {}
        }
      };
    }

    const firebaseCredentials = config.get('firebase-credentials');
    const storageBucket = config.get('storage-bucket');
    const storageDirectory = config.get('storage-directory', { defaultValue: 'yofix' });
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
      };
    }

    core.info(`📤 Uploading ${screenshots.files.length} screenshots to ${storageProvider} storage...`);
    core.info(`  Storage Bucket: ${storageBucket}`);
    core.info(`  Storage Directory: ${storageDirectory}/`);

    // Prepare files for upload from screenshotResult
    const screenshotMetadataMap = new Map<string, { route: string; viewport: any; metadata: any; duration?: number }>();

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

    // Add diff images to upload if comparison was run
    if (internal.diffFiles && Array.isArray(internal.diffFiles)) {
      core.info(`📊 Adding ${internal.diffFiles.length} diff image(s) to upload`);

      for (const diffFile of internal.diffFiles) {
        // Only upload diff files that have actual differences
        if (diffFile.hasDifference && diffFile.localPath) {
          filesForUpload.push({
            path: diffFile.localPath,
            destination: diffFile.destination,
            contentType: 'image/png',
            metadata: {
              type: 'diff',
              route: diffFile.route,
              viewport: diffFile.viewport,
              diffPercentage: diffFile.diffPercentage,
              status: diffFile.status
            }
          });

          // Store diff metadata
          screenshotMetadataMap.set(diffFile.localPath, {
            route: diffFile.route,
            viewport: { name: diffFile.viewport },
            metadata: {
              type: 'diff',
              diffPercentage: diffFile.diffPercentage,
              metrics: diffFile.metrics
            }
          });
        }
      }
    }

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
      type ProviderConfig = Parameters<typeof uploadFiles>[0]['storage'];

      // Construct storage config based on provider type
      const storageConfig: ProviderConfig = storageProvider === 'firebase'
        ? {
            provider: 'firebase',
            config: {
              bucket: storageBucket,
              credentials: credentialsBase64,
              basePath: storageDirectory
            }
          }
        : {
            provider: 's3',
            config: {
              bucket: storageBucket,
              region: config.get('aws-region', { defaultValue: 'us-east-1' }),
              accessKeyId: config.get('aws-access-key-id'),
              secretAccessKey: config.get('aws-secret-access-key'),
              basePath: storageDirectory
            }
          };

      // Upload using @yofix/storage
      const basePath = storageDirectory
        ? `${storageDirectory}/pr-${prNumber}/screenshots`
        : `pr-${prNumber}/screenshots`;

      const uploadResult = await uploadFiles({
        storage: storageConfig,
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
