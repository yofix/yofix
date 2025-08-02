/**
 * Default configuration for YoFix
 * All configuration variables should be defined here with sensible defaults
 */

export interface YoFixConfig {
  // AI Model Configuration
  ai: {
    claude: {
      defaultModel: string;
      models: {
        analysis: string;
        navigation: string;
        fixing: string;
        screenshot: string;
        contextual: string;
      };
      maxTokens: {
        default: number;
        analysis: number;
        fixing: number;
        navigation: number;
      };
      temperature?: number;
    };
  };

  // Browser Automation Configuration
  browser: {
    defaultTimeout: number;
    navigationTimeout: number;
    headless: boolean;
    slowMo: number;
    viewport: {
      width: number;
      height: number;
    };
  };

  // Storage Configuration
  storage: {
    providers: {
      firebase: {
        projectIdEnv: string;
        clientEmailEnv: string;
        privateKeyEnv: string;
        storageBucketEnv: string;
      };
      s3: {
        accessKeyIdEnv: string;
        secretAccessKeyEnv: string;
        regionEnv: string;
        bucketEnv: string;
      };
    };
    defaultProvider: 'firebase' | 's3';
  };

  // GitHub Integration
  github: {
    defaultBranch: string;
    prCommentPrefix: string;
    checkRunName: string;
  };

  // Testing Configuration
  testing: {
    screenshotQuality: number;
    defaultWaitTime: number;
    retryAttempts: number;
    retryDelay: number;
  };

  // Authentication Configuration
  auth: {
    defaultMode: 'selectors' | 'ai';
    aiAuthMaxAttempts: number;
    selectorTimeout: number;
  };

  // Logging Configuration
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    includeTimestamp: boolean;
  };
}

export const defaultConfig: YoFixConfig = {
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

// Action.yml default values for reference
export const actionDefaults = {
  'storage-provider': 'firebase',
  'aws-region': 'us-east-1',
  'cache-ttl': '3600',
  'mcp-provider': 'built-in',
  'mcp-options': '{}',
  'build-system': '',
  'test-timeout': '5m',
  'cleanup-days': '30',
  'viewports': '1920x1080,768x1024,375x667',
  'max-routes': '10',
  'auth-login-url': '/login/password',
  'auth-mode': 'llm',
  'enable-smart-auth': 'false',
  'enable-ai-navigation': 'false',
  'enable-ai-test-generation': 'false',
  'test-routes': '',
  'clear-cache': 'false'
};