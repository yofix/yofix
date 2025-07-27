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
exports.StorageFactory = void 0;
const core = __importStar(require("@actions/core"));
const FirebaseStorage_1 = require("./FirebaseStorage");
const S3Storage_1 = require("./S3Storage");
class StorageFactory {
    static async create(config) {
        let provider;
        switch (config.provider) {
            case 'firebase':
                if (!config.firebase) {
                    throw new Error('Firebase configuration required for firebase provider');
                }
                provider = new FirebaseStorage_1.FirebaseStorage({
                    credentials: config.firebase.credentials,
                    bucket: config.firebase.bucket,
                    projectId: config.firebase.projectId
                });
                break;
            case 's3':
                if (!config.s3) {
                    throw new Error('S3 configuration required for s3 provider');
                }
                provider = new S3Storage_1.S3Storage(config.s3);
                break;
            case 'auto':
                provider = await this.autoDetect(config);
                break;
            default:
                throw new Error(`Unknown storage provider: ${config.provider}`);
        }
        await provider.initialize();
        core.info(`✅ Storage provider initialized: ${config.provider}`);
        return provider;
    }
    static async autoDetect(config) {
        if (config.firebase || process.env.FIREBASE_CREDENTIALS) {
            core.info('Auto-detected Firebase storage configuration');
            return new FirebaseStorage_1.FirebaseStorage({
                credentials: config.firebase?.credentials || process.env.FIREBASE_CREDENTIALS,
                bucket: config.firebase?.bucket || process.env.FIREBASE_STORAGE_BUCKET,
                projectId: config.firebase?.projectId || process.env.FIREBASE_PROJECT_ID
            });
        }
        const s3Storage = (0, S3Storage_1.createS3StorageFromEnv)();
        if (s3Storage || config.s3) {
            core.info('Auto-detected S3 storage configuration');
            return s3Storage || new S3Storage_1.S3Storage(config.s3);
        }
        throw new Error('No storage configuration found. Please configure either Firebase or S3 storage.');
    }
    static async createFromInputs() {
        const storageProvider = core.getInput('storage-provider') || 'auto';
        const config = {
            provider: storageProvider
        };
        const firebaseCredentials = core.getInput('firebase-credentials');
        const storageBucket = core.getInput('storage-bucket');
        if (firebaseCredentials && storageBucket) {
            config.firebase = {
                credentials: firebaseCredentials,
                bucket: storageBucket,
                projectId: core.getInput('firebase-project-id') || undefined
            };
        }
        const s3Bucket = core.getInput('s3-bucket');
        if (s3Bucket) {
            config.s3 = {
                bucket: s3Bucket,
                region: core.getInput('aws-region') || undefined,
                accessKeyId: core.getInput('aws-access-key-id') || undefined,
                secretAccessKey: core.getInput('aws-secret-access-key') || undefined
            };
        }
        return this.create(config);
    }
    static getProviderInfo(provider) {
        if (provider instanceof FirebaseStorage_1.FirebaseStorage) {
            return 'Firebase Storage';
        }
        else if (provider instanceof S3Storage_1.S3Storage) {
            return 'AWS S3';
        }
        return 'Unknown';
    }
}
exports.StorageFactory = StorageFactory;
