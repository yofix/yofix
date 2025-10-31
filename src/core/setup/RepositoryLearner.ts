/**
 * RepositoryLearner - One-time LLM-powered pattern extraction
 *
 * Uses Claude to analyze a repository and extract routing patterns.
 * This runs once during setup and saves patterns for fast deterministic analysis.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import {
  LearnedPattern,
  LearningMetrics,
  LearningContext,
  FrameworkType,
  RouteDefinitionPattern,
  ComponentPathPattern,
  RouteStructurePattern,
  ImportAliasPattern,
  LazyLoadingPattern
} from './types';

export class RepositoryLearner {
  private anthropic: Anthropic;
  private repoRoot: string;
  private metrics: LearningMetrics;

  constructor(claudeApiKey: string, repoRoot: string) {
    this.anthropic = new Anthropic({ apiKey: claudeApiKey });
    this.repoRoot = repoRoot;
    this.metrics = {
      filesScanned: 0,
      filesAnalyzed: 0,
      routesDiscovered: 0,
      llmApiCalls: 0,
      tokensUsed: 0,
      estimatedCost: 0,
      duration: {
        start: new Date(),
        end: new Date(),
        seconds: 0
      },
      confidence: {
        overall: 0,
        routeDetection: 0,
        componentMapping: 0,
        importResolution: 0
      }
    };
  }

  /**
   * Main learning workflow
   */
  async learnRepository(): Promise<LearnedPattern> {
    console.log('🔍 Analyzing repository structure...');

    try {
      // Step 1: Gather repository information
      const repoInfo = await this.analyzeRepositoryInfo();

      // Step 2: Find and sample route files
      const routeFiles = await this.findRouteFiles(repoInfo.framework);
      this.metrics.filesScanned = routeFiles.allFiles.length;
      this.metrics.filesAnalyzed = routeFiles.samples.length;

      // Step 3: Extract tsconfig paths
      const tsconfigPaths = await this.extractTsconfigPaths();

      // Step 4: Build context for LLM
      const context: LearningContext = {
        repository: repoInfo,
        sampleFiles: routeFiles.samples,
        structure: {
          routeDirectories: routeFiles.directories,
          componentDirectories: await this.findComponentDirectories(),
          totalFiles: routeFiles.allFiles.length
        }
      };

      // Step 5: Extract patterns using LLM
      console.log(`📊 Analyzing ${routeFiles.samples.length} route files with Claude...`);
      const patterns = await this.extractPatternsWithLLM(context);

      // Step 6: Calculate confidence score
      const confidenceScore = this.calculateConfidence(patterns, context);

      // Skip pre-computed map - use graph traversal which is already fast & accurate
      console.log(`📊 Using graph traversal for route detection`);

      this.metrics.duration.end = new Date();
      this.metrics.duration.seconds = (this.metrics.duration.end.getTime() - this.metrics.duration.start.getTime()) / 1000;
      this.metrics.confidence.overall = confidenceScore;

      const learnedPattern: LearnedPattern = {
        framework: repoInfo.framework,
        version: repoInfo.packageJson?.dependencies?.[this.getFrameworkPackageName(repoInfo.framework)] || '1.0',
        learnedAt: new Date().toISOString(),
        patterns,
        // No pre-computed map - rely on graph traversal
        confidence: confidenceScore,
        metadata: {
          filesAnalyzed: this.metrics.filesAnalyzed,
          routesFound: this.metrics.routesDiscovered,
          tokensUsed: this.metrics.tokensUsed,
          learningDurationSeconds: this.metrics.duration.seconds
        }
      };

      console.log(`✅ Learning complete! Confidence: ${(confidenceScore * 100).toFixed(1)}%`);
      return learnedPattern;

    } catch (error) {
      console.error('❌ Learning failed:', error);
      throw error;
    }
  }

  /**
   * Analyze repository to detect framework and gather metadata
   */
  private async analyzeRepositoryInfo(): Promise<LearningContext['repository']> {
    // Read package.json
    const packageJsonPath = path.join(this.repoRoot, 'package.json');
    let packageJson: any = {};

    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      packageJson = JSON.parse(packageJsonContent);
    } catch (error) {
      console.warn('⚠️  Could not read package.json');
    }

    // Read tsconfig.json
    const tsconfigPath = path.join(this.repoRoot, 'tsconfig.json');
    let tsconfigJson: any = undefined;

    try {
      const tsconfigContent = await fs.readFile(tsconfigPath, 'utf-8');
      // Strip comments before parsing
      const cleanContent = tsconfigContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      tsconfigJson = JSON.parse(cleanContent);
    } catch (error) {
      console.warn('⚠️  Could not read tsconfig.json');
    }

    // Detect framework
    const framework = this.detectFramework(packageJson);
    console.log(`📦 Detected framework: ${framework}`);

    return {
      framework,
      packageJson,
      tsconfigJson
    };
  }

  /**
   * Detect framework from package.json dependencies
   */
  private detectFramework(packageJson: any): string {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps['react-router-dom']) {
      const version = deps['react-router-dom'];
      if (version.startsWith('^6') || version.startsWith('6')) {
        return 'react-router-v6';
      }
      return 'react-router-v5';
    }

    if (deps['next']) {
      // Check if using app router (Next.js 13+)
      if (deps['next'].startsWith('^13') || deps['next'].startsWith('13') ||
          parseInt(deps['next'].replace(/[^\d]/g, '')) >= 13) {
        return 'next-app-router';
      }
      return 'next-pages-router';
    }

    if (deps['vue-router']) {
      return 'vue-router';
    }

    if (deps['@angular/router']) {
      return 'angular-router';
    }

    if (deps['@sveltejs/kit']) {
      return 'svelte-kit';
    }

    return 'unknown';
  }

  /**
   * Find route files in the repository
   */
  private async findRouteFiles(framework: string): Promise<{
    allFiles: string[];
    samples: Array<{ path: string; content: string; size: number }>;
    directories: string[];
  }> {
    const routePatterns = this.getRouteFilePatterns(framework);
    const searchDirs = this.getRouteSearchDirectories();

    const allFiles: string[] = [];
    const directories: Set<string> = new Set();

    // Recursively find all matching files
    for (const dir of searchDirs) {
      const dirPath = path.join(this.repoRoot, dir);
      try {
        await this.findFilesRecursive(dirPath, routePatterns, allFiles, directories);
      } catch (error) {
        // Directory might not exist, skip it
      }
    }

    // Sample up to 15-20 files for analysis
    const maxSamples = 20;
    const sampledFiles: Array<{ path: string; content: string; size: number }> = [];

    // Prioritize: smaller files first (likely route definitions)
    const sortedFiles = allFiles.sort((a, b) => {
      try {
        const statA = fs.statSync(a);
        const statB = fs.statSync(b);
        return (statA.size || 0) - (statB.size || 0);
      } catch {
        return 0;
      }
    });

    for (const file of sortedFiles.slice(0, maxSamples)) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const stat = await fs.stat(file);
        const relativePath = path.relative(this.repoRoot, file);

        sampledFiles.push({
          path: relativePath,
          content: content.slice(0, 5000), // Limit to 5KB per file
          size: stat.size
        });
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return {
      allFiles: allFiles.map(f => path.relative(this.repoRoot, f)),
      samples: sampledFiles,
      directories: Array.from(directories).map(d => path.relative(this.repoRoot, d))
    };
  }

  /**
   * Recursively find files matching patterns
   */
  private async findFilesRecursive(
    dir: string,
    patterns: RegExp[],
    results: string[],
    directories: Set<string>
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules, .git, dist, build
        if (entry.name === 'node_modules' || entry.name === '.git' ||
            entry.name === 'dist' || entry.name === 'build' ||
            entry.name === '.next') {
          continue;
        }

        if (entry.isDirectory()) {
          await this.findFilesRecursive(fullPath, patterns, results, directories);
        } else if (entry.isFile()) {
          // Check if file matches any pattern
          if (patterns.some(pattern => pattern.test(entry.name))) {
            results.push(fullPath);
            directories.add(dir);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  /**
   * Extract patterns using LLM
   */
  private async extractPatternsWithLLM(context: LearningContext): Promise<LearnedPattern['patterns']> {
    const prompt = this.buildLearningPrompt(context);

    this.metrics.llmApiCalls++;

    const response = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 4096,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    this.metrics.tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
    // Claude Sonnet pricing: $3/MTok input, $15/MTok output
    this.metrics.estimatedCost =
      (response.usage.input_tokens / 1_000_000) * 3 +
      (response.usage.output_tokens / 1_000_000) * 15;

    // Extract JSON from response
    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Failed to extract patterns from LLM response');
    }

    const patterns = JSON.parse(jsonMatch[1] || jsonMatch[0]);

    // Count routes discovered
    this.metrics.routesDiscovered = patterns.routeStructure?.commonPaths?.length || 0;

    return patterns;
  }

  /**
   * Build learning prompt for LLM
   */
  private buildLearningPrompt(context: LearningContext): string {
    return `You are analyzing a ${context.repository.framework} codebase to extract routing patterns.

## Repository Information
- Framework: ${context.repository.framework}
- Total route files: ${context.structure.totalFiles}
- Route directories: ${context.structure.routeDirectories.join(', ')}
- Component directories: ${context.structure.componentDirectories.join(', ')}

## Sample Route Files
${context.sampleFiles.map((file, i) => `
### File ${i + 1}: ${file.path}
\`\`\`
${file.content}
\`\`\`
`).join('\n')}

## Task
Analyze these files and extract comprehensive routing patterns. Return a JSON object with this structure:

\`\`\`json
{
  "routeDefinitions": {
    "locations": ["src/routes/", "..."],
    "filePatterns": ["*Router.tsx", "..."],
    "astPatterns": {
      "definitionStyle": "jsx-elements|config-array|file-based|function-calls",
      "identifiers": ["Route", "..."],
      "examples": ["<Route path=... />", "..."]
    }
  },
  "componentPaths": {
    "referenceStyle": "direct-import|lazy-import|dynamic-import|string-path",
    "directories": ["src/pages/", "..."],
    "fileNamingPatterns": ["*.page.tsx", "..."],
    "colocated": true|false
  },
  "routeStructure": {
    "supportsNesting": true|false,
    "fileBasedRouting": true|false,
    "nestingStyle": "children-prop|jsx-nesting|file-system",
    "commonPaths": ["/dashboard", "/users/:id", "..."],
    "dynamicSegments": [":id", "*", "..."]
  },
  "importAliases": {
    "aliases": { "@": "src/", "~": "src/" },
    "baseDir": "src",
    "tsconfigPaths": ${JSON.stringify(context.repository.tsconfigJson?.compilerOptions?.paths || {})}
  },
  "lazyLoading": {
    "enabled": true|false,
    "patterns": ["lazy(() => import(...))", "..."],
    "loaderFunctions": ["lazy", "loadable", "..."]
  }
}
\`\`\`

Focus on accuracy and be as specific as possible based on the actual code patterns you see.`;
  }

  /**
   * Calculate confidence score based on patterns and context
   */
  private calculateConfidence(patterns: LearnedPattern['patterns'], context: LearningContext): number {
    let score = 0;
    let maxScore = 100;

    // Route definitions (30 points)
    if (patterns.routeDefinitions.locations.length > 0) score += 10;
    if (patterns.routeDefinitions.filePatterns.length > 0) score += 10;
    if (patterns.routeDefinitions.astPatterns.examples.length > 0) score += 10;

    // Component paths (25 points)
    if (patterns.componentPaths.directories.length > 0) score += 10;
    if (patterns.componentPaths.fileNamingPatterns.length > 0) score += 10;
    if (patterns.componentPaths.referenceStyle) score += 5;

    // Route structure (20 points)
    if (patterns.routeStructure.commonPaths.length > 0) score += 10;
    if (patterns.routeStructure.dynamicSegments.length > 0) score += 10;

    // Import aliases (15 points)
    if (Object.keys(patterns.importAliases.aliases).length > 0) score += 10;
    if (patterns.importAliases.tsconfigPaths) score += 5;

    // Lazy loading (10 points)
    if (patterns.lazyLoading.enabled && patterns.lazyLoading.patterns.length > 0) score += 10;

    // Bonus: sample quality
    if (context.sampleFiles.length >= 10) score += 5;
    if (context.structure.routeDirectories.length > 0) score += 5;

    return Math.min(score / maxScore, 1.0);
  }

  /**
   * Extract tsconfig paths configuration
   */
  private async extractTsconfigPaths(): Promise<Record<string, string>> {
    const tsconfigPath = path.join(this.repoRoot, 'tsconfig.json');
    const aliases: Record<string, string> = {};

    try {
      const content = await fs.readFile(tsconfigPath, 'utf-8');
      const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const tsconfig = JSON.parse(cleanContent);

      if (tsconfig.compilerOptions?.paths) {
        for (const [alias, paths] of Object.entries(tsconfig.compilerOptions.paths)) {
          if (Array.isArray(paths) && paths.length > 0) {
            // Remove trailing /* from alias and path
            const cleanAlias = alias.replace(/\/\*$/, '');
            const cleanPath = (paths[0] as string).replace(/\/\*$/, '');
            aliases[cleanAlias] = cleanPath;
          }
        }
      }
    } catch (error) {
      // Return empty if tsconfig doesn't exist
    }

    return aliases;
  }

  /**
   * Find component directories
   */
  private async findComponentDirectories(): Promise<string[]> {
    const possibleDirs = [
      'src/components',
      'src/pages',
      'src/views',
      'src/screens',
      'app/components',
      'app/pages',
      'components',
      'pages'
    ];

    const existingDirs: string[] = [];

    for (const dir of possibleDirs) {
      try {
        const fullPath = path.join(this.repoRoot, dir);
        await fs.access(fullPath);
        existingDirs.push(dir);
      } catch {
        // Directory doesn't exist
      }
    }

    return existingDirs;
  }

  /**
   * Get route file patterns for framework
   */
  private getRouteFilePatterns(framework: string): RegExp[] {
    const patterns: Record<string, RegExp[]> = {
      'react-router-v6': [
        /.*Router\.tsx?$/,
        /.*Routes\.tsx?$/,
        /.*routing\.tsx?$/,
        /route\.tsx?$/,
        /routes\.tsx?$/
      ],
      'react-router-v5': [
        /.*Router\.tsx?$/,
        /.*Routes\.tsx?$/,
        /route\.tsx?$/
      ],
      'next-app-router': [
        /page\.tsx?$/,
        /layout\.tsx?$/,
        /route\.tsx?$/
      ],
      'next-pages-router': [
        /.*\.tsx?$/  // All files in pages/ are routes
      ],
      'vue-router': [
        /router\.ts$/,
        /routes\.ts$/,
        /index\.ts$/
      ],
      'default': [
        /.*[Rr]outer?\.tsx?$/,
        /.*[Rr]outes\.tsx?$/,
        /route\.tsx?$/,
        /page\.tsx?$/
      ]
    };

    return patterns[framework] || patterns.default;
  }

  /**
   * Get directories to search for routes
   */
  private getRouteSearchDirectories(): string[] {
    return [
      'src',
      'app',
      'pages',
      'routes',
      'views'
    ];
  }

  /**
   * Get framework package name
   */
  private getFrameworkPackageName(framework: string): string {
    const packageNames: Record<string, string> = {
      'react-router-v6': 'react-router-dom',
      'react-router-v5': 'react-router-dom',
      'next-app-router': 'next',
      'next-pages-router': 'next',
      'vue-router': 'vue-router',
      'angular-router': '@angular/router',
      'svelte-kit': '@sveltejs/kit'
    };

    return packageNames[framework] || framework;
  }

  /**
   * Get learning metrics
   */
  getMetrics(): LearningMetrics {
    return this.metrics;
  }
}
