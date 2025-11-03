import { GitHubActionParser } from './GitHubActionParser';
import { RouteDetector } from './RouteDetector';
import { ComponentTreeAnalyzer } from './ComponentTreeAnalyzer';
import { PlaywrightActionGenerator, LoginBaseline } from './PlaywrightActionGenerator';
import { LoginBaselineManager } from './LoginBaselineManager';
import { StorageProvider } from '../../providers/storage/types';
import * as core from '@actions/core';

/**
 * Orchestrates the entire login baseline generation flow
 *
 * APPROACH (as proposed):
 * 1. Get login URL from GitHub action file
 * 2. Find source file of that route using route detection
 * 3. Deep dive components using Babel AST
 * 4. Use LLM to build Playwright actions with correct selectors
 * 5. Validate in browser
 * 6. Save as baseline
 *
 * PRIORITIES:
 * 1. Reliability (100% correctness through validation)
 * 2. Subsequent run speed (<1s with caching)
 * 3. First run speed (acceptable to be slow)
 */
export class LoginBaselineOrchestrator {
  private storage: StorageProvider;
  private claudeApiKey: string;

  constructor(storage: StorageProvider, claudeApiKey: string) {
    this.storage = storage;
    this.claudeApiKey = claudeApiKey;
  }

  /**
   * Generate or retrieve login baseline from GitHub action configuration
   */
  async generateFromAction(options: {
    actionFilePath: string;
    testCredentials?: { email: string; password: string };
    model?: string;
    forceRegenerate?: boolean;
  }): Promise<LoginBaseline> {
    core.info('🚀 Starting login baseline generation...');
    core.info('');

    // Step 1: Extract login URL from GitHub action
    core.info('📋 Step 1: Reading GitHub action configuration...');
    const config = GitHubActionParser.extractYofixConfig(options.actionFilePath);

    if (!config || !config.loginUrl) {
      throw new Error('No login URL found in GitHub action file');
    }

    const loginUrl = config.loginUrl;
    const repositoryRoot = config.repositoryRoot;

    core.info(`   Login URL: ${loginUrl}`);
    core.info(`   Repository: ${repositoryRoot}`);
    core.info('');

    // Use baseline manager for caching
    const baselineManager = new LoginBaselineManager(this.storage);

    // Check cache unless force regenerate
    if (!options.forceRegenerate) {
      return await baselineManager.getOrGenerateBaseline(loginUrl, async () => {
        return await this.generateBaseline(
          loginUrl,
          repositoryRoot,
          options.testCredentials,
          options.model
        );
      });
    } else {
      core.info('🔄 Force regenerate requested - bypassing cache');
      return await this.generateBaseline(
        loginUrl,
        repositoryRoot,
        options.testCredentials,
        options.model
      );
    }
  }

  /**
   * Generate baseline from explicit parameters
   */
  async generateFromUrl(options: {
    loginUrl: string;
    repositoryRoot: string;
    testCredentials?: { email: string; password: string };
    model?: string;
    forceRegenerate?: boolean;
  }): Promise<LoginBaseline> {
    const baselineManager = new LoginBaselineManager(this.storage);

    if (!options.forceRegenerate) {
      return await baselineManager.getOrGenerateBaseline(options.loginUrl, async () => {
        return await this.generateBaseline(
          options.loginUrl,
          options.repositoryRoot,
          options.testCredentials,
          options.model
        );
      });
    } else {
      return await this.generateBaseline(
        options.loginUrl,
        options.repositoryRoot,
        options.testCredentials,
        options.model
      );
    }
  }

  /**
   * Core baseline generation logic
   */
  private async generateBaseline(
    loginUrl: string,
    repositoryRoot: string,
    testCredentials?: { email: string; password: string },
    model?: string
  ): Promise<LoginBaseline> {
    // Step 2: Find route source file
    core.info('🔍 Step 2: Finding route source file...');
    const routeDetector = new RouteDetector(repositoryRoot);
    const routeFile = await routeDetector.findRouteComponent(loginUrl);

    if (!routeFile) {
      throw new Error(`Could not find component for route: ${loginUrl}`);
    }

    core.info(`   Found: ${routeFile}`);
    core.info('');

    // Step 3: Resolve component tree
    core.info('📊 Step 3: Resolving component tree...');
    const analyzer = new ComponentTreeAnalyzer();
    const allFiles = await analyzer.resolveComponentTree(routeFile);

    core.info(`   Resolved ${allFiles.length} component files`);
    allFiles.slice(0, 5).forEach(file => {
      core.info(`      - ${file.split('/').slice(-3).join('/')}`);
    });
    if (allFiles.length > 5) {
      core.info(`      ... and ${allFiles.length - 5} more`);
    }
    core.info('');

    // Step 4: Analyze component structure
    core.info('🧬 Step 4: Analyzing component structure...');
    const structure = await analyzer.analyzeLoginForm(allFiles);

    core.info(`   Library: ${structure.detectedLibrary}`);
    core.info(`   Email field: ${structure.emailField?.component || 'not found'}`);
    core.info(`   Password field: ${structure.passwordField?.component || 'not found'}`);
    core.info(`   Submit button: ${structure.submitButton?.component || 'not found'}`);
    core.info('');

    // Step 5: Generate Playwright actions with LLM
    core.info('🧠 Step 5: Generating Playwright actions with LLM...');
    const actionGenerator = new PlaywrightActionGenerator(this.claudeApiKey);

    const baseline = await actionGenerator.generateLoginActions(structure, {
      loginUrl,
      sourceFiles: allFiles,
      testCredentials,
      model
    });

    core.info('');
    core.info('✅ Login baseline generation complete!');
    core.info(`   Actions: ${baseline.actions.length}`);
    core.info(`   Validated: ${baseline.validated ? 'Yes' : 'No'}`);
    core.info('');

    return baseline;
  }
}
