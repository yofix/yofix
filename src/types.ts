export interface FirebaseConfig {
  projectId: string;
  target: string;
  buildSystem: 'vite' | 'react';
  previewUrl: string;
  region?: string;
}

export interface RouteAnalysisResult {
  hasUIChanges: boolean;
  changedPaths: string[];
  components: string[];
  routes: string[];
  testSuggestions: string[];
  riskLevel: 'low' | 'medium' | 'high';
  platformInfo?: {
    framework: string;
    buildTool: string;
  };
}

export interface TestTemplate {
  id: string;
  name: string;
  type: 'component' | 'route' | 'interaction' | 'form';
  selector: string;
  actions: TestAction[];
  assertions: TestAssertion[];
  viewport?: Viewport;
}

export interface TestAction {
  type: 'goto' | 'click' | 'fill' | 'select' | 'wait' | 'scroll' | 'navigate' | 'hover' | 'type' | 'measure-position';
  target?: string;
  selector?: string;
  value?: string;
  timeout?: number;
  description?: string;
}

export interface TestAssertion {
  type: 'visible' | 'hidden' | 'text' | 'url' | 'attribute' | 'no-overlap' | 'position-stable' | 'text-contained' | 'contrast-ratio' | 'visual-snapshot' | 'no-overflow';
  target: string;
  selector?: string;
  expected?: string;
  timeout?: number;
  description?: string;
}

export interface Viewport {
  width: number;
  height: number;
  name: string;
}

export interface TestResult {
  testId: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  screenshots: Screenshot[];
  videos: Video[];
  errors: string[];
  consoleMessages: ConsoleMessage[];
}

export interface Screenshot {
  name: string;
  path: string;
  firebaseUrl?: string;
  viewport: Viewport;
  timestamp: number;
}

export interface Video {
  name: string;
  path: string;
  firebaseUrl?: string;
  duration: number;
  timestamp: number;
}

export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error';
  text: string;
  timestamp: number;
}

export interface VerificationResult {
  status: 'success' | 'failure' | 'partial';
  firebaseConfig: FirebaseConfig;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
  testResults: TestResult[];
  screenshotsUrl: string;
  summary: {
    componentsVerified: string[];
    routesTested: string[];
    issuesFound: string[];
  };
}

export interface ActionInputs {
  previewUrl: string;
  firebaseCredentials: string;
  storageBucket: string;
  githubToken: string;
  claudeApiKey: string;
  firebaseProjectId?: string;
  firebaseTarget?: string;
  buildSystem?: 'vite' | 'react';
  testTimeout: string;
  cleanupDays: string;
  viewports: string;
  maxRoutes: string;
  authEmail?: string;
  authPassword?: string;
  authLoginUrl?: string;
  authMode?: string;
  enableSmartAuth?: boolean;
  mcpProvider?: string;
  mcpOptions?: string;
  enableAINavigation?: boolean;
  enableAITestGeneration?: boolean;
  testRoutes?: string;
}

export interface FirebaseStorageConfig {
  bucket: string;
  basePath: string;
  signedUrlExpiry: number;
}

export interface PRComment {
  id: number;
  user: {
    login: string;
  };
  body: string;
  created_at: string;
  updated_at: string;
}