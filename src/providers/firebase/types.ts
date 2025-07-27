/**
 * Firebase-specific types
 */

export interface FirebaseConfig {
  projectId: string;
  previewUrl: string;
  target: string;
  region: string;
  buildSystem: 'vite' | 'react';
}

export interface FirebaseDeploymentInfo {
  status: 'ready' | 'deploying' | 'error';
  url: string;
  deployTime?: number;
  error?: string;
}

export interface FirebaseErrorInfo {
  code: string;
  message: string;
  details?: any;
  suggestion?: string;
}