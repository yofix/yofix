/**
 * Default configuration for YoFix
 * All configuration variables should be defined here with sensible defaults
 * Automatically loads .env.local files for enhanced development experience
 */

import { loadEnvironmentConfig, initializeEnvironment } from './env-loader';

// Initialize environment from .env.local on import
// This ensures .env.local variables are available throughout the application
initializeEnvironment();

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
        signedUrlExpiryHours: number;
      };
      s3: {
        accessKeyIdEnv: string;
        secretAccessKeyEnv: string;
        regionEnv: string;
        bucketEnv: string;
        signedUrlExpiryHours: number;
      };
    };
    defaultProvider: 'firebase' | 's3';
    basePath: string;
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
    sessionMode: 'sharedAgent' | 'independentAgent';
  };
  
  // Engine Mode Configuration
  engine: {
    mode: 'deterministic' | 'assisted';
    deterministicOptions: {
      pixelDiffThreshold: number; // Percentage threshold for visual differences
      enableBaselines: boolean;
      baselineUpdateStrategy: 'manual' | 'auto';
    };
    assistedOptions: {
      enableVisualAnalysis: boolean;
      enableSmartNavigation: boolean;
      enableFixGeneration: boolean;
    };
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

/**
 * Environment-independent default values
 * These provide sensible defaults when no environment variables are set
 */
export const environmentDefaults = {
  // GitHub Configuration (no real tokens, safe for testing)
  github: {
    token: 'mock-github-token',
    repository: 'test-owner/test-repo',
    sha: 'mock-sha-123456',
    actor: 'yofix-bot',
    eventName: 'pull_request',
    actions: 'false' // Not in GitHub Actions by default
  },
  
  // Storage Configuration (mock/test values)
  storage: {
    firebase: {
      projectId: 'yofix-test-project',
      clientEmail: 'test@yofix-test-project.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY_FOR_TESTING\n-----END PRIVATE KEY-----\n',
      storageBucket: 'yofix-test-project.appspot.com'
    },
    s3: {
      accessKeyId: 'MOCK_ACCESS_KEY_ID',
      secretAccessKey: 'mock-secret-access-key',
      region: 'us-east-1',
      bucket: 'yofix-test-bucket'
    }
  },
  
  // AI Configuration
  ai: {
    claudeApiKey: 'mock-claude-api-key',
    anthropicApiKey: 'mock-anthropic-api-key'
  },
  
  // Environment
  nodeEnv: 'development'
};

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
        storageBucketEnv: 'FIREBASE_STORAGE_BUCKET',
        signedUrlExpiryHours: 24
      },
      s3: {
        accessKeyIdEnv: 'AWS_ACCESS_KEY_ID',
        secretAccessKeyEnv: 'AWS_SECRET_ACCESS_KEY',
        regionEnv: 'AWS_REGION',
        bucketEnv: 'S3_BUCKET',
        signedUrlExpiryHours: 24
      }
    },
    defaultProvider: 'firebase',
    basePath: 'yofix'
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
    retryDelay: 1000,
    sessionMode: 'sharedAgent'
  },
  engine: {
    mode: 'deterministic', // Default to deterministic for speed and reliability
    deterministicOptions: {
      pixelDiffThreshold: 0.1, // 0.1% difference threshold
      enableBaselines: true,
      baselineUpdateStrategy: 'manual'
    },
    assistedOptions: {
      enableVisualAnalysis: false,
      enableSmartNavigation: false,
      enableFixGeneration: true
    }
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

/**
 * Get environment variable with .env.local support and smart defaults
 * Priority: process.env > .env.local > environmentDefaults
 */
export function getEnvWithDefaults(key: string): string | undefined {
  // Load merged environment config (process.env + .env.local)
  const envConfig = loadEnvironmentConfig();
  
  // First check merged environment (process.env + .env.local)
  if (envConfig[key] !== undefined) {
    return envConfig[key];
  }
  
  // Then check environment defaults
  return getEnvironmentDefault(key);
}

/**
 * Get default values for common environment variables
 */
function getEnvironmentDefault(key: string): string | undefined {
  // GitHub-related defaults
  if (key === 'GITHUB_TOKEN' || key === 'INPUT_GITHUB_TOKEN') {
    return environmentDefaults.github.token;
  }
  if (key === 'GITHUB_REPOSITORY') {
    return environmentDefaults.github.repository;
  }
  if (key === 'GITHUB_SHA') {
    return environmentDefaults.github.sha;
  }
  if (key === 'GITHUB_ACTOR') {
    return environmentDefaults.github.actor;
  }
  if (key === 'GITHUB_EVENT_NAME') {
    return environmentDefaults.github.eventName;
  }
  if (key === 'GITHUB_ACTIONS') {
    return environmentDefaults.github.actions;
  }
  
  // AI API keys
  if (key === 'CLAUDE_API_KEY' || key === 'ANTHROPIC_API_KEY') {
    return environmentDefaults.ai.claudeApiKey;
  }
  
  // Firebase defaults
  if (key === 'FIREBASE_PROJECT_ID') {
    return environmentDefaults.storage.firebase.projectId;
  }
  if (key === 'FIREBASE_CLIENT_EMAIL') {
    return environmentDefaults.storage.firebase.clientEmail;
  }
  if (key === 'FIREBASE_PRIVATE_KEY') {
    return environmentDefaults.storage.firebase.privateKey;
  }
  if (key === 'FIREBASE_STORAGE_BUCKET') {
    return environmentDefaults.storage.firebase.storageBucket;
  }
  
  // AWS S3 defaults
  if (key === 'AWS_ACCESS_KEY_ID') {
    return environmentDefaults.storage.s3.accessKeyId;
  }
  if (key === 'AWS_SECRET_ACCESS_KEY') {
    return environmentDefaults.storage.s3.secretAccessKey;
  }
  if (key === 'AWS_REGION') {
    return environmentDefaults.storage.s3.region;
  }
  if (key === 'S3_BUCKET') {
    return environmentDefaults.storage.s3.bucket;
  }
  
  // Node environment
  if (key === 'NODE_ENV') {
    return environmentDefaults.nodeEnv;
  }
  
  return undefined;
}

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
  'session-mode': 'sharedAgent',
  'clear-cache': 'false',
  'engine-mode': 'deterministic',
  'enable-llm-visual-analysis': 'false'
};