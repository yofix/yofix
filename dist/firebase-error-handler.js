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
exports.FirebaseErrorHandler = void 0;
const core = __importStar(require("@actions/core"));
class FirebaseErrorHandler {
    static parseFirebaseError(error) {
        const errorString = String(error);
        const errorMessage = error?.message || errorString;
        if (error?.code) {
            return this.handleFirebaseAdminError(error);
        }
        if (errorMessage.includes('storage') || errorMessage.includes('bucket')) {
            return this.handleStorageError(error);
        }
        if (errorMessage.includes('hosting') || errorMessage.includes('deployment')) {
            return this.handleHostingError(error);
        }
        if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('timeout') || errorMessage.includes('network')) {
            return this.handleNetworkError(error);
        }
        if (errorMessage.includes('permission') || errorMessage.includes('unauthorized') || errorMessage.includes('403')) {
            return this.handlePermissionError(error);
        }
        return {
            code: 'UNKNOWN_ERROR',
            message: errorMessage,
            retryable: false,
            userMessage: 'An unexpected error occurred during Firebase operations.'
        };
    }
    static handleFirebaseAdminError(error) {
        const code = error.code;
        const message = error.message;
        switch (code) {
            case 'app/invalid-credential':
                return {
                    code,
                    message,
                    retryable: false,
                    userMessage: 'Invalid Firebase service account credentials. Please check your FIREBASE_SA_BASE64 secret.'
                };
            case 'app/project-not-found':
                return {
                    code,
                    message,
                    retryable: false,
                    userMessage: 'Firebase project not found. Verify the project ID in your service account.'
                };
            case 'storage/bucket-not-found':
                return {
                    code,
                    message,
                    retryable: false,
                    userMessage: 'Firebase Storage bucket not found. Check your storage-bucket configuration.'
                };
            case 'storage/unauthorized':
                return {
                    code,
                    message,
                    retryable: false,
                    userMessage: 'Insufficient permissions for Firebase Storage. Ensure service account has Storage Admin role.'
                };
            case 'storage/retry-limit-exceeded':
                return {
                    code,
                    message,
                    retryable: true,
                    userMessage: 'Firebase Storage operation timed out. This might be a temporary issue.'
                };
            default:
                return {
                    code,
                    message,
                    retryable: code.includes('unavailable') || code.includes('timeout'),
                    userMessage: `Firebase Admin SDK error: ${message}`
                };
        }
    }
    static handleStorageError(error) {
        const message = error.message || String(error);
        if (message.includes('bucket') && message.includes('not found')) {
            return {
                code: 'STORAGE_BUCKET_NOT_FOUND',
                message,
                retryable: false,
                userMessage: 'Firebase Storage bucket does not exist. Verify the bucket name in your configuration.'
            };
        }
        if (message.includes('quota') || message.includes('limit')) {
            return {
                code: 'STORAGE_QUOTA_EXCEEDED',
                message,
                retryable: false,
                userMessage: 'Firebase Storage quota exceeded. Consider increasing your storage limits or cleaning up old files.'
            };
        }
        if (message.includes('network') || message.includes('timeout')) {
            return {
                code: 'STORAGE_NETWORK_ERROR',
                message,
                retryable: true,
                userMessage: 'Network error while uploading to Firebase Storage. This is usually temporary.'
            };
        }
        return {
            code: 'STORAGE_ERROR',
            message,
            retryable: message.includes('temporary') || message.includes('retry'),
            userMessage: 'Firebase Storage operation failed. Check your storage configuration and permissions.'
        };
    }
    static handleHostingError(error) {
        const message = error.message || String(error);
        if (message.includes('deployment') && message.includes('not found')) {
            return {
                code: 'HOSTING_DEPLOYMENT_NOT_FOUND',
                message,
                retryable: true,
                userMessage: 'Firebase Hosting deployment not found. The preview URL might not be ready yet.'
            };
        }
        if (message.includes('timeout') || message.includes('accessible')) {
            return {
                code: 'HOSTING_DEPLOYMENT_TIMEOUT',
                message,
                retryable: true,
                userMessage: 'Firebase Hosting deployment is taking longer than expected. This is usually temporary.'
            };
        }
        return {
            code: 'HOSTING_ERROR',
            message,
            retryable: true,
            userMessage: 'Firebase Hosting error. The deployment might still be in progress.'
        };
    }
    static handleNetworkError(error) {
        const message = error.message || String(error);
        return {
            code: 'NETWORK_ERROR',
            message,
            retryable: true,
            userMessage: 'Network connectivity issue. This is usually temporary and will resolve automatically.'
        };
    }
    static handlePermissionError(error) {
        const message = error.message || String(error);
        if (message.includes('403') || message.includes('forbidden')) {
            return {
                code: 'PERMISSION_DENIED',
                message,
                retryable: false,
                userMessage: 'Permission denied. Verify your Firebase service account has the required roles (Firebase Admin, Storage Admin).'
            };
        }
        if (message.includes('401') || message.includes('unauthorized')) {
            return {
                code: 'AUTHENTICATION_FAILED',
                message,
                retryable: false,
                userMessage: 'Authentication failed. Check your Firebase service account credentials.'
            };
        }
        return {
            code: 'PERMISSION_ERROR',
            message,
            retryable: false,
            userMessage: 'Permission error. Verify your Firebase service account configuration.'
        };
    }
    static async retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                const firebaseError = this.parseFirebaseError(error);
                if (!firebaseError.retryable || attempt === maxRetries) {
                    throw error;
                }
                const delay = baseDelay * Math.pow(2, attempt - 1);
                core.warning(`Firebase operation failed (attempt ${attempt}/${maxRetries}): ${firebaseError.userMessage}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }
    static handleError(error, context) {
        const firebaseError = this.parseFirebaseError(error);
        core.error(`Firebase error in ${context}: ${firebaseError.code} - ${firebaseError.message}`);
        if (firebaseError.details) {
            core.debug(`Error details: ${JSON.stringify(firebaseError.details, null, 2)}`);
        }
        const userMessage = `${context} failed: ${firebaseError.userMessage}`;
        if (firebaseError.retryable) {
            core.warning(`${userMessage} (This error is typically temporary and may resolve on retry)`);
        }
        core.setFailed(userMessage);
        throw new Error(userMessage);
    }
    static validateFirebaseConfig(config) {
        const errors = [];
        if (!config.projectId) {
            errors.push('Firebase project ID is required');
        }
        if (!config.serviceAccount) {
            errors.push('Firebase service account credentials are required');
        }
        else {
            try {
                const decoded = Buffer.from(config.serviceAccount, 'base64').toString('utf-8');
                const serviceAccount = JSON.parse(decoded);
                if (!serviceAccount.project_id) {
                    errors.push('Service account is missing project_id');
                }
                if (!serviceAccount.private_key) {
                    errors.push('Service account is missing private_key');
                }
                if (!serviceAccount.client_email) {
                    errors.push('Service account is missing client_email');
                }
            }
            catch (error) {
                errors.push('Invalid service account format (not valid base64 JSON)');
            }
        }
        if (!config.storageBucket) {
            errors.push('Firebase Storage bucket name is required');
        }
        if (errors.length > 0) {
            const errorMessage = `Firebase configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`;
            core.setFailed(errorMessage);
            throw new Error(errorMessage);
        }
    }
    static async withErrorHandling(operation, context, retryable = true) {
        try {
            if (retryable) {
                return await this.retryOperation(operation);
            }
            else {
                return await operation();
            }
        }
        catch (error) {
            this.handleError(error, context);
        }
    }
}
exports.FirebaseErrorHandler = FirebaseErrorHandler;
