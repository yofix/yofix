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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Storage = void 0;
exports.createS3StorageFromEnv = createS3StorageFromEnv;
const core = __importStar(require("@actions/core"));
const crypto_1 = __importDefault(require("crypto"));
let S3Client;
let PutObjectCommand;
let GetObjectCommand;
let DeleteObjectCommand;
let ListObjectsV2Command;
let HeadObjectCommand;
let getSignedUrl;
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
}
catch (error) {
}
class S3Storage {
    constructor(config) {
        this.urlExpiry = 3600;
        if (!S3Client) {
            throw new Error('AWS SDK is not installed. Please install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner to use S3 storage.');
        }
        this.bucket = config.bucket;
        this.region = config.region || 'us-east-1';
        this.urlExpiry = config.urlExpiry || 3600;
        this.client = new S3Client({
            region: this.region,
            credentials: config.accessKeyId && config.secretAccessKey ? {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            } : undefined
        });
    }
    async initialize() {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: '.yofix'
            });
            await this.client.send(command);
            core.info(`✅ S3 bucket ${this.bucket} is accessible`);
        }
        catch (error) {
            if (error.name === 'NotFound') {
                await this.uploadFile('.yofix', Buffer.from('YoFix Storage'), {
                    contentType: 'text/plain'
                });
            }
            else {
                throw new Error(`S3 initialization failed: ${error.message}`);
            }
        }
    }
    async uploadFile(filePath, content, options) {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
            Body: content,
            ContentType: options?.contentType || 'application/octet-stream',
            Metadata: options?.metadata,
            ACL: 'public-read'
        });
        await this.client.send(command);
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${filePath}`;
    }
    async getSignedUrl(filePath, expiresIn) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filePath
        });
        return await getSignedUrl(this.client, command, {
            expiresIn: expiresIn || this.urlExpiry
        });
    }
    async downloadFile(filePath) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filePath
        });
        const response = await this.client.send(command);
        if (!response.Body) {
            throw new Error(`No content found for ${filePath}`);
        }
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }
    async deleteFile(filePath) {
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: filePath
        });
        await this.client.send(command);
    }
    async listFiles(prefix, maxResults) {
        const command = new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            MaxKeys: maxResults || 1000
        });
        const response = await this.client.send(command);
        return (response.Contents || [])
            .map(obj => obj.Key)
            .filter((key) => key !== undefined);
    }
    async uploadBatch(files) {
        const uploadPromises = files.map(file => this.uploadFile(file.path, file.content, {
            contentType: file.contentType,
            metadata: file.metadata
        }));
        return await Promise.all(uploadPromises);
    }
    generateStorageConsoleUrl() {
        return `https://s3.console.aws.amazon.com/s3/buckets/${this.bucket}`;
    }
    async cleanupOldArtifacts(daysToKeep) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        try {
            const objects = await this.listFiles('screenshots/');
            for (const key of objects) {
                if (!key)
                    continue;
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
                }
                catch (error) {
                    core.warning(`Failed to check artifact ${key}: ${error.message}`);
                }
            }
        }
        catch (error) {
            core.warning(`Cleanup failed: ${error.message}`);
        }
    }
    calculateFingerprint(buffer) {
        return crypto_1.default
            .createHash('sha256')
            .update(buffer)
            .digest('hex');
    }
    async getStorageStats() {
        const objects = await this.listFiles('');
        let totalSize = 0;
        let oldestFile;
        let newestFile;
        for (const key of objects) {
            if (!key)
                continue;
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
            }
            catch (error) {
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
exports.S3Storage = S3Storage;
function createS3StorageFromEnv() {
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
