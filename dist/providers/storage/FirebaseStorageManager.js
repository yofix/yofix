"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseStorageManager = void 0;
const core = __importStar(require("@actions/core"));
const app_1 = require("firebase-admin/app");
const storage_1 = require("firebase-admin/storage");
const fs_1 = require("fs");
const FirebaseErrorHandler_1 = require("../firebase/FirebaseErrorHandler");
class FirebaseStorageManager {
    constructor(firebaseConfig, storageConfig, serviceAccountBase64) {
        this.firebaseConfig = firebaseConfig;
        this.config = storageConfig;
        this.prNumber = this.extractPRNumber(firebaseConfig.previewUrl);
        this.initializeFirebase(serviceAccountBase64);
    }
    initializeFirebase(serviceAccountBase64) {
        FirebaseErrorHandler_1.FirebaseErrorHandler.validateFirebaseConfig({
            projectId: this.firebaseConfig.projectId,
            serviceAccount: serviceAccountBase64,
            storageBucket: this.config.bucket
        });
        try {
            core.info('Initializing Firebase Admin SDK for storage...');
            const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
            const serviceAccount = JSON.parse(serviceAccountJson);
            const existingApps = (0, app_1.getApps)();
            if (existingApps.length === 0) {
                (0, app_1.initializeApp)({
                    credential: (0, app_1.cert)(serviceAccount),
                    storageBucket: this.config.bucket
                });
            }
            const storage = (0, storage_1.getStorage)();
            this.bucket = storage.bucket();
            core.info(`Firebase Storage initialized for bucket: ${this.config.bucket}`);
        }
        catch (error) {
            FirebaseErrorHandler_1.FirebaseErrorHandler.handleError(error, 'Firebase Storage initialization');
        }
    }
    extractPRNumber(previewUrl) {
        const match = previewUrl.match(/--pr-(\d+)-/);
        return match ? parseInt(match[1], 10) : Date.now();
    }
    generateStoragePath(type, filename) {
        const timestamp = new Date().toISOString().split('T')[0];
        return `${this.config.basePath}/PR-${this.prNumber}/${timestamp}/${type}/${filename}`;
    }
    async uploadScreenshots(screenshots) {
        core.info(`Uploading ${screenshots.length} screenshots to Firebase Storage...`);
        const uploadedScreenshots = [];
        for (const screenshot of screenshots) {
            try {
                const uploadedScreenshot = await FirebaseErrorHandler_1.FirebaseErrorHandler.withErrorHandling(async () => {
                    const storagePath = this.generateStoragePath('screenshots', screenshot.name);
                    const file = this.bucket.file(storagePath);
                    await file.save(await fs_1.promises.readFile(screenshot.path), {
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
                    const [signedUrl] = await file.getSignedUrl({
                        action: 'read',
                        expires: Date.now() + this.config.signedUrlExpiry
                    });
                    return {
                        ...screenshot,
                        firebaseUrl: signedUrl
                    };
                }, `screenshot upload (${screenshot.name})`, true);
                uploadedScreenshots.push(uploadedScreenshot);
                core.info(`Uploaded screenshot: ${screenshot.name}`);
            }
            catch (error) {
                core.warning(`Failed to upload screenshot ${screenshot.name}, continuing without Firebase URL`);
                uploadedScreenshots.push(screenshot);
            }
        }
        return uploadedScreenshots;
    }
    async uploadVideos(videos) {
        if (videos.length === 0) {
            return videos;
        }
        core.info(`Uploading ${videos.length} videos to Firebase Storage...`);
        const uploadedVideos = [];
        for (const video of videos) {
            try {
                const videoExists = await fs_1.promises.access(video.path).then(() => true).catch(() => false);
                if (!videoExists) {
                    core.warning(`Video file not found: ${video.path}`);
                    uploadedVideos.push(video);
                    continue;
                }
                const videoStats = await fs_1.promises.stat(video.path);
                if (videoStats.size === 0) {
                    core.warning(`Video file is empty: ${video.path}`);
                    uploadedVideos.push(video);
                    continue;
                }
                core.info(`Uploading video: ${video.name} (${videoStats.size} bytes)`);
                const storagePath = this.generateStoragePath('videos', video.name);
                const file = this.bucket.file(storagePath);
                const videoContent = await fs_1.promises.readFile(video.path);
                const contentType = video.name.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
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
                    resumable: false
                });
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + this.config.signedUrlExpiry
                });
                uploadedVideos.push({
                    ...video,
                    firebaseUrl: signedUrl
                });
                core.info(`Uploaded video: ${video.name}`);
            }
            catch (error) {
                core.error(`Failed to upload video ${video.name}: ${error}`);
                uploadedVideos.push(video);
            }
        }
        return uploadedVideos;
    }
    async uploadSummary(screenshots, videos, testResults) {
        try {
            core.info('Creating and uploading test summary...');
            const summary = {
                prNumber: this.prNumber,
                timestamp: new Date().toISOString(),
                firebaseConfig: this.firebaseConfig,
                testResults: {
                    totalTests: testResults.length,
                    passedTests: testResults.filter((r) => r.status === 'passed').length,
                    failedTests: testResults.filter((r) => r.status === 'failed').length,
                    skippedTests: testResults.filter((r) => r.status === 'skipped').length
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
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + this.config.signedUrlExpiry
            });
            core.info('Test summary uploaded successfully');
            return signedUrl;
        }
        catch (error) {
            core.error(`Failed to upload test summary: ${error}`);
            return null;
        }
    }
    generateStorageConsoleUrl() {
        const basePath = `PR-${this.prNumber}`;
        return `https://console.firebase.google.com/project/${this.firebaseConfig.projectId}/storage/${this.config.bucket}/files/${basePath}`;
    }
    async cleanupOldArtifacts(maxAgeInDays) {
        try {
            core.info(`Cleaning up artifacts older than ${maxAgeInDays} days...`);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - maxAgeInDays);
            const [files] = await this.bucket.getFiles({
                prefix: this.config.basePath,
                maxResults: 1000
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
                }
                catch (error) {
                    core.warning(`Failed to process file ${file.name} during cleanup: ${error}`);
                }
            }
            if (deletedCount > 0) {
                core.info(`Cleaned up ${deletedCount} old files`);
            }
            else {
                core.info('No old files found for cleanup');
            }
        }
        catch (error) {
            core.warning(`Cleanup process failed: ${error}`);
        }
    }
    getPublicUrl(storagePath) {
        return `https://storage.googleapis.com/${this.config.bucket}/${storagePath}`;
    }
    static createDefaultConfig(bucketName) {
        return {
            bucket: bucketName,
            basePath: 'yofix',
            signedUrlExpiry: 24 * 60 * 60 * 1000
        };
    }
    async batchUpload(files) {
        const uploadPromises = files.map(async (file, index) => {
            try {
                const storageFile = this.bucket.file(file.remotePath);
                await storageFile.save(await fs_1.promises.readFile(file.localPath), {
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
            }
            catch (error) {
                core.error(`Batch upload failed for ${file.remotePath}: ${error}`);
                throw error;
            }
        });
        return Promise.all(uploadPromises);
    }
}
exports.FirebaseStorageManager = FirebaseStorageManager;
