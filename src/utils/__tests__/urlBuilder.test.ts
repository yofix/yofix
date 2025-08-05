import { buildFullUrl, normalizeRoute, ensureLeadingSlash, buildRoutePath } from '../urlBuilder';

describe('urlBuilder', () => {
  describe('buildFullUrl', () => {
    it('should build full URL correctly', () => {
      expect(buildFullUrl('https://example.com', 'debugger')).toBe('https://example.com/debugger');
      expect(buildFullUrl('https://example.com/', '/debugger')).toBe('https://example.com/debugger');
      expect(buildFullUrl('https://example.com', 'base/leaderboard')).toBe('https://example.com/base/leaderboard');
      expect(buildFullUrl('https://example.com/', '/')).toBe('https://example.com');
      expect(buildFullUrl('https://example.com', '')).toBe('https://example.com');
    });

    it('should handle malformed routes with multiple slashes', () => {
      expect(buildFullUrl('https://example.com', '//')).toBe('https://example.com');
      expect(buildFullUrl('https://example.com', '///')).toBe('https://example.com');
      expect(buildFullUrl('https://example.com', '//home')).toBe('https://example.com/home');
      expect(buildFullUrl('https://example.com', '///search')).toBe('https://example.com/search');
      expect(buildFullUrl('https://example.com', '//*')).toBe('https://example.com/*');
      expect(buildFullUrl('https://example.com', '//admin//settings')).toBe('https://example.com/admin/settings');
    });
  });

  describe('normalizeRoute', () => {
    it('should normalize routes correctly', () => {
      expect(normalizeRoute('/debugger')).toBe('debugger');
      expect(normalizeRoute('debugger')).toBe('debugger');
      expect(normalizeRoute('/base/leaderboard')).toBe('base/leaderboard');
      expect(normalizeRoute('/')).toBe('');
    });
  });

  describe('ensureLeadingSlash', () => {
    it('should ensure leading slash', () => {
      expect(ensureLeadingSlash('debugger')).toBe('/debugger');
      expect(ensureLeadingSlash('/debugger')).toBe('/debugger');
      expect(ensureLeadingSlash('')).toBe('/');
    });
  });

  describe('buildRoutePath', () => {
    it('should handle root paths correctly', () => {
      expect(buildRoutePath('/', 'home')).toBe('/home');
      expect(buildRoutePath('/', '/home')).toBe('/home');
      expect(buildRoutePath('/', '')).toBe('/');
      expect(buildRoutePath('/', '/')).toBe('/');
    });

    it('should handle empty parent paths', () => {
      expect(buildRoutePath('', 'home')).toBe('/home');
      expect(buildRoutePath('', '/home')).toBe('/home');
      expect(buildRoutePath('', '')).toBe('/');
    });

    it('should handle nested paths correctly', () => {
      expect(buildRoutePath('/admin', 'settings')).toBe('/admin/settings');
      expect(buildRoutePath('/admin', '/settings')).toBe('/admin/settings');
      expect(buildRoutePath('/admin', '')).toBe('/admin');
    });

    it('should prevent double slashes', () => {
      expect(buildRoutePath('/admin/', 'settings')).toBe('/admin/settings');
      expect(buildRoutePath('/admin/', '/settings')).toBe('/admin/settings');
      expect(buildRoutePath('/admin', '/')).toBe('/admin');
    });

    it('should handle complex nested paths', () => {
      expect(buildRoutePath('/base/admin', 'users/list')).toBe('/base/admin/users/list');
      expect(buildRoutePath('/base/admin', '/users/list')).toBe('/base/admin/users/list');
    });

    it('should handle index routes', () => {
      expect(buildRoutePath('/admin', '(index)')).toBe('/admin/(index)');
      expect(buildRoutePath('/', '(index)')).toBe('/(index)');
    });

    it('should handle special characters in routes', () => {
      expect(buildRoutePath('/wizard', ':wizardID')).toBe('/wizard/:wizardID');
      expect(buildRoutePath('/files', '*')).toBe('/files/*');
    });

    // Test cases from the actual deployment log
    it('should fix the double slash issues from deployment', () => {
      // These were the problematic routes from the log
      expect(buildRoutePath('/', 'home')).toBe('/home');
      expect(buildRoutePath('/', 'dashboard')).toBe('/dashboard');
      expect(buildRoutePath('/', 'debugger')).toBe('/debugger');
      expect(buildRoutePath('/', '*')).toBe('/*');
      expect(buildRoutePath('/', '/search')).toBe('/search');
      expect(buildRoutePath('/balance', '')).toBe('/balance');
      expect(buildRoutePath('/balance/journal-entries', '')).toBe('/balance/journal-entries');
      
      // Should NOT produce double slashes
      expect(buildRoutePath('/', 'home')).not.toContain('//');
      expect(buildRoutePath('/', '(index)')).not.toContain('//');
    });
  });
});