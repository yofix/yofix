import { buildFullUrl, normalizeRoute, ensureLeadingSlash } from '../urlBuilder';

describe('urlBuilder', () => {
  describe('buildFullUrl', () => {
    it('should handle base URL without trailing slash and route without leading slash', () => {
      expect(buildFullUrl('https://example.com', 'debugger')).toBe('https://example.com/debugger');
      expect(buildFullUrl('https://example.com', 'base/leaderboard')).toBe('https://example.com/base/leaderboard');
    });

    it('should handle base URL with trailing slash and route with leading slash', () => {
      expect(buildFullUrl('https://example.com/', '/debugger')).toBe('https://example.com/debugger');
      expect(buildFullUrl('https://example.com/', '/base/leaderboard')).toBe('https://example.com/base/leaderboard');
    });

    it('should handle mixed slash scenarios', () => {
      expect(buildFullUrl('https://example.com/', 'debugger')).toBe('https://example.com/debugger');
      expect(buildFullUrl('https://example.com', '/debugger')).toBe('https://example.com/debugger');
    });

    it('should handle empty route (homepage)', () => {
      expect(buildFullUrl('https://example.com', '')).toBe('https://example.com');
      expect(buildFullUrl('https://example.com/', '')).toBe('https://example.com');
      expect(buildFullUrl('https://example.com', '/')).toBe('https://example.com');
      expect(buildFullUrl('https://example.com/', '/')).toBe('https://example.com');
    });

    it('should handle complex URLs with ports and paths', () => {
      expect(buildFullUrl('http://localhost:3000', 'test')).toBe('http://localhost:3000/test');
      expect(buildFullUrl('https://preview-pr-123.example.com/', '/admin/users')).toBe('https://preview-pr-123.example.com/admin/users');
    });
  });

  describe('normalizeRoute', () => {
    it('should remove leading slash', () => {
      expect(normalizeRoute('/debugger')).toBe('debugger');
      expect(normalizeRoute('/base/leaderboard')).toBe('base/leaderboard');
    });

    it('should keep routes without leading slash unchanged', () => {
      expect(normalizeRoute('debugger')).toBe('debugger');
      expect(normalizeRoute('base/leaderboard')).toBe('base/leaderboard');
    });

    it('should handle empty route', () => {
      expect(normalizeRoute('')).toBe('');
      expect(normalizeRoute('/')).toBe('');
    });
  });

  describe('ensureLeadingSlash', () => {
    it('should add leading slash if missing', () => {
      expect(ensureLeadingSlash('debugger')).toBe('/debugger');
      expect(ensureLeadingSlash('base/leaderboard')).toBe('/base/leaderboard');
    });

    it('should keep existing leading slash', () => {
      expect(ensureLeadingSlash('/debugger')).toBe('/debugger');
      expect(ensureLeadingSlash('/base/leaderboard')).toBe('/base/leaderboard');
    });

    it('should handle empty route', () => {
      expect(ensureLeadingSlash('')).toBe('/');
    });
  });
});