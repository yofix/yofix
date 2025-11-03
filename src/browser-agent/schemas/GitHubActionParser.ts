import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extracts configuration from GitHub Action YAML files
 * Used to get login URL and other test parameters
 */
export class GitHubActionParser {
  /**
   * Extract login URL from GitHub action workflow file
   * Looks for yofix action inputs
   */
  static extractLoginUrl(actionFilePath: string): string | null {
    try {
      const content = fs.readFileSync(actionFilePath, 'utf-8');
      const doc = yaml.load(content) as any;

      // Navigate through workflow structure to find yofix action
      const jobs = doc.jobs || {};

      for (const jobKey of Object.keys(jobs)) {
        const job = jobs[jobKey];
        const steps = job.steps || [];

        for (const step of steps) {
          // Look for yofix action
          if (step.uses && step.uses.includes('yofix')) {
            const loginUrl = step.with?.['auth-login-url'] || step.with?.['login-url'];
            if (loginUrl) {
              console.log(`✅ Found login URL: ${loginUrl}`);
              return loginUrl;
            }
          }
        }
      }

      console.log('⚠️  No login-url found in GitHub action file');
      return null;
    } catch (error) {
      console.error(`Failed to parse GitHub action: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract repository root from action file path
   */
  static getRepositoryRoot(actionFilePath: string): string {
    // Action files are in .github/workflows/, so go up 2 levels
    return path.resolve(path.dirname(actionFilePath), '../..');
  }

  /**
   * Extract all yofix configuration from action file
   */
  static extractYofixConfig(actionFilePath: string): {
    loginUrl?: string;
    baseUrl?: string;
    routes?: string[];
    repositoryRoot: string;
  } | null {
    try {
      const content = fs.readFileSync(actionFilePath, 'utf-8');
      const doc = yaml.load(content) as any;

      const jobs = doc.jobs || {};

      for (const jobKey of Object.keys(jobs)) {
        const job = jobs[jobKey];
        const steps = job.steps || [];

        for (const step of steps) {
          if (step.uses && step.uses.includes('yofix')) {
            return {
              loginUrl: step.with?.['auth-login-url'] || step.with?.['login-url'],
              baseUrl: step.with?.['base-url'] || step.with?.['preview-url'],
              routes: step.with?.['routes']?.split(',').map((r: string) => r.trim()),
              repositoryRoot: this.getRepositoryRoot(actionFilePath)
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to extract yofix config: ${error.message}`);
      return null;
    }
  }
}
