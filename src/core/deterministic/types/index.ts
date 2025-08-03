/**
 * Type definitions for the Deterministic Engine
 */

import { Viewport } from '../../../types';

export interface DeterministicTestResult {
  route: string;
  success: boolean;
  screenshots: Buffer[];
  pixelDiffs?: Array<{
    viewport: Viewport;
    diffPercentage: number;
    diffImage?: Buffer;
  }>;
  functionalTests?: {
    workingLinks: number;
    brokenLinks: number;
    forms: number;
    issues: string[];
  };
  error?: string;
  duration?: number;
}

export interface DeterministicEngineConfig {
  mode: 'deterministic' | 'assisted';
  previewUrl: string;
  viewports: Viewport[];
  pixelDiffThreshold?: number;
  enableBaselines?: boolean;
  baselineUpdateStrategy?: 'manual' | 'auto';
}

export interface BaselineComparison {
  route: string;
  viewport: Viewport;
  hasDifferences: boolean;
  diffPercentage: number;
  diffImage?: Buffer;
  baselineExists: boolean;
}

export interface DeterministicScanOptions {
  routes: string[];
  viewports: Viewport[];
  enableFunctionalTests?: boolean;
  enablePixelComparison?: boolean;
  updateBaselines?: boolean;
}

export interface DeterministicIssue {
  type: 'visual-regression' | 'broken-link' | 'console-error' | 'performance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  route: string;
  viewport?: Viewport;
  selector?: string;
  evidence?: Buffer; // Screenshot or diff image
}

export interface DeterministicReport {
  timestamp: number;
  duration: number;
  totalRoutes: number;
  successfulRoutes: number;
  failedRoutes: number;
  issues: DeterministicIssue[];
  routeResults: Map<string, DeterministicTestResult>;
}