"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Storage = void 0;
exports.createS3StorageFromEnv = createS3StorageFromEnv;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const core_1 = require("../../core");
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
        this.logger = (0, core_1.createModuleLogger)({
            module: 'S3Storage',
            defaultCategory: core_1.ErrorCategory.STORAGE
        });
        this.circuitBreaker = core_1.CircuitBreakerFactory.getBreaker({
            serviceName: 'S3Storage',
            failureThreshold: 3,
            resetTimeout: 60000,
            timeout: 30000,
            isFailure: (error) => {
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
        if (!S3Client) {
            const error = new Error('AWS SDK is not installed. Please install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner to use S3 storage.');
            this.logger.error(error, {
                severity: core_1.ErrorSeverity.CRITICAL,
                userAction: 'Initialize S3 storage'
            });
            throw error;
        }
        this.bucket = config.bucket;
        this.region = config.region || process.env.AWS_REGION || 'us-east-1';
        this.urlExpiry = config.urlExpiry || 3600;
        const clientConfig = {
            region: this.region,
        };
        if (config.accessKeyId && config.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            };
        }
        this.client = new S3Client(clientConfig);
        this.logger.info(`S3 Storage initialized for bucket: ${this.bucket} in region: ${this.region}`);
    }
    async initialize() {
        const result = await (0, core_1.executeOperation)(() => this.circuitBreaker.execute(async () => {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: '.yofix-test'
            });
            try {
                await this.client.send(command);
            }
            catch (error) {
                if (error.name !== 'NotFound') {
                    throw error;
                }
            }
        }), {
            name: 'Test S3 bucket access',
            category: core_1.ErrorCategory.STORAGE,
            severity: core_1.ErrorSeverity.HIGH
        });
        if (result.success) {
            this.logger.info('✅ S3 Storage connected');
        }
        else {
            throw new Error(`Failed to connect to S3: ${result.error}`);
        }
    }
    async uploadFile(key, buffer, metadata) {
        const uploadParams = {
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: metadata?.contentType || 'application/octet-stream',
        };
        if (metadata?.metadata) {
            uploadParams.Metadata = metadata.metadata;
        }
        if (key.includes('screenshot') || key.includes('.png') || key.includes('.jpg')) {
            uploadParams.ACL = 'public-read';
        }
        await (0, core_1.retryOperation)(() => this.client.send(new PutObjectCommand(uploadParams)), {
            maxAttempts: 3,
            delayMs: 1000,
            backoff: true,
            onRetry: (attempt, error) => {
                this.logger.debug(`Upload retry attempt ${attempt} for ${key}: ${error.message}`);
            }
        });
        return this.getPublicUrl(key);
    }
    async getSignedUrl(key, expiresIn) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key
        });
        const url = await getSignedUrl(this.client, command, {
            expiresIn: expiresIn || this.urlExpiry
        });
        return url;
    }
    async deleteFile(key) {
        const result = await (0, core_1.executeOperation)(async () => {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key
            });
            await this.client.send(command);
        }, {
            name: `Delete file ${key}`,
            category: core_1.ErrorCategory.STORAGE,
            severity: core_1.ErrorSeverity.LOW,
            metadata: { key }
        });
        if (!result.success) {
            this.logger.warn(`Failed to delete file ${key}: ${result.error}`);
        }
    }
    async exists(key) {
        const result = await (0, core_1.executeOperation)(async () => {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key
            });
            try {
                await this.client.send(command);
                return true;
            }
            catch (error) {
                if (error.name === 'NotFound') {
                    return false;
                }
                throw error;
            }
        }, {
            name: `Check file exists ${key}`,
            category: core_1.ErrorCategory.STORAGE,
            severity: core_1.ErrorSeverity.LOW,
            fallback: false
        });
        return result.data ?? false;
    }
    async downloadFile(key) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key
        });
        const response = await this.client.send(command);
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }
    async listFiles(prefix) {
        const result = await (0, core_1.executeOperation)(async () => {
            const command = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: prefix
            });
            const response = await this.client.send(command);
            const files = response.Contents || [];
            return files.map((file) => file.Key).filter(Boolean);
        }, {
            name: `List files with prefix ${prefix}`,
            category: core_1.ErrorCategory.STORAGE,
            severity: core_1.ErrorSeverity.LOW,
            fallback: []
        });
        return result.data ?? [];
    }
    getPublicUrl(key) {
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }
    generateKey(filename, prefix) {
        const timestamp = Date.now();
        const hash = crypto_1.default.createHash('sha256')
            .update(`${filename}-${timestamp}`)
            .digest('hex')
            .substring(0, 8);
        const ext = path_1.default.extname(filename);
        const base = path_1.default.basename(filename, ext);
        const uniqueName = `${base}-${hash}${ext}`;
        return prefix ? `${prefix}/${uniqueName}` : uniqueName;
    }
    async uploadBatch(files) {
        const uploadPromises = files.map(file => this.uploadFile(file.path, file.content, {
            contentType: file.contentType,
            metadata: file.metadata
        }));
        return Promise.all(uploadPromises);
    }
    generateStorageConsoleUrl() {
        return `https://s3.console.aws.amazon.com/s3/buckets/${this.bucket}?region=${this.region}&tab=objects`;
    }
    async cleanupOldArtifacts(daysToKeep) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const result = await (0, core_1.executeOperation)(async () => {
            const listParams = {
                Bucket: this.bucket,
                MaxKeys: 1000
            };
            const listResult = await this.client.send(new ListObjectsV2Command(listParams));
            const deleteObjects = [];
            if (listResult.Contents) {
                for (const obj of listResult.Contents) {
                    if (obj.LastModified && new Date(obj.LastModified) < cutoffDate) {
                        deleteObjects.push({ Key: obj.Key });
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
                for (const obj of deleteObjects) {
                    await this.client.send(new DeleteObjectCommand({
                        Bucket: this.bucket,
                        Key: obj.Key
                    }));
                }
                this.logger.info(`Cleaned up ${deleteObjects.length} old artifacts`);
            }
        }, {
            name: 'Cleanup old artifacts',
            category: core_1.ErrorCategory.STORAGE,
            severity: core_1.ErrorSeverity.LOW,
            fallback: undefined
        });
    }
    async cleanup() {
        this.logger.info('S3 Storage cleaned up');
    }
    getStats() {
        return this.circuitBreaker.getStats();
    }
}
exports.S3Storage = S3Storage;
__decorate([
    (0, core_1.WithCircuitBreaker)({
        failureThreshold: 3,
        resetTimeout: 30000,
        timeout: 60000
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Buffer, Object]),
    __metadata("design:returntype", Promise)
], S3Storage.prototype, "uploadFile", null);
__decorate([
    (0, core_1.WithCircuitBreaker)({
        failureThreshold: 5,
        resetTimeout: 30000
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], S3Storage.prototype, "getSignedUrl", null);
__decorate([
    (0, core_1.WithCircuitBreaker)({
        failureThreshold: 3,
        timeout: 120000
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], S3Storage.prototype, "downloadFile", null);
function createS3StorageFromEnv() {
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
