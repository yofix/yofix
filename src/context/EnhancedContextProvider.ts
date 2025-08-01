import * as core from '@actions/core';
import { promises as fs } from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { Anthropic } from '@anthropic-ai/sdk';
import config from '../config';

export interface CodeContext {
  projectStructure: string;
  relevantFiles: Map<string, string>;
  dependencies: Record<string, string>;
  recentChanges: string[];
  testPatterns: string[];
}

/**
 * Provides Claude Code-like context understanding
 */
export class EnhancedContextProvider {
  private claude: Anthropic;
  private contextCache: Map<string, CodeContext> = new Map();
  
  constructor(claudeApiKey: string) {
    this.claude = new Anthropic({ apiKey: claudeApiKey });
  }
  
  /**
   * Build comprehensive context like Claude Code would have
   */
  async buildContext(basePath: string, focusFiles?: string[]): Promise<CodeContext> {
    const cacheKey = `${basePath}:${focusFiles?.join(',')}`;
    if (this.contextCache.has(cacheKey)) {
      return this.contextCache.get(cacheKey)!;
    }
    
    core.info('🧠 Building Claude Code-like context...');
    
    const context: CodeContext = {
      projectStructure: await this.getProjectStructure(basePath),
      relevantFiles: new Map(),
      dependencies: await this.getDependencies(basePath),
      recentChanges: await this.getRecentChanges(basePath),
      testPatterns: await this.getTestPatterns(basePath)
    };
    
    // Load relevant files
    if (focusFiles && Array.isArray(focusFiles)) {
      // Expand glob patterns and regular files
      const expandedFiles: string[] = [];
      for (const filePattern of focusFiles) {
        if (filePattern.includes('*') || filePattern.includes('{')) {
          // It's a glob pattern, expand it
          try {
            const matches = await glob(filePattern, {
              cwd: basePath,
              ignore: ['node_modules/**', 'dist/**', '.git/**'],
              nodir: true
            });
            expandedFiles.push(...matches);
          } catch (e) {
            core.debug(`Failed to expand glob pattern ${filePattern}: ${e}`);
          }
        } else {
          // Regular file path
          expandedFiles.push(filePattern);
        }
      }
      
      // Load the expanded files
      for (const file of expandedFiles) {
        try {
          const content = await fs.readFile(path.join(basePath, file), 'utf-8');
          context.relevantFiles.set(file, content);
        } catch (e) {
          // File might not exist
        }
      }
    }
    
    // Auto-detect related files
    const relatedFiles = await this.findRelatedFiles(basePath, focusFiles);
    for (const file of relatedFiles) {
      if (!context.relevantFiles.has(file)) {
        try {
          const content = await fs.readFile(path.join(basePath, file), 'utf-8');
          context.relevantFiles.set(file, content);
        } catch (e) {
          // Skip
        }
      }
    }
    
    this.contextCache.set(cacheKey, context);
    return context;
  }
  
  /**
   * Create an enhanced prompt with Claude Code-like context
   */
  createContextualPrompt(basePrompt: string, context: CodeContext): string {
    const fileContext = Array.from(context.relevantFiles.entries())
      .map(([file, content]) => `// ${file}\n${content}`)
      .join('\n\n---\n\n');
    
    return `You are analyzing a codebase with deep understanding like Claude Code would have.

## Project Structure:
${context.projectStructure}

## Dependencies:
${JSON.stringify(context.dependencies, null, 2)}

## Recent Changes:
${context.recentChanges.join('\n')}

## Test Patterns Found:
${context.testPatterns.join('\n')}

## Relevant Code Files:
${fileContext}

## Task:
${basePrompt}

Provide analysis with the same depth and accuracy as Claude Code would, understanding:
- How components interact
- Common patterns in the codebase
- Testing conventions
- Code style and best practices`;
  }
  
  /**
   * Analyze with enhanced context
   */
  async analyzeWithContext(prompt: string, context: CodeContext): Promise<string> {
    const enhancedPrompt = this.createContextualPrompt(prompt, context);
    
    const response = await this.claude.messages.create({
      model: config.get('ai.claude.models.contextual'),
      max_tokens: config.get('ai.claude.maxTokens.analysis'),
      temperature: config.get('ai.claude.temperature', 0.2),
      messages: [{
        role: 'user',
        content: enhancedPrompt
      }]
    });
    
    return response.content[0].type === 'text' ? response.content[0].text : '';
  }
  
  private async getProjectStructure(basePath: string): Promise<string> {
    const files = await glob('**/*.{ts,tsx,js,jsx,json}', {
      cwd: basePath,
      ignore: ['node_modules/**', 'dist/**', '.git/**'],
      nodir: true
    });
    
    // Create tree structure
    const tree = files.sort().reduce((acc, file) => {
      const parts = file.split('/');
      let current = acc;
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = 'file';
      return acc;
    }, {} as any);
    
    return this.formatTree(tree);
  }
  
  private formatTree(tree: any, indent = ''): string {
    return Object.entries(tree)
      .map(([key, value]) => {
        if (value === 'file') {
          return `${indent}├── ${key}`;
        } else {
          return `${indent}├── ${key}/\n${this.formatTree(value, indent + '│   ')}`;
        }
      })
      .join('\n');
  }
  
  private async getDependencies(basePath: string): Promise<Record<string, string>> {
    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(basePath, 'package.json'), 'utf-8')
      );
      return {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
    } catch (e) {
      return {};
    }
  }
  
  private async getRecentChanges(basePath: string): Promise<string[]> {
    // In a real implementation, this would use git
    return [
      'Recent changes would be extracted from git log',
      'This would show what files were modified'
    ];
  }
  
  private async getTestPatterns(basePath: string): Promise<string[]> {
    const testFiles = await glob('**/*.{test,spec}.{ts,tsx,js,jsx}', {
      cwd: basePath,
      ignore: ['node_modules/**', 'dist/**']
    });
    
    // Extract common patterns
    const patterns = new Set<string>();
    
    for (const file of testFiles.slice(0, 5)) { // Sample a few
      try {
        const content = await fs.readFile(path.join(basePath, file), 'utf-8');
        
        // Detect testing library
        if (content.includes('describe(')) patterns.add('Jest/Mocha style tests');
        if (content.includes('test(')) patterns.add('Jest test syntax');
        if (content.includes('it(')) patterns.add('BDD style tests');
        if (content.includes('@testing-library')) patterns.add('React Testing Library');
        if (content.includes('playwright')) patterns.add('Playwright e2e tests');
      } catch (e) {
        // Skip
      }
    }
    
    return Array.from(patterns);
  }
  
  private async findRelatedFiles(basePath: string, focusFiles?: string[]): Promise<string[]> {
    if (!focusFiles || !Array.isArray(focusFiles) || focusFiles.length === 0) return [];
    
    const related = new Set<string>();
    
    for (const file of focusFiles) {
      // Find test files
      const baseName = path.basename(file, path.extname(file));
      const dir = path.dirname(file);
      
      const patterns = [
        `${dir}/${baseName}.test.*`,
        `${dir}/${baseName}.spec.*`,
        `${dir}/__tests__/${baseName}.*`,
        `${dir}/../__tests__/${baseName}.*`
      ];
      
      for (const pattern of patterns) {
        const matches = await glob(pattern, { cwd: basePath });
        matches.forEach(m => related.add(m));
      }
      
      // Find imports
      try {
        const content = await fs.readFile(path.join(basePath, file), 'utf-8');
        const imports = content.match(/from ['"]([^'"]+)['"]/g) || [];
        
        for (const imp of imports) {
          const importPath = imp.match(/from ['"]([^'"]+)['"]/)?.[1];
          if (importPath && importPath.startsWith('.')) {
            const resolved = path.resolve(path.dirname(file), importPath);
            const relative = path.relative(basePath, resolved);
            
            // Try with extensions
            for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
              const withExt = relative + ext;
              try {
                await fs.access(path.join(basePath, withExt));
                related.add(withExt);
                break;
              } catch (e) {
                // Try next
              }
            }
          }
        }
      } catch (e) {
        // Skip
      }
    }
    
    return Array.from(related);
  }
}