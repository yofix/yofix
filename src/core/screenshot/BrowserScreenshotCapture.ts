/**
 * Screenshot capture using route-impact-browser
 * This module wraps the @yofix/browser package to provide screenshot functionality
 * Storage operations are handled separately by @storage-manager
 */

import * as core from "@actions/core";
import { captureRouteScreenshots, type RouteScreenshot } from "@yofix/browser";
import { config } from "../index";
import type { Viewport } from "../../types";

export interface BrowserScreenshotOptions {
  routes: string[];
  baseUrl: string;
  viewports: Viewport[];
  credentials?: {
    email: string;
    password: string;
  };
  loginUrl?: string;
  fullPage?: boolean;
  verbose?: boolean;
}

export interface BrowserScreenshotResult {
  success: boolean;
  screenshots: RouteScreenshot[];
  outputDirectory: string;
  totalDuration: number;
  errors?: Array<{
    code: string;
    message: string;
    route?: string;
  }>;
}

/**
 * Capture screenshots using route-impact-browser (local files only)
 * Storage upload should be handled separately using @storage-manager
 */
export async function captureScreenshotsWithBrowser(
  options: BrowserScreenshotOptions
): Promise<BrowserScreenshotResult> {
  // Get configuration using ConfigurationManager (proper way)
  const claudeApiKey = config.get('claude-api-key', { required: true });
  const claudeModel = config.get('claude-model', { required: true });

  core.info(`[DEBUG] Retrieved claudeApiKey: ${claudeApiKey ? 'EXISTS' : 'NULL'}`);
  core.info(`[DEBUG] Retrieved claudeModel: ${claudeModel || 'NULL'}`);

  if (!claudeApiKey) {
    throw new Error(
      "Claude API key is required for route-impact-browser integration."
    );
  }

  if (!claudeModel) {
    throw new Error(
      "Claude model is required. Please specify 'claude-model' input (e.g., claude-sonnet-4-5-20250929)."
    );
  }

  core.info(`📸 Capturing screenshots with route-impact-browser`);
  core.info(`  - Routes: ${options.routes.length}`);
  core.info(`  - Base URL: ${options.baseUrl}`);
  core.info(`  - Viewports: ${options.viewports.length}`);

  const startTime = Date.now();

  // Call route-impact-browser (local storage only)
  const result = await captureRouteScreenshots({
    codebase: { path: process.cwd() },
    routes: options.routes,
    baseUrl: options.baseUrl,
    credentials: options.credentials,
    loginUrl: options.loginUrl,
    options: {
      viewports: options.viewports.map((vp) => ({
        width: vp.width,
        height: vp.height,
        name: vp.name || `${vp.width}x${vp.height}`,
      })),
      llm: {
        provider: "anthropic",
        apiKey: claudeApiKey,
        model: claudeModel,
      },
      auth: options.credentials
        ? {
            enabled: true,
            skipLoginIfAuthenticated: false,
            cache: {
              enabled: true,
              provider: "file-system",
              ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
            },
          }
        : {
            enabled: false,
          },
      browser: {
        headless: true,
        timeout: 60000,
        waitUntil: "networkidle",
        fullPage: options.fullPage !== undefined ? options.fullPage : true,
      },
      storage: {
        provider: "local", // Always use local storage
      },
      verbose: options.verbose ?? false,
    },
  });

  const totalDuration = Date.now() - startTime;

  core.info(`✅ Screenshot capture completed in ${(totalDuration / 1000).toFixed(2)}s`);
  core.info(`  - Successful routes: ${result.metadata.successfulRoutes}`);
  core.info(`  - Failed routes: ${result.metadata.failedRoutes}`);
  core.info(`  - Total screenshots: ${result.metadata.totalScreenshots}`);
  core.info(`  - Output directory: ${result.metadata.outputDirectory}`);

  return {
    success: result.success,
    screenshots: result.screenshots,
    outputDirectory: result.metadata.outputDirectory,
    totalDuration,
    errors: result.errors,
  };
}
