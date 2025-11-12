/**
 * Route utilities for extracting pathname from URLs
 * Used across multiple steps for consistent route handling
 */

import * as core from '@actions/core';

/**
 * Extract pathname from full URL and return both unsanitized and sanitized versions
 *
 * @param route - Full URL or pathname
 * @param separator - Character to replace slashes with in sanitized version (default: '-')
 * @returns Object with pathname (for matching) and sanitized (for filenames)
 *
 * @example
 * extractRoutePath('https://preview.com/dashboard')
 * // { pathname: '/dashboard', sanitized: 'dashboard' }
 *
 * extractRoutePath('/api/users', '_')
 * // { pathname: '/api/users', sanitized: 'api_users' }
 *
 * extractRoutePath('/')
 * // { pathname: '/', sanitized: 'home' }
 */
export function extractRoutePath(route: string, separator: string = '-'): { pathname: string, sanitized: string } {
  let pathname = route;

  // Extract pathname from URL if needed
  if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
    try {
      const url = new URL(pathname);
      pathname = url.pathname;
    } catch (error) {
      core.debug(`Failed to parse route URL: ${pathname}`);
    }
  }

  // Handle root path specially
  let sanitized: string;
  if (pathname === '/' || pathname === '') {
    sanitized = 'home';
  } else {
    sanitized = pathname
      .replace(/^\//, '')           // Remove leading slash
      .replace(/\//g, separator)    // Replace slashes with separator
      .toLowerCase();               // Convert to lowercase
  }

  return { pathname, sanitized };
}
