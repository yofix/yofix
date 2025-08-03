/**
 * GitHub operations hook interface
 */
export interface GitHubContext {
  owner: string;
  repo: string;
  prNumber?: number;
  sha?: string;
}

export interface PullRequestFile {
  filename: string;
  status: string;
}

export interface GitHubHook {
  getContext(): GitHubContext;
  getPullRequestFiles(prNumber: number): Promise<PullRequestFile[]>;
  createComment(prNumber: number, body: string): Promise<void>;
  getInput(name: string): string;
}

/**
 * Mock GitHub implementation for testing
 */
export class MockGitHub implements GitHubHook {
  private inputs: Map<string, string> = new Map();
  private mockFiles: PullRequestFile[] = [];
  
  constructor(private context: GitHubContext) {}
  
  getContext(): GitHubContext {
    return this.context;
  }
  
  setMockFiles(files: PullRequestFile[]): void {
    this.mockFiles = files;
  }
  
  setInput(name: string, value: string): void {
    this.inputs.set(name, value);
  }
  
  async getPullRequestFiles(prNumber: number): Promise<PullRequestFile[]> {
    return this.mockFiles;
  }
  
  async createComment(prNumber: number, body: string): Promise<void> {
    console.log(`[Mock] Would create comment on PR #${prNumber}:`);
    console.log(body);
  }
  
  getInput(name: string): string {
    return this.inputs.get(name) || '';
  }
}

/**
 * Real GitHub Actions implementation
 */
export class GitHubActionsHook implements GitHubHook {
  private github: any;
  private core: any;
  private context: any;
  private octokit: any;
  
  constructor() {
    try {
      this.github = require('@actions/github');
      this.core = require('@actions/core');
      this.context = this.github.context;
      // Initialize with GitHubServiceFactory instead of direct octokit
      // This class is being phased out in favor of GitHubServiceFactory
      const { GitHubServiceFactory } = require('../github/GitHubServiceFactory');
      this.octokit = GitHubServiceFactory.getService();
    } catch (error) {
      throw new Error('GitHub Actions environment not available');
    }
  }
  
  getContext(): GitHubContext {
    return {
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      prNumber: this.context.payload.pull_request?.number,
      sha: this.context.sha
    };
  }
  
  async getPullRequestFiles(prNumber: number): Promise<PullRequestFile[]> {
    if (!this.octokit) {
      throw new Error('GitHub token not available');
    }
    
    const { data: files } = await this.octokit.rest.pulls.listFiles({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      pull_number: prNumber,
      per_page: 100
    });
    
    return files.map(file => ({
      filename: file.filename,
      status: file.status
    }));
  }
  
  async createComment(prNumber: number, body: string): Promise<void> {
    if (!this.octokit) {
      throw new Error('GitHub token not available');
    }
    
    await this.octokit.rest.issues.createComment({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      issue_number: prNumber,
      body
    });
  }
  
  getInput(name: string): string {
    const { getConfiguration } = require('./ConfigurationHook');
    return getConfiguration().getInput(name) || '';
  }
}

/**
 * GitHub hook factory
 */
export class GitHubFactory {
  private static instance: GitHubHook;
  
  static getGitHub(): GitHubHook {
    if (!this.instance) {
      if (process.env.GITHUB_ACTIONS === 'true') {
        try {
          this.instance = new GitHubActionsHook();
        } catch (error) {
          // Fallback to mock for testing
          this.instance = new MockGitHub({
            owner: 'test',
            repo: 'test'
          });
        }
      } else {
        this.instance = new MockGitHub({
          owner: 'test',
          repo: 'test'
        });
      }
    }
    return this.instance;
  }
  
  static setGitHub(github: GitHubHook): void {
    this.instance = github;
  }
}