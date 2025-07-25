import * as core from '@actions/core';

export interface FirebaseError {
  code: string;
  message: string;
  details?: any;
  retryable: boolean;
  userMessage: string;
}

export class FirebaseErrorHandler {
  /**
   * Parse and categorize Firebase errors for better handling
   */
  static parseFirebaseError(error: any): FirebaseError {
    const errorString = String(error);
    const errorMessage = error?.message || errorString;

    // Firebase Admin SDK errors
    if (error?.code) {
      return this.handleFirebaseAdminError(error);
    }

    // Firebase Storage errors
    if (errorMessage.includes('storage') || errorMessage.includes('bucket')) {
      return this.handleStorageError(error);
    }

    // Firebase Hosting errors
    if (errorMessage.includes('hosting') || errorMessage.includes('deployment')) {
      return this.handleHostingError(error);
    }

    // Network/connectivity errors
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('timeout') || errorMessage.includes('network')) {
      return this.handleNetworkError(error);
    }

    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('unauthorized') || errorMessage.includes('403')) {
      return this.handlePermissionError(error);
    }

    // Default error
    return {
      code: 'UNKNOWN_ERROR',
      message: errorMessage,
      retryable: false,
      userMessage: 'An unexpected error occurred during Firebase operations.'
    };
  }

  /**
   * Handle Firebase Admin SDK specific errors
   */
  private static handleFirebaseAdminError(error: any): FirebaseError {
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

  /**
   * Handle Firebase Storage specific errors
   */
  private static handleStorageError(error: any): FirebaseError {
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

  /**
   * Handle Firebase Hosting specific errors
   */
  private static handleHostingError(error: any): FirebaseError {
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

  /**
   * Handle network connectivity errors
   */
  private static handleNetworkError(error: any): FirebaseError {
    const message = error.message || String(error);

    return {
      code: 'NETWORK_ERROR',
      message,
      retryable: true,
      userMessage: 'Network connectivity issue. This is usually temporary and will resolve automatically.'
    };
  }

  /**
   * Handle permission and authentication errors
   */
  private static handlePermissionError(error: any): FirebaseError {
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

  /**
   * Retry Firebase operations with exponential backoff
   */
  static async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
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

  /**
   * Handle Firebase error with appropriate logging and user messaging
   */
  static handleError(error: any, context: string): never {
    const firebaseError = this.parseFirebaseError(error);
    
    // Log technical details for debugging
    core.error(`Firebase error in ${context}: ${firebaseError.code} - ${firebaseError.message}`);
    
    if (firebaseError.details) {
      core.debug(`Error details: ${JSON.stringify(firebaseError.details, null, 2)}`);
    }

    // Provide user-friendly message
    const userMessage = `${context} failed: ${firebaseError.userMessage}`;
    
    if (firebaseError.retryable) {
      core.warning(`${userMessage} (This error is typically temporary and may resolve on retry)`);
    }

    // Set appropriate failure message
    core.setFailed(userMessage);
    
    // TypeScript never return type
    throw new Error(userMessage);
  }

  /**
   * Validate Firebase configuration before operations
   */
  static validateFirebaseConfig(config: {
    projectId?: string;
    serviceAccount?: string;
    storageBucket?: string;
  }): void {
    const errors: string[] = [];

    if (!config.projectId) {
      errors.push('Firebase project ID is required');
    }

    if (!config.serviceAccount) {
      errors.push('Firebase service account credentials are required');
    } else {
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
      } catch (error) {
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

  /**
   * Create Firebase operation wrapper with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string,
    retryable: boolean = true
  ): Promise<T> {
    try {
      if (retryable) {
        return await this.retryOperation(operation);
      } else {
        return await operation();
      }
    } catch (error) {
      this.handleError(error, context);
    }
  }
}