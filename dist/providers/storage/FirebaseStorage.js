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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseStorage = void 0;
const admin = __importStar(require("firebase-admin"));
const core_1 = require("../../core");
class FirebaseStorage {
    constructor(config) {
        this.app = null;
        this.bucket = null;
        this.logger = (0, core_1.createModuleLogger)({
            module: 'FirebaseStorage',
            defaultCategory: core_1.ErrorCategory.STORAGE
        });
        this.circuitBreaker = core_1.CircuitBreakerFactory.getBreaker({
            serviceName: 'FirebaseStorage',
            failureThreshold: 3,
            resetTimeout: 60000,
            timeout: 30000,
            isFailure: (error) => {
                return !error.message.includes('auth') && !error.message.includes('permission');
            },
            fallback: () => {
                this.logger.warn('Firebase Storage circuit breaker activated - using fallback');
                return null;
            }
        });
        const serviceAccount = config || this.getServiceAccountFromEnv();
        if (serviceAccount) {
            (0, core_1.executeOperation)(() => this.initializeApp(serviceAccount), {
                name: 'Initialize Firebase app',
                category: core_1.ErrorCategory.CONFIGURATION,
                severity: core_1.ErrorSeverity.HIGH
            }).then(result => {
                if (!result.success) {
                    this.logger.warn('Failed to initialize Firebase app');
                }
            }).catch(error => {
                this.logger.error(error, {
                    severity: core_1.ErrorSeverity.HIGH,
                    category: core_1.ErrorCategory.CONFIGURATION,
                    userAction: 'Initialize Firebase app'
                });
            });
        }
    }
    async initializeApp(serviceAccount) {
        this.app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: serviceAccount.project_id ? `${serviceAccount.project_id}.appspot.com` : undefined
        }, `yofix-${Date.now()}`);
        this.bucketName = this.app.options.storageBucket || '';
    }
    async initialize() {
        if (!this.app) {
            throw new Error('Firebase not initialized');
        }
        this.bucket = admin.storage(this.app).bucket();
        const result = await (0, core_1.executeOperation)(() => this.circuitBreaker.execute(() => this.bucket.exists()), {
            name: 'Test Firebase Storage connection',
            category: core_1.ErrorCategory.STORAGE,
            severity: core_1.ErrorSeverity.HIGH
        });
        if (result.success) {
            this.logger.info('✅ Firebase Storage connected');
        }
        else {
            throw new Error(`Failed to connect to Firebase Storage: ${result.error}`);
        }
    }
    async uploadFile(path, buffer, metadata) {
        if (!this.bucket) {
            throw new Error('Storage not initialized');
        }
        const file = this.bucket.file(path);
        await (0, core_1.retryOperation)(() => file.save(buffer, {
            metadata: {
                contentType: metadata?.contentType || 'application/octet-stream',
                metadata: metadata?.metadata || {}
            },
            resumable: false
        }), {
            maxAttempts: 3,
            delayMs: 1000,
            backoff: true,
            onRetry: (attempt, error) => {
                this.logger.debug(`Upload retry attempt ${attempt} for ${path}: ${error.message}`);
            }
        });
        await file.makePublic();
        return file.publicUrl();
    }
    async getSignedUrl(path, expiresIn = 3600) {
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
    async deleteFile(path) {
        if (!this.bucket) {
            throw new Error('Storage not initialized');
        }
        const result = await (0, core_1.executeOperation)(async () => {
            const file = this.bucket.file(path);
            await file.delete();
        }, {
            name: `Delete file ${path}`,
            category: core_1.ErrorCategory.STORAGE,
            severity: core_1.ErrorSeverity.LOW,
            metadata: { path }
        });
        if (!result.success) {
            this.logger.warn(`Failed to delete file ${path}: ${result.error}`);
        }
    }
    async exists(path) {
        if (!this.bucket) {
            throw new Error('Storage not initialized');
        }
        const result = await (0, core_1.executeOperation)(async () => {
            const file = this.bucket.file(path);
            const [exists] = await file.exists();
            return exists;
        }, {
            name: `Check file exists ${path}`,
            category: core_1.ErrorCategory.STORAGE,
            severity: core_1.ErrorSeverity.LOW,
            fallback: false
        });
        return result.data ?? false;
    }
    async downloadFile(path) {
        if (!this.bucket) {
            throw new Error('Storage not initialized');
        }
        const file = this.bucket.file(path);
        const [buffer] = await file.download();
        return buffer;
    }
    async listFiles(prefix) {
        if (!this.bucket) {
            throw new Error('Storage not initialized');
        }
        const result = await (0, core_1.executeOperation)(async () => {
            const [files] = await this.bucket.getFiles({ prefix });
            return files.map(file => file.name);
        }, {
            name: `List files with prefix ${prefix}`,
            category: core_1.ErrorCategory.STORAGE,
            severity: core_1.ErrorSeverity.LOW,
            fallback: []
        });
        return result.data ?? [];
    }
    getPublicUrl(path) {
        if (!this.bucketName) {
            throw new Error('Bucket name not configured');
        }
        return `https://storage.googleapis.com/${this.bucketName}/${path}`;
    }
    getServiceAccountFromEnv() {
        try {
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
            if (!projectId || !clientEmail || !privateKey) {
                this.logger.debug('Firebase credentials not found in environment');
                return null;
            }
            return {
                project_id: projectId,
                client_email: clientEmail,
                private_key: privateKey
            };
        }
        catch (error) {
            this.logger.debug('Failed to parse Firebase credentials from environment');
            return null;
        }
    }
    async uploadBatch(files) {
        const uploadPromises = files.map(file => this.uploadFile(file.path, file.content, {
            contentType: file.contentType,
            metadata: file.metadata
        }));
        return Promise.all(uploadPromises);
    }
    generateStorageConsoleUrl() {
        const projectId = this.bucketName.replace('.appspot.com', '');
        return `https://console.firebase.google.com/project/${projectId}/storage/${this.bucketName}/files`;
    }
    async cleanupOldArtifacts(daysToKeep) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const result = await (0, core_1.executeOperation)(async () => {
            const [files] = await this.bucket.getFiles();
            const deletePromises = [];
            for (const file of files) {
                const metadata = file.metadata;
                const created = new Date(metadata.timeCreated);
                if (created < cutoffDate) {
                    deletePromises.push(file.delete().then(() => {
                        this.logger.info(`Deleted old file: ${file.name}`);
                    }));
                }
            }
            await Promise.all(deletePromises);
            this.logger.info(`Cleaned up ${deletePromises.length} old artifacts`);
        }, {
            name: 'Cleanup old artifacts',
            category: core_1.ErrorCategory.STORAGE,
            severity: core_1.ErrorSeverity.LOW,
            fallback: undefined
        });
    }
    async cleanup() {
        if (this.app) {
            await this.app.delete();
            this.app = null;
            this.bucket = null;
            this.logger.info('Firebase app cleaned up');
        }
    }
    getStats() {
        return this.circuitBreaker.getStats();
    }
}
exports.FirebaseStorage = FirebaseStorage;
__decorate([
    (0, core_1.WithCircuitBreaker)({
        failureThreshold: 3,
        resetTimeout: 30000,
        timeout: 60000
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Buffer, Object]),
    __metadata("design:returntype", Promise)
], FirebaseStorage.prototype, "uploadFile", null);
__decorate([
    (0, core_1.WithCircuitBreaker)({
        failureThreshold: 5,
        resetTimeout: 30000
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], FirebaseStorage.prototype, "getSignedUrl", null);
__decorate([
    (0, core_1.WithCircuitBreaker)({
        failureThreshold: 3,
        timeout: 120000
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], FirebaseStorage.prototype, "downloadFile", null);
