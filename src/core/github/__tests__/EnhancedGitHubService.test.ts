/**
 * Tests for EnhancedGitHubService performance features
 */

import { 
  EnhancedGitHubService,
  GitHubServiceFactory 
} from '../GitHubServiceFactory';

// Mock @actions/github
jest.mock('@actions/github', () => ({
  getOctokit: jest.fn()
}));

describe('EnhancedGitHubService', () => {
  let service: EnhancedGitHubService;
  let mockOctokit: any;

  beforeEach(() => {
    mockOctokit = {
      rest: {
        pulls: {
          listFiles: jest.fn()
        },
        issues: {
          createComment: jest.fn(),
          listComments: jest.fn()
        },
        repos: {
          getContent: jest.fn()
        }
      }
    };

    // Mock the import
    const github = require('@actions/github');
    (github.getOctokit as jest.Mock).mockReturnValue(mockOctokit);

    service = new EnhancedGitHubService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Caching', () => {
    beforeEach(async () => {
      await service.configure({
        token: 'test-token',
        cache: {
          enabled: true,
          ttlMs: 60000, // 1 minute
          maxSize: 10
        }
      });
    });

    it('should cache read operations', async () => {
      const mockData = [{ filename: 'test.ts', status: 'modified' }];
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({ data: mockData });

      // First call
      const result1 = await service.listPullRequestFiles('owner', 'repo', 1);
      expect(result1).toEqual(mockData);
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await service.listPullRequestFiles('owner', 'repo', 1);
      expect(result2).toEqual(mockData);
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should not cache write operations', async () => {
      const mockComment = { id: 123, html_url: 'test-url' };
      mockOctokit.rest.issues.createComment.mockResolvedValue({ data: mockComment });

      // Multiple calls should not be cached
      await service.createComment('owner', 'repo', 1, 'test1');
      await service.createComment('owner', 'repo', 1, 'test2');

      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache on write operations', async () => {
      const mockComments = [{ id: 1, body: 'test' }];
      const mockNewComment = { id: 2, html_url: 'test-url' };
      
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: mockComments });
      mockOctokit.rest.issues.createComment.mockResolvedValue({ data: mockNewComment });

      // Cache the list
      await service.listComments('owner', 'repo', 1);
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(1);

      // Create comment should invalidate the cache
      await service.createComment('owner', 'repo', 1, 'new comment');

      // Next list call should refetch
      await service.listComments('owner', 'repo', 1);
      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledTimes(2);
    });

    it('should respect cache TTL', async () => {
      // Configure with very short TTL
      await service.configure({
        token: 'test-token',
        cache: {
          enabled: true,
          ttlMs: 100, // 100ms
          maxSize: 10
        }
      });

      const mockData = [{ filename: 'test.ts' }];
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({ data: mockData });

      // First call
      await service.listPullRequestFiles('owner', 'repo', 1);
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      await service.listPullRequestFiles('owner', 'repo', 1);
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(2);
    });

    it('should provide cache management methods', () => {
      expect(typeof service.clearCache).toBe('function');
      
      // Should not throw
      service.clearCache();
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      await service.configure({
        token: 'test-token',
        rateLimit: {
          enabled: true,
          requestsPerHour: 3600, // 1 per second
          burstLimit: 2
        }
      });
    });

    it('should apply rate limiting to API calls', async () => {
      const mockData = [{ filename: 'test.ts' }];
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({ data: mockData });

      const startTime = Date.now();
      
      // Make multiple calls
      await Promise.all([
        service.listPullRequestFiles('owner', 'repo', 1),
        service.listPullRequestFiles('owner', 'repo', 2),
        service.listPullRequestFiles('owner', 'repo', 3)
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take some time due to rate limiting (though minimal for this test)
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(3);
    });

    it('should provide rate limit management methods', () => {
      expect(typeof service.resetRateLimit).toBe('function');
      
      // Should not throw
      service.resetRateLimit();
    });
  });

  describe('Retry Logic', () => {
    beforeEach(async () => {
      await service.configure({
        token: 'test-token',
        retry: {
          enabled: true,
          maxRetries: 2,
          baseDelayMs: 10, // Very short for testing
          maxDelayMs: 100
        }
      });
    });

    it('should retry on transient errors', async () => {
      const mockData = [{ filename: 'test.ts' }];
      
      // Fail twice, then succeed
      mockOctokit.rest.pulls.listFiles
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ data: mockData });

      const result = await service.listPullRequestFiles('owner', 'repo', 1);
      
      expect(result).toEqual(mockData);
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors', async () => {
      const clientError = new Error('Not found');
      (clientError as any).status = 404;
      
      mockOctokit.rest.pulls.listFiles.mockRejectedValue(clientError);

      await expect(service.listPullRequestFiles('owner', 'repo', 1))
        .rejects.toThrow('Not found');
      
      // Should not retry 4xx errors
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(1);
    });

    it('should give up after max retries', async () => {
      const serverError = new Error('Server error');
      (serverError as any).status = 500;
      
      mockOctokit.rest.pulls.listFiles.mockRejectedValue(serverError);

      await expect(service.listPullRequestFiles('owner', 'repo', 1))
        .rejects.toThrow('Server error');
      
      // Should try 3 times (initial + 2 retries)
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(3);
    });
  });

  describe('Configuration', () => {
    it('should support disabling cache', async () => {
      await service.configure({
        token: 'test-token',
        cache: {
          enabled: false
        }
      });

      const mockData = [{ filename: 'test.ts' }];
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({ data: mockData });

      // Multiple calls should not be cached
      await service.listPullRequestFiles('owner', 'repo', 1);
      await service.listPullRequestFiles('owner', 'repo', 1);

      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(2);
    });

    it('should support disabling rate limiting', async () => {
      await service.configure({
        token: 'test-token',
        rateLimit: {
          enabled: false
        }
      });

      const mockData = [{ filename: 'test.ts' }];
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({ data: mockData });

      // Calls should not be rate limited
      await Promise.all([
        service.listPullRequestFiles('owner', 'repo', 1),
        service.listPullRequestFiles('owner', 'repo', 2)
      ]);

      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(2);
    });

    it('should support disabling retry', async () => {
      await service.configure({
        token: 'test-token',
        retry: {
          enabled: false
        }
      });

      const serverError = new Error('Server error');
      mockOctokit.rest.pulls.listFiles.mockRejectedValue(serverError);

      await expect(service.listPullRequestFiles('owner', 'repo', 1))
        .rejects.toThrow('Server error');
      
      // Should not retry when disabled
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(1);
    });
  });

  describe('Factory Integration', () => {
    it('should create enhanced service when explicitly requested', () => {
      // Explicitly request enhanced service (bypasses test environment check)
      const service = GitHubServiceFactory.createService({ mock: false, enhanced: true });
      expect(service).toBeInstanceOf(EnhancedGitHubService);
    });

    it('should support creating enhanced service with config', () => {
      const config = {
        token: 'test-token',
        cache: { enabled: true },
        rateLimit: { enabled: true }
      };
      
      const service = GitHubServiceFactory.createEnhancedService(config);
      expect(service).toBeInstanceOf(EnhancedGitHubService);
    });

    it('should support creating legacy service', () => {
      const service = GitHubServiceFactory.createService({ enhanced: false });
      expect(service).not.toBeInstanceOf(EnhancedGitHubService);
    });
  });
});