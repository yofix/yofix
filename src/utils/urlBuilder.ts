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
  // If route is already a full URL (e.g., from route-impact-analyzer), return it as-is
  // route-impact-analyzer returns full URLs when baseUrl is provided during analysis
  if (route.startsWith('http://') || route.startsWith('https://')) {
    return route;
  }

  // Otherwise, build full URL from baseUrl + relative route (e.g., from config or manual input)
  const cleanBase = baseUrl.replace(/\/$/, '');

  // Handle empty route (homepage)
  if (!route || route === '/') {
    return cleanBase;
  }

  // Ensure route starts with slash
  const cleanRoute = route.startsWith('/') ? route : `/${route}`;

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