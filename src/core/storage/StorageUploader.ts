/**
 * StorageUploader - Single Responsibility: Upload screenshots to cloud storage
 * Uses @yofix/storage for multi-provider support (DRY principle)
 */

import * as core from "@actions/core";
import { uploadFiles, type UploadedFile } from "@yofix/storage";
import { getConfiguration } from "../hooks/ConfigurationHook";
import type { RouteScreenshot } from "@yofix/browser";

export interface StorageUploadOptions {
  screenshots: RouteScreenshot[];
  outputDirectory: string;
  prNumber: number;
  storageProvider: "firebase" | "s3";
}

export interface StorageUploadResult {
  success: boolean;
  uploadedFiles: UploadedFile[];
  totalSize: number;
  duration: number;
  errors?: string[];
}

/**
 * Upload screenshots to cloud storage with progress tracking
 */
export async function uploadScreenshots(
  options: StorageUploadOptions
): Promise<StorageUploadResult> {
  const configuration = getConfiguration();

  core.info(`📤 Uploading screenshots to ${options.storageProvider}...`);
  core.info(`  - Total routes: ${options.screenshots.length}`);
  core.info(`  - Total files: ${getTotalFileCount(options.screenshots)}`);

  // Prepare storage configuration
  const storageConfig = prepareStorageConfig(
    options.storageProvider,
    options.prNumber
  );

  // Flatten screenshots to file list
  const files = flattenScreenshotsToFiles(options.screenshots);

  try {
    const result = await uploadFiles({
      storage: storageConfig,
      files,
      verbose: true,
      onProgress: (progress) => {
        const percentage = ((progress.filesUploaded / progress.totalFiles) * 100).toFixed(1);
        core.info(
          `  Upload progress: ${progress.filesUploaded}/${progress.totalFiles} files (${percentage}%)`
        );
      },
    });

    if (!result.success && result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map((e) => e.message);
      core.warning(
        `⚠️ Some uploads failed: ${errorMessages.join(", ")}`
      );
    }

    core.info(`✅ Upload completed`);
    core.info(`  - Successful: ${result.files.length} files`);
    core.info(`  - Total size: ${formatBytes(result.metadata.totalSize)}`);
    core.info(`  - Duration: ${formatDuration(result.metadata.duration)}`);

    return {
      success: result.success,
      uploadedFiles: result.files,
      totalSize: result.metadata.totalSize,
      duration: result.metadata.duration,
      errors:
        result.errors && result.errors.length > 0
          ? result.errors.map((e) => e.message)
          : undefined,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    core.error(`❌ Storage upload failed: ${errorMessage}`);
    throw new Error(`Storage upload failed: ${errorMessage}`);
  }
}

/**
 * Map uploaded files back to screenshots with URLs
 */
export function mapStorageUrlsToScreenshots(
  screenshots: RouteScreenshot[],
  uploadedFiles: UploadedFile[]
): RouteScreenshot[] {
  // Create a lookup map: local path -> storage URL
  const urlMap = new Map<string, string>();
  uploadedFiles.forEach((file) => {
    urlMap.set(file.localPath, file.url);
  });

  // Map URLs back to screenshots
  return screenshots.map((route) => ({
    ...route,
    screenshots: route.screenshots.map((screenshot) => ({
      ...screenshot,
      storageUrl: urlMap.get(screenshot.path),
    })),
  }));
}

/**
 * Prepare storage configuration from GitHub Action inputs
 * Single source of truth for storage config (DRY)
 */
function prepareStorageConfig(
  provider: "firebase" | "s3",
  prNumber: number
) {
  const configuration = getConfiguration();

  if (provider === "firebase") {
    const firebaseCredentials = configuration.getInput("firebase-credentials");
    const storageBucket = configuration.getInput("storage-bucket");

    if (!firebaseCredentials || !storageBucket) {
      throw new Error(
        "Firebase credentials and storage bucket are required for Firebase storage provider."
      );
    }

    return {
      provider: "firebase" as const,
      config: {
        bucket: storageBucket,
        credentials: firebaseCredentials,
        basePath: `pr-${prNumber}/screenshots`,
      },
    };
  } else if (provider === "s3") {
    const s3Bucket = configuration.getInput("s3-bucket");
    const awsRegion = configuration.getInput("aws-region") || "us-east-1";
    const awsAccessKeyId = configuration.getInput("aws-access-key-id");
    const awsSecretAccessKey = configuration.getInput("aws-secret-access-key");

    if (!s3Bucket) {
      throw new Error("S3 bucket is required for S3 storage provider.");
    }

    return {
      provider: "s3" as const,
      config: {
        bucket: s3Bucket,
        region: awsRegion,
        accessKeyId: awsAccessKeyId || undefined,
        secretAccessKey: awsSecretAccessKey || undefined,
        basePath: `pr-${prNumber}/screenshots`,
        acl: "public-read",
      },
    };
  }

  throw new Error(`Unsupported storage provider: ${provider}`);
}

/**
 * Flatten RouteScreenshot array to file list for upload
 */
function flattenScreenshotsToFiles(screenshots: RouteScreenshot[]) {
  const files: Array<{
    path: string;
    destination?: string;
    contentType: string;
    metadata: Record<string, string>;
  }> = [];

  screenshots.forEach((route) => {
    route.screenshots.forEach((screenshot) => {
      // Sanitize route for path
      const sanitizedRoute = route.route
        .replace(/^\/+|\/+$/g, "")
        .replace(/\//g, "-") || "root";

      files.push({
        path: screenshot.path, // Local file path
        destination: `${sanitizedRoute}/${screenshot.viewport}.png`,
        contentType: "image/png",
        metadata: {
          route: route.route,
          fullUrl: route.fullUrl,
          viewport: screenshot.viewport,
          width: screenshot.width.toString(),
          height: screenshot.height.toString(),
        },
      });
    });
  });

  return files;
}

/**
 * Get total file count from screenshots
 */
function getTotalFileCount(screenshots: RouteScreenshot[]): number {
  return screenshots.reduce(
    (total, route) => total + route.screenshots.length,
    0
  );
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

/**
 * Format duration to human readable
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
