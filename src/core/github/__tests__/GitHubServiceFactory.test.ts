/**
 * Comprehensive test suite for GitHubServiceFactory
 * Tests all implementations: Mock, Octokit, and Lazy
 */

import { 
  GitHubServiceFactory, 
  MockGitHubService, 
  OctokitGitHubService, 
  LazyGitHubService,
  GitHubService,
  GitHubConfig
} from '../GitHubServiceFactory';

describe('GitHubServiceFactory', () => {
  beforeEach(() => {
    // Reset factory state before each test
    GitHubServiceFactory.reset();
    
    // Clear environment variables that might affect tests
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_SHA;
    delete process.env.GITHUB_ACTOR;
    delete process.env.GITHUB_EVENT_NAME;
  });

  describe('Factory Pattern', () => {
    it('should return same instance on multiple calls (singleton)', () => {
      const service1 = GitHubServiceFactory.getService();
      const service2 = GitHubServiceFactory.getService();
      
      expect(service1).toBe(service2);
    });

    it('should allow manual service override', () => {
      const mockService = new MockGitHubService();
      GitHubServiceFactory.setService(mockService);
      
      const service = GitHubServiceFactory.getService();
      expect(service).toBe(mockService);
    });

    it('should reset factory state', () => {
      const service1 = GitHubServiceFactory.getService();
      GitHubServiceFactory.reset();
      const service2 = GitHubServiceFactory.getService();
      
      expect(service1).not.toBe(service2);
    });

    it('should create LazyGitHubService by default', () => {
      const service = GitHubServiceFactory.getService();
      expect(service).toBeInstanceOf(LazyGitHubService);
    });
  });

  describe('MockGitHubService', () => {
    let mockService: MockGitHubService;

    beforeEach(() => {
      mockService = new MockGitHubService();
    });

    describe('Configuration', () => {
      it('should start unconfigured', () => {
        expect(mockService.isConfigured()).toBe(false);
      });

      it('should configure successfully', async () => {
        const config: GitHubConfig = {
          token: 'test-token',
          owner: 'test-owner',
          repo: 'test-repo'
        };

        await mockService.configure(config);
        expect(mockService.isConfigured()).toBe(true);
      });
    });

    describe('Context Operations', () => {
      it('should return mock context', () => {
        const context = mockService.getContext();
        
        expect(context).toMatchObject({
          owner: 'test-owner',
          repo: 'test-repo',
          sha: 'test-sha',
          prNumber: 123,
          actor: 'test-actor',
          eventName: 'pull_request'
        });
        
        expect(context.payload).toBeDefined();
        expect(context.payload?.pull_request?.number).toBe(123);
      });
    });

    describe('Pull Request Operations', () => {
      beforeEach(async () => {
        await mockService.configure({ token: 'test-token' });
      });

      it('should list pull request files', async () => {
        // Set up mock data
        mockService.setMockPRFiles('test-owner', 'test-repo', 1, [
          {
            filename: 'src/test.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            changes: 15,
            patch: '@@ -1,3 +1,3 @@'
          }
        ]);

        const files = await mockService.listPullRequestFiles('test-owner', 'test-repo', 1);
        
        expect(files).toHaveLength(1);
        expect(files[0]).toMatchObject({
          filename: 'src/test.ts',
          status: 'modified',
          additions: 10,
          deletions: 5,
          changes: 15
        });
      });
    });

    describe('Comment Operations', () => {
      beforeEach(async () => {
        await mockService.configure({ token: 'test-token' });
      });

      it('should create comment and return id', async () => {
        const result = await mockService.createComment('test-owner', 'test-repo', 1, 'Test comment');
        
        expect(result).toMatchObject({
          id: expect.any(Number),
          html_url: expect.stringContaining('github.com')
        });
      });

      it('should list comments', async () => {
        // Create a comment first
        await mockService.createComment('test-owner', 'test-repo', 1, 'Test comment');
        
        const comments = await mockService.listComments('test-owner', 'test-repo', 1);
        
        expect(comments).toHaveLength(1);
        expect(comments[0]).toMatchObject({
          id: expect.any(Number),
          body: 'Test comment',
          user: { login: 'test-bot' }
        });
      });

      it('should update comment', async () => {
        const comment = await mockService.createComment('test-owner', 'test-repo', 1, 'Original');
        await mockService.updateComment('test-owner', 'test-repo', comment.id, 'Updated');
        
        const comments = await mockService.listComments('test-owner', 'test-repo', 1);
        expect(comments[0].body).toBe('Updated');
      });

      it('should add reactions', async () => {
        const comment = await mockService.createComment('test-owner', 'test-repo', 1, 'Test');
        
        // Should not throw
        await expect(mockService.addReaction('test-owner', 'test-repo', comment.id, '+1'))
          .resolves.not.toThrow();
      });
    });

    describe('Repository Operations', () => {
      beforeEach(async () => {
        await mockService.configure({ token: 'test-token' });
      });

      it('should get file content', async () => {
        // Set up mock file content
        mockService.setMockFileContent('package.json', {
          path: 'package.json',
          content: Buffer.from('{"name": "test"}').toString('base64'),
          encoding: 'base64',
          sha: 'abc123'
        });

        const content = await mockService.getFileContent('test-owner', 'test-repo', 'package.json');
        
        expect(content).toMatchObject({
          path: 'package.json',
          content: expect.any(String),
          encoding: 'base64',
          sha: 'abc123'
        });
      });

      it('should return null for non-existent file', async () => {
        const content = await mockService.getFileContent('test-owner', 'test-repo', 'nonexistent.txt');
        expect(content).toBeNull();
      });

      it('should support getContent alias', async () => {
        mockService.setMockFileContent('test.txt', {
          path: 'test.txt',
          content: 'dGVzdA==',
          encoding: 'base64',
          sha: 'def456'
        });

        const content = await mockService.getContent('test-owner', 'test-repo', 'test.txt');
        expect(content).toBeTruthy();
        expect(content?.path).toBe('test.txt');
      });
    });

    describe('Check Run Operations', () => {
      beforeEach(async () => {
        await mockService.configure({ token: 'test-token' });
      });

      it('should create check run', async () => {
        const checkData = {
          name: 'test-check',
          status: 'completed' as const,
          conclusion: 'success' as const
        };

        const result = await mockService.createCheckRun('test-owner', 'test-repo', 'abc123', checkData);
        
        expect(result).toMatchObject({
          id: expect.any(Number)
        });
      });

      it('should list check runs', async () => {
        // Create a check run first
        await mockService.createCheckRun('test-owner', 'test-repo', 'abc123', {
          name: 'test-check',
          status: 'completed',
          conclusion: 'success'
        });

        const checks = await mockService.listCheckRuns('test-owner', 'test-repo', 'abc123');
        
        expect(checks).toHaveLength(1);
        expect(checks[0]).toMatchObject({
          name: 'test-check',
          status: 'completed',
          conclusion: 'success',
          id: expect.any(Number)
        });
      });

      it('should update check run', async () => {
        const check = await mockService.createCheckRun('test-owner', 'test-repo', 'abc123', {
          name: 'test-check',
          status: 'in_progress'
        });

        await mockService.updateCheckRun('test-owner', 'test-repo', check.id, {
          status: 'completed',
          conclusion: 'success'
        });

        const checks = await mockService.listCheckRuns('test-owner', 'test-repo', 'abc123');
        expect(checks[0]).toMatchObject({
          status: 'completed',
          conclusion: 'success'
        });
      });
    });

    describe('Issue Operations', () => {
      beforeEach(async () => {
        await mockService.configure({ token: 'test-token' });
      });

      it('should create issue', async () => {
        const result = await mockService.createIssue(
          'test-owner', 
          'test-repo', 
          'Test Issue', 
          'Test body',
          ['bug', 'test']
        );

        expect(result).toMatchObject({
          number: expect.any(Number),
          html_url: expect.stringContaining('github.com')
        });
      });
    });
  });

  describe('LazyGitHubService', () => {
    let lazyService: LazyGitHubService;

    beforeEach(() => {
      lazyService = new LazyGitHubService();
    });

    describe('Lazy Initialization', () => {
      it('should be configured with smart defaults', () => {
        // With smart defaults, the service should now report as configured
        expect(lazyService.isConfigured()).toBe(true);
      });

      it('should provide context with smart defaults when no env vars', () => {
        // Clear environment variables to test smart defaults
        delete process.env.GITHUB_REPOSITORY;
        delete process.env.GITHUB_SHA;
        delete process.env.GITHUB_ACTOR;

        const context = lazyService.getContext();
        
        expect(context).toMatchObject({
          owner: 'test-owner',
          repo: 'test-repo',
          sha: 'mock-sha-123456',
          actor: 'yofix-bot'
        });
      });

      it('should work with smart defaults in test environment', async () => {
        // In test environment, should work with smart defaults (MockGitHubService)
        const files = await lazyService.listPullRequestFiles('test-owner', 'test-repo', 1);
        
        // Should return empty array from MockGitHubService
        expect(files).toEqual([]);
      });
    });

    describe('Configuration', () => {
      it('should configure successfully', async () => {
        const config: GitHubConfig = {
          token: 'test-token',
          owner: 'test-owner',
          repo: 'test-repo'
        };

        await lazyService.configure(config);
        expect(lazyService.isConfigured()).toBe(true);
      });

      it('should delegate to underlying service after configuration', async () => {
        await lazyService.configure({ token: 'test-token' });
        
        // This should not throw since we have a token
        const context = lazyService.getContext();
        expect(context).toBeDefined();
      });
    });
  });

  describe('Environment Detection', () => {
    describe('GitHub Actions Environment', () => {
      beforeEach(() => {
        // Reset environment hook factory to pick up new env vars
        const { EnvironmentHookFactory } = require('../../hooks/EnvironmentHook');
        EnvironmentHookFactory.reset();
        
        process.env.GITHUB_ACTIONS = 'true';
        process.env.GITHUB_REPOSITORY = 'owner/repo';
        process.env.GITHUB_SHA = 'test-sha';
        process.env.GITHUB_ACTOR = 'test-actor';
        process.env.GITHUB_EVENT_NAME = 'pull_request';
      });
      
      afterEach(() => {
        // Clean up environment variables
        delete process.env.GITHUB_ACTIONS;
        delete process.env.GITHUB_REPOSITORY;
        delete process.env.GITHUB_SHA;
        delete process.env.GITHUB_ACTOR;
        delete process.env.GITHUB_EVENT_NAME;
        delete process.env.GITHUB_EVENT_PATH;
        
        // Reset environment hook factory
        const { EnvironmentHookFactory } = require('../../hooks/EnvironmentHook');
        EnvironmentHookFactory.reset();
      });

      it('should detect GitHub Actions context', () => {
        const service = new OctokitGitHubService();
        const context = service.getContext();

        expect(context).toMatchObject({
          owner: 'owner',
          repo: 'repo',
          sha: 'test-sha',
          actor: 'test-actor',
          eventName: 'pull_request'
        });
      });

      it('should parse event payload when available', () => {
        // Mock file system for event payload
        const fs = require('fs');
        const mockEventPayload = {
          pull_request: { number: 123 },
          issue: { number: 123 }
        };
        
        process.env.GITHUB_EVENT_PATH = '/tmp/event.json';
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockEventPayload));

        const service = new OctokitGitHubService();
        const context = service.getContext();

        expect(context.payload).toEqual(mockEventPayload);
        expect(context.prNumber).toBe(123);

        fs.readFileSync.mockRestore();
      });
    });

    describe('Non-GitHub Actions Environment', () => {
      it('should provide fallback context', () => {
        delete process.env.GITHUB_ACTIONS;
        
        const service = new OctokitGitHubService();
        const context = service.getContext();

        expect(context).toMatchObject({
          owner: '',
          repo: '',
          sha: undefined,
          prNumber: undefined,
          actor: undefined,
          eventName: undefined,
          payload: {}
        });
      });
    });
  });

  describe('Error Handling', () => {
    let mockService: MockGitHubService;

    beforeEach(() => {
      mockService = new MockGitHubService();
    });

    it('should work without configuration (mock allows unconfigured usage)', async () => {
      // MockGitHubService allows operations without configuration for testing flexibility
      const files = await mockService.listPullRequestFiles('owner', 'repo', 1);
      expect(files).toEqual([]);
    });

    it('should handle invalid configurations gracefully', async () => {
      await expect(mockService.configure({}))
        .resolves.not.toThrow();
      
      expect(mockService.isConfigured()).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    it('should work in complete GitHub Actions workflow simulation', async () => {
      // Reset environment hook factory to pick up new env vars
      const { EnvironmentHookFactory } = require('../../hooks/EnvironmentHook');
      EnvironmentHookFactory.reset();
      
      // Simulate GitHub Actions environment
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_TOKEN = 'test-token';
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_SHA = 'abc123';
      process.env.GITHUB_EVENT_NAME = 'pull_request';

      const service = GitHubServiceFactory.getService();
      
      // Should get context without issues
      const context = service.getContext();
      expect(context.owner).toBe('owner');
      expect(context.repo).toBe('repo');
      
      // Service should be configured (LazyGitHubService shows configured when token is available)
      expect(service.isConfigured()).toBe(true);
      
      // Should be able to perform operations (this will trigger lazy initialization)
      const files = await service.listPullRequestFiles('owner', 'repo', 1);
      expect(Array.isArray(files)).toBe(true);
      
      // Cleanup
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_SHA;
      delete process.env.GITHUB_EVENT_NAME;
      GitHubServiceFactory.reset();
      EnvironmentHookFactory.reset();
    });

    it('should handle testing environment gracefully', () => {
      process.env.NODE_ENV = 'test';
      
      const service = GitHubServiceFactory.getService();
      const context = service.getContext();
      
      // Should not throw and provide some context
      expect(context).toBeDefined();
      expect(typeof context.owner).toBe('string');
      expect(typeof context.repo).toBe('string');
    });
  });

  describe('Performance', () => {
    it('should create services efficiently', () => {
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        GitHubServiceFactory.reset();
        GitHubServiceFactory.getService();
      }
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should cache singleton instances', () => {
      const service1 = GitHubServiceFactory.getService();
      const service2 = GitHubServiceFactory.getService();
      const service3 = GitHubServiceFactory.getService();
      
      expect(service1).toBe(service2);
      expect(service2).toBe(service3);
    });
  });
});