import * as core from '@actions/core';
import { getOctokit } from '@actions/github';

export interface FirebaseJsonConfig {
  hosting?: Array<{
    target?: string;
    public?: string;
    ignore?: string[];
    rewrites?: Array<{
      source: string;
      destination: string;
    }>;
    headers?: Array<{
      source: string;
      headers: Array<{
        key: string;
        value: string;
      }>;
    }>;
  }>;
}

export class FirebaseConfigDetector {
  private octokit: ReturnType<typeof getOctokit>;

  constructor(githubToken: string) {
    this.octokit = getOctokit(githubToken);
  }

  /**
   * Fetch and parse firebase.json from the repository
   */
  async getFirebaseConfig(): Promise<FirebaseJsonConfig | null> {
    try {
      const context = require('@actions/github').context;
      const { owner, repo } = context.repo;
      const ref = context.payload.pull_request?.head?.sha || context.sha;

      core.info('Fetching firebase.json from repository...');

      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: 'firebase.json',
        ref
      });

      if ('content' in response.data) {
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        const firebaseConfig = JSON.parse(content) as FirebaseJsonConfig;
        
        core.info('Successfully parsed firebase.json');
        return firebaseConfig;
      }

      return null;
    } catch (error) {
      core.warning(`Could not fetch firebase.json: ${error}`);
      return null;
    }
  }

  /**
   * Detect build system from firebase.json hosting configuration
   */
  detectBuildSystemFromConfig(config: FirebaseJsonConfig, targetName?: string): 'vite' | 'react' | null {
    if (!config.hosting) {
      return null;
    }

    // Find the specific target or use the first one
    const hostingConfig = targetName 
      ? config.hosting.find(h => h.target === targetName)
      : config.hosting[0];

    if (!hostingConfig) {
      return null;
    }

    const publicDir = hostingConfig.public;
    
    // Vite typically uses 'dist' as output directory
    if (publicDir === 'dist') {
      core.info('Detected Vite build system from firebase.json (public: "dist")');
      return 'vite';
    }
    
    // Create React App typically uses 'build' as output directory
    if (publicDir === 'build') {
      core.info('Detected React build system from firebase.json (public: "build")');
      return 'react';
    }

    core.info(`Unknown build system from public directory: ${publicDir}`);
    return null;
  }

  /**
   * Get all available Firebase hosting targets
   */
  getAvailableTargets(config: FirebaseJsonConfig): string[] {
    if (!config.hosting) {
      return [];
    }

    return config.hosting
      .map(h => h.target)
      .filter((target): target is string => target !== undefined);
  }

  /**
   * Detect the most likely target based on preview URL
   */
  detectTargetFromUrl(config: FirebaseJsonConfig, previewUrl: string): string | null {
    const targets = this.getAvailableTargets(config);
    
    if (targets.length === 0) {
      return null;
    }

    // Extract target from preview URL pattern: project--pr-123-TARGET.web.app
    const urlMatch = previewUrl.match(/--pr-\d+-([^.]+)\.web\.app/);
    if (urlMatch) {
      const urlTarget = urlMatch[1];
      
      // Check if the URL target matches any configured target
      if (targets.includes(urlTarget)) {
        core.info(`Matched URL target "${urlTarget}" with firebase.json configuration`);
        return urlTarget;
      }
    }

    // If no match, return the first target as default
    core.info(`Using default target "${targets[0]}" from firebase.json`);
    return targets[0];
  }

  /**
   * Enhanced configuration detection combining URL and firebase.json
   */
  async detectFirebaseConfiguration(previewUrl: string): Promise<{
    projectId: string;
    target: string;
    buildSystem: 'vite' | 'react';
    hasMultipleTargets: boolean;
    availableTargets: string[];
  }> {
    // Parse basic info from URL
    const urlMatch = previewUrl.match(/^https:\/\/([^-]+)--pr-(\d+)-([^.]+)\.web\.app/);
    if (!urlMatch) {
      throw new Error(`Invalid Firebase preview URL format: ${previewUrl}`);
    }

    const [, projectId, prNumber, urlTarget] = urlMatch;

    // Try to get firebase.json configuration
    const firebaseConfig = await this.getFirebaseConfig();
    
    let finalTarget = urlTarget;
    let buildSystem: 'vite' | 'react' = 'react'; // Default fallback
    let availableTargets: string[] = [];
    let hasMultipleTargets = false;

    if (firebaseConfig) {
      availableTargets = this.getAvailableTargets(firebaseConfig);
      hasMultipleTargets = availableTargets.length > 1;

      // Validate target exists in configuration
      const detectedTarget = this.detectTargetFromUrl(firebaseConfig, previewUrl);
      if (detectedTarget) {
        finalTarget = detectedTarget;
      }

      // Detect build system from configuration
      const detectedBuildSystem = this.detectBuildSystemFromConfig(firebaseConfig, finalTarget);
      if (detectedBuildSystem) {
        buildSystem = detectedBuildSystem;
      }

      core.info(`Firebase configuration analysis:
        - Available targets: ${availableTargets.join(', ')}
        - Selected target: ${finalTarget}
        - Build system: ${buildSystem}
        - Multiple targets: ${hasMultipleTargets}`);
    } else {
      core.warning('No firebase.json found, using URL-based detection');
      // Fallback to URL-based detection
      if (previewUrl.includes('dist') || urlTarget.includes('app')) {
        buildSystem = 'vite';
      }
    }

    return {
      projectId,
      target: finalTarget,
      buildSystem,
      hasMultipleTargets,
      availableTargets
    };
  }

  /**
   * Get package.json to help with build system detection
   */
  async getPackageJsonInfo(): Promise<{
    hasVite: boolean;
    hasReactScripts: boolean;
    buildScript?: string;
  } | null> {
    try {
      const context = require('@actions/github').context;
      const { owner, repo } = context.repo;
      const ref = context.payload.pull_request?.head?.sha || context.sha;

      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: 'package.json',
        ref
      });

      if ('content' in response.data) {
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        const packageJson = JSON.parse(content);
        
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        return {
          hasVite: 'vite' in dependencies,
          hasReactScripts: 'react-scripts' in dependencies,
          buildScript: packageJson.scripts?.build
        };
      }

      return null;
    } catch (error) {
      core.warning(`Could not fetch package.json: ${error}`);
      return null;
    }
  }

  /**
   * Comprehensive build system detection using multiple sources
   */
  async detectBuildSystemComprehensive(previewUrl: string, targetName?: string): Promise<'vite' | 'react'> {
    core.info('Running comprehensive build system detection...');

    // 1. Check firebase.json
    const firebaseConfig = await this.getFirebaseConfig();
    if (firebaseConfig) {
      const configBasedDetection = this.detectBuildSystemFromConfig(firebaseConfig, targetName);
      if (configBasedDetection) {
        return configBasedDetection;
      }
    }

    // 2. Check package.json
    const packageInfo = await this.getPackageJsonInfo();
    if (packageInfo) {
      if (packageInfo.hasVite) {
        core.info('Detected Vite build system from package.json dependencies');
        return 'vite';
      }
      
      if (packageInfo.hasReactScripts) {
        core.info('Detected React Scripts build system from package.json dependencies');
        return 'react';
      }

      // Check build script
      if (packageInfo.buildScript) {
        if (packageInfo.buildScript.includes('vite')) {
          core.info('Detected Vite build system from build script');
          return 'vite';
        }
      }
    }

    // 3. Fallback to URL analysis
    if (previewUrl.includes('--pr-') && previewUrl.includes('-app.web.app')) {
      core.info('Detected Vite build system from URL pattern (likely loop-frontend)');
      return 'vite';
    }

    core.info('Defaulting to React build system');
    return 'react';
  }
}