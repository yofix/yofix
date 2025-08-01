"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = void 0;
exports.defaultConfig = {
    ai: {
        claude: {
            defaultModel: 'claude-3-5-sonnet-20241022',
            models: {
                analysis: 'claude-3-5-sonnet-20241022',
                navigation: 'claude-3-5-sonnet-20241022',
                fixing: 'claude-3-5-sonnet-20241022',
                screenshot: 'claude-3-5-sonnet-20241022',
                contextual: 'claude-3-5-sonnet-20241022'
            },
            maxTokens: {
                default: 1024,
                analysis: 2048,
                fixing: 4096,
                navigation: 1024
            },
            temperature: 0.2
        }
    },
    browser: {
        defaultTimeout: 30000,
        navigationTimeout: 60000,
        headless: true,
        slowMo: 0,
        viewport: {
            width: 1920,
            height: 1080
        }
    },
    storage: {
        providers: {
            firebase: {
                projectIdEnv: 'FIREBASE_PROJECT_ID',
                clientEmailEnv: 'FIREBASE_CLIENT_EMAIL',
                privateKeyEnv: 'FIREBASE_PRIVATE_KEY',
                storageBucketEnv: 'FIREBASE_STORAGE_BUCKET'
            },
            s3: {
                accessKeyIdEnv: 'AWS_ACCESS_KEY_ID',
                secretAccessKeyEnv: 'AWS_SECRET_ACCESS_KEY',
                regionEnv: 'AWS_REGION',
                bucketEnv: 'S3_BUCKET'
            }
        },
        defaultProvider: 'firebase'
    },
    github: {
        defaultBranch: 'main',
        prCommentPrefix: '@yofix',
        checkRunName: 'YoFix Visual Testing'
    },
    testing: {
        screenshotQuality: 90,
        defaultWaitTime: 2000,
        retryAttempts: 3,
        retryDelay: 1000
    },
    auth: {
        defaultMode: 'selectors',
        aiAuthMaxAttempts: 3,
        selectorTimeout: 10000
    },
    logging: {
        level: 'info',
        includeTimestamp: true
    }
};
