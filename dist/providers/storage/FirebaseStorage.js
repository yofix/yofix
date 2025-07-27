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
exports.FirebaseStorage = void 0;
const admin = __importStar(require("firebase-admin"));
const core = __importStar(require("@actions/core"));
class FirebaseStorage {
    constructor(config) {
        this.app = null;
        this.bucket = null;
        const serviceAccount = config || this.getServiceAccountFromEnv();
        if (serviceAccount) {
            try {
                this.app = admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    storageBucket: serviceAccount.project_id ? `${serviceAccount.project_id}.appspot.com` : undefined
                }, `yofix-${Date.now()}`);
                this.bucketName = this.app.options.storageBucket || '';
            }
            catch (error) {
                core.warning(`Failed to initialize Firebase: ${error.message}`);
            }
        }
    }
    async initialize() {
        if (!this.app) {
            throw new Error('Firebase not initialized');
        }
        this.bucket = admin.storage(this.app).bucket();
        try {
            await this.bucket.exists();
            core.info('✅ Firebase Storage connected');
        }
        catch (error) {
            throw new Error(`Failed to connect to Firebase Storage: ${error.message}`);
        }
    }
    async uploadFile(path, buffer, metadata) {
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
        const file = this.bucket.file(path);
        await file.delete({ ignoreNotFound: true });
    }
    async exists(path) {
        if (!this.bucket) {
            throw new Error('Storage not initialized');
        }
        const file = this.bucket.file(path);
        const [exists] = await file.exists();
        return exists;
    }
    async listFiles(prefix) {
        if (!this.bucket) {
            throw new Error('Storage not initialized');
        }
        const [files] = await this.bucket.getFiles({ prefix });
        return files.map(file => file.name);
    }
    getServiceAccountFromEnv() {
        const base64Creds = process.env.FIREBASE_SERVICE_ACCOUNT ||
            process.env.FE_FIREBASE_SERVICE_ACCOUNT_ARBOREAL_VISION_339901 ||
            core.getInput('firebase-service-account');
        if (!base64Creds) {
            return null;
        }
        try {
            const decoded = Buffer.from(base64Creds, 'base64').toString('utf-8');
            return JSON.parse(decoded);
        }
        catch (error) {
            core.warning(`Failed to parse Firebase credentials: ${error.message}`);
            return null;
        }
    }
    async downloadFile(path) {
        if (!this.bucket) {
            throw new Error('Storage not initialized');
        }
        const file = this.bucket.file(path);
        const [buffer] = await file.download();
        return buffer;
    }
    async uploadBatch(files) {
        const uploadPromises = files.map(file => this.uploadFile(file.path, file.content, {
            contentType: file.contentType,
            metadata: file.metadata
        }));
        return await Promise.all(uploadPromises);
    }
    generateStorageConsoleUrl() {
        const projectId = this.app?.options.projectId;
        if (!projectId) {
            return 'https://console.firebase.google.com/storage';
        }
        return `https://console.firebase.google.com/project/${projectId}/storage/${this.bucketName}/files`;
    }
    async cleanupOldArtifacts(daysToKeep) {
        if (!this.bucket) {
            throw new Error('Storage not initialized');
        }
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const [files] = await this.bucket.getFiles();
        for (const file of files) {
            const [metadata] = await file.getMetadata();
            const createdAt = new Date(metadata.timeCreated);
            if (createdAt < cutoffDate) {
                await file.delete();
                core.info(`Deleted old artifact: ${file.name}`);
            }
        }
    }
    async cleanup() {
        if (this.app) {
            await this.app.delete();
            this.app = null;
            this.bucket = null;
        }
    }
}
exports.FirebaseStorage = FirebaseStorage;
