/**
 * Utility functions for consistent URL construction
 */

/**
 * Build a full URL from base URL and route path
 * Handles slash normalization to prevent double slashes or missing slashes
 * 
 * @param baseUrl - The base URL (e.g., "https://example.com" or "https://example.com/")
 * @param route - The route path (e.g., "debugger", "/debugger", "base/leaderboard")
 * @returns The properly constructed full URL
 * 
 * @example
 * buildFullUrl("https://example.com", "debugger") => "https://example.com/debugger"
 * buildFullUrl("https://example.com/", "/debugger") => "https://example.com/debugger"
 * buildFullUrl("https://example.com", "base/leaderboard") => "https://example.com/base/leaderboard"
 */
export function buildFullUrl(baseUrl: string, route: string): string {
  // Remove trailing slash from base URL
  const cleanBase = baseUrl.replace(/\/$/, '');
  
  // Handle empty route (homepage)
  if (!route || route === '/') {
    return cleanBase;
  }
  
  // Normalize route - handle multiple slashes and edge cases
  let normalizedRoute = route;
  
  // Replace multiple consecutive slashes with a single slash
  normalizedRoute = normalizedRoute.replace(/\/+/g, '/');
  
  // Handle routes that are just multiple slashes (e.g., '//', '///')
  if (normalizedRoute === '/') {
    return cleanBase;
  }
  
  // Special handling for routes like '//*' - preserve the asterisk
  if (normalizedRoute === '/*') {
    return `${cleanBase}/*`;
  }
  
  // Ensure route starts with slash
  const cleanRoute = normalizedRoute.startsWith('/') ? normalizedRoute : `/${normalizedRoute}`;
  
  return `${cleanBase}${cleanRoute}`;
}

/**
 * Normalize a route path to ensure consistency
 * 
 * @param route - The route path to normalize
 * @returns The normalized route path (without leading slash)
 * 
 * @example
 * normalizeRoute("/debugger") => "debugger"
 * normalizeRoute("debugger") => "debugger"
 * normalizeRoute("/base/leaderboard") => "base/leaderboard"
 */
export function normalizeRoute(route: string): string {
  // Remove leading slash if present
  return route.replace(/^\//, '');
}

/**
 * Ensure a route has a leading slash
 * 
 * @param route - The route path
 * @returns The route with a leading slash
 * 
 * @example
 * ensureLeadingSlash("debugger") => "/debugger"
 * ensureLeadingSlash("/debugger") => "/debugger"
 */
export function ensureLeadingSlash(route: string): string {
  return route.startsWith('/') ? route : `/${route}`;
}

/**
 * Build a normalized route path from parent and child paths
 * Properly handles route concatenation without double slashes
 * 
 * @param parentPath - The parent route path (e.g., "/", "/admin", "/users")
 * @param childPath - The child route path (e.g., "settings", "/profile", "")
 * @returns The properly combined route path
 * 
 * @example
 * buildRoutePath("/", "home") => "/home"
 * buildRoutePath("/admin", "settings") => "/admin/settings"
 * buildRoutePath("/", "/home") => "/home"
 * buildRoutePath("", "home") => "/home"
 * buildRoutePath("/admin", "") => "/admin"
 */
export function buildRoutePath(parentPath: string, childPath: string): string {
  // Handle empty paths
  if (!parentPath && !childPath) return '/';
  if (!parentPath) return ensureLeadingSlash(childPath);
  if (!childPath) return parentPath;
  
  // Normalize parent path - remove trailing slash except for root
  const normalizedParent = parentPath === '/' ? '/' : parentPath.replace(/\/$/, '');
  
  // Special handling for root path
  if (normalizedParent === '/') {
    return ensureLeadingSlash(childPath);
  }
  
  // For non-root parent paths, combine them
  const normalizedChild = normalizeRoute(childPath);
  return normalizedChild ? `${normalizedParent}/${normalizedChild}` : normalizedParent;
}