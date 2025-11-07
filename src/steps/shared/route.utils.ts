/**
 * Route utilities for extracting pathname from URLs
 * Used across multiple steps for consistent route handling
 */

import * as core from '@actions/core';

/**
 * Extract pathname from full URL for matching
 * Same pattern used in Step 2.5 and Step 4
 *
 * @param route - Full URL or pathname
 * @returns Pathname only (e.g., /dashboard) or original if not a URL
 *
 * @example
 * extractRoutePath('https://preview.com/dashboard') // '/dashboard'
 * extractRoutePath('/dashboard') // '/dashboard'
 */
export function extractRoutePath(route: string): string {
  let routePath = route;

  if (routePath.startsWith('http://') || routePath.startsWith('https://')) {
    try {
      const url = new URL(routePath);
      routePath = url.pathname;
    } catch (error) {
      core.debug(`Failed to parse route URL: ${routePath}`);
    }
  }

  return routePath;
}
