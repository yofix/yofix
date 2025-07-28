import * as core from '@actions/core';
import { FirebaseConfig } from './types';
import { FirebaseConfigDetector } from './FirebaseConfigDetector';

export class FirebaseUrlHandler {
  private static readonly FIREBASE_PREVIEW_REGEX = /^https:\/\/([^-]+)--pr-(\d+)-([^.]+)\.web\.app\/?/;
  private static readonly FIREBASE_MAIN_REGEX = /^https:\/\/([^.]+)\.web\.app\/?/;
  private static readonly FIREBASE_COMBINED_REGEX = /^https:\/\/(.+?)--pr-(\d+)-([^.]+)\.web\.app\/?/; // Handles combined format
  private static readonly MAX_DEPLOYMENT_WAIT_TIME = 10 * 60 * 1000; // 10 minutes
  private static readonly DEPLOYMENT_CHECK_INTERVAL = 30 * 1000; // 30 seconds

  /**
   * Parse Firebase preview URL to extract project ID and target
   */
  static parseFirebaseUrl(previewUrl: string): Partial<FirebaseConfig> {
    core.info(`Parsing Firebase URL: ${previewUrl}`);

    // Try preview URL pattern first (PR deployments)
    const previewMatch = previewUrl.match(this.FIREBASE_PREVIEW_REGEX);
    if (previewMatch) {
      const [, projectId = '', prNumber = '', target = 'default'] = previewMatch;
      core.info(`Detected Firebase preview deployment - Project: ${projectId}, PR: ${prNumber}, Target: ${target}`);
      return {
        projectId,
        target,
        previewUrl
      };
    }

    // Try combined format (e.g., arboreal-vision-339901--pr-3135-k9b9ruug.web.app)
    const combinedMatch = previewUrl.match(this.FIREBASE_COMBINED_REGEX);
    if (combinedMatch) {
      const [, projectId = '', prNumber = '', target = 'default'] = combinedMatch;
      core.info(`Detected Firebase preview deployment (combined format) - Project: ${projectId}, PR: ${prNumber}, Target: ${target}`);
      return {
        projectId,
        target,
        previewUrl
      };
    }

    // Try main deployment pattern
    const mainMatch = previewUrl.match(this.FIREBASE_MAIN_REGEX);
    if (mainMatch) {
      const [, fullProjectId = ''] = mainMatch;
      // Check if it's a combined format without explicit PR pattern
      if (fullProjectId.includes('--pr-')) {
        const parts = fullProjectId.split('--pr-');
        const projectId = parts[0];
        const prPart = parts[1];
        const targetMatch = prPart.match(/(\d+)-(.+)/);
        if (targetMatch) {
          const [, prNumber, target] = targetMatch;
          core.info(`Detected Firebase main deployment with PR info - Project: ${projectId}`);
          return {
            projectId,
            target,
            previewUrl
          };
        }
      }
      
      core.info(`Detected Firebase main deployment - Project: ${fullProjectId}`);
      return {
        projectId: fullProjectId,
        target: 'default',
        previewUrl
      };
    }

    throw new Error(`Invalid Firebase URL format: ${previewUrl}. Expected format: https://project--pr-123-target.web.app`);
  }

  /**
   * Detect build system from Firebase URL response or fallback methods
   */
  static async detectBuildSystem(previewUrl: string): Promise<'vite' | 'react'> {
    try {
      core.info('Detecting build system from Firebase deployment...');
      
      const response = await fetch(previewUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'GitHub-Actions-Runtime-Verification/1.0'
        }
      });

      // Check if deployment is ready
      if (!response.ok) {
        core.warning(`Firebase deployment not yet accessible (${response.status}). Will retry...`);
        return 'react'; // Default fallback
      }

      // Vite typically includes specific headers or meta tags
      // We can also check for common Vite patterns in the HTML
      const htmlResponse = await fetch(previewUrl, {
        headers: {
          'User-Agent': 'GitHub-Actions-Runtime-Verification/1.0'
        }
      });

      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        
        // Check for Vite-specific patterns
        if (html.includes('/@vite/') || 
            html.includes('vite:preload') || 
            html.includes('"type":"module"') ||
            html.includes('/assets/index-') && html.includes('.js')) {
          core.info('Detected Vite build system');
          return 'vite';
        }
      }

      core.info('Detected standard React build system');
      return 'react';
    } catch (error) {
      core.warning(`Failed to detect build system: ${error}. Defaulting to React.`);
      return 'react';
    }
  }

  /**
   * Wait for Firebase deployment to be fully accessible
   */
  static async waitForDeployment(previewUrl: string, timeoutMs: number = this.MAX_DEPLOYMENT_WAIT_TIME): Promise<void> {
    core.info(`Waiting for Firebase deployment to be ready: ${previewUrl}`);
    
    const startTime = Date.now();
    let attempts = 0;
    
    while (Date.now() - startTime < timeoutMs) {
      attempts++;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(previewUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'GitHub-Actions-Runtime-Verification/1.0'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          core.info(`Firebase deployment is ready after ${attempts} attempts (${Date.now() - startTime}ms)`);
          return;
        }

        if (response.status === 404) {
          core.info(`Deployment not found (404) - attempt ${attempts}. Firebase may still be deploying...`);
        } else {
          core.info(`Deployment returned status ${response.status} - attempt ${attempts}`);
        }
      } catch (error) {
        core.info(`Deployment check failed - attempt ${attempts}: ${error}`);
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, this.DEPLOYMENT_CHECK_INTERVAL));
    }

    throw new Error(`Firebase deployment did not become accessible within ${timeoutMs / 1000} seconds. Last URL checked: ${previewUrl}`);
  }

  /**
   * Verify React SPA is properly loaded and hydrated
   */
  static async verifyReactSPA(previewUrl: string): Promise<void> {
    core.info('Verifying React SPA is properly loaded...');
    
    try {
      const response = await fetch(previewUrl, {
        headers: {
          'User-Agent': 'GitHub-Actions-Runtime-Verification/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch SPA: HTTP ${response.status}`);
      }

      const html = await response.text();
      
      // Check for React root element
      if (!html.includes('id="root"') && !html.includes('id="app"')) {
        core.warning('No React root element found. SPA may not be properly configured.');
      }

      // Check for React Router configuration (common patterns)
      if (html.includes('react-router') || html.includes('Router')) {
        core.info('React Router detected - will test client-side navigation');
      }

      // Check for common React patterns
      if (html.includes('react') || html.includes('React')) {
        core.info('React framework detected in HTML');
      }

      core.info('React SPA verification completed');
    } catch (error) {
      core.warning(`React SPA verification failed: ${error}. Proceeding with testing...`);
    }
  }

  /**
   * Create complete Firebase configuration from URL and inputs with enhanced detection
   */
  static async createFirebaseConfig(
    previewUrl: string,
    githubToken: string,
    projectIdOverride?: string,
    targetOverride?: string,
    buildSystemOverride?: 'vite' | 'react'
  ): Promise<FirebaseConfig> {
    // Wait for deployment to be ready first
    await this.waitForDeployment(previewUrl);
    
    let config: FirebaseConfig;

    if (buildSystemOverride && projectIdOverride && targetOverride) {
      // All parameters provided, use them directly
      config = {
        projectId: projectIdOverride,
        target: targetOverride,
        buildSystem: buildSystemOverride,
        previewUrl,
        region: 'us-central1'
      };
    } else {
      // Use enhanced detection
      const detector = new FirebaseConfigDetector(githubToken);
      
      try {
        const detectedConfig = await detector.detectFirebaseConfiguration(previewUrl);
        
        config = {
          projectId: projectIdOverride || detectedConfig.projectId,
          target: targetOverride || detectedConfig.target,
          buildSystem: buildSystemOverride || detectedConfig.buildSystem,
          previewUrl,
          region: 'us-central1'
        };

        // Log additional information
        if (detectedConfig.hasMultipleTargets) {
          core.info(`Multiple Firebase targets detected: ${detectedConfig.availableTargets.join(', ')}`);
        }
      } catch (error) {
        core.warning(`Enhanced detection failed: ${error}. Falling back to URL parsing.`);
        
        // Fallback to original URL parsing
        const urlInfo = this.parseFirebaseUrl(previewUrl);
        const buildSystem = buildSystemOverride || await this.detectBuildSystem(previewUrl);
        
        config = {
          projectId: projectIdOverride || urlInfo.projectId || 'unknown',
          target: targetOverride || urlInfo.target || 'default',
          buildSystem,
          previewUrl,
          region: 'us-central1'
        };
      }
    }
    
    // Verify React SPA
    await this.verifyReactSPA(previewUrl);
    
    core.info(`Firebase configuration created: ${JSON.stringify(config, null, 2)}`);
    
    return config;
  }
}