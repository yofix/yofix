"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedContextProvider = void 0;
const core = __importStar(require("@actions/core"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
const glob_1 = require("glob");
const sdk_1 = require("@anthropic-ai/sdk");
class EnhancedContextProvider {
    constructor(claudeApiKey) {
        this.contextCache = new Map();
        this.claude = new sdk_1.Anthropic({ apiKey: claudeApiKey });
    }
    async buildContext(basePath, focusFiles) {
        const cacheKey = `${basePath}:${focusFiles?.join(',')}`;
        if (this.contextCache.has(cacheKey)) {
            return this.contextCache.get(cacheKey);
        }
        core.info('🧠 Building Claude Code-like context...');
        const context = {
            projectStructure: await this.getProjectStructure(basePath),
            relevantFiles: new Map(),
            dependencies: await this.getDependencies(basePath),
            recentChanges: await this.getRecentChanges(basePath),
            testPatterns: await this.getTestPatterns(basePath)
        };
        if (focusFiles) {
            for (const file of focusFiles) {
                try {
                    const content = await fs_1.promises.readFile(path.join(basePath, file), 'utf-8');
                    context.relevantFiles.set(file, content);
                }
                catch (e) {
                }
            }
        }
        const relatedFiles = await this.findRelatedFiles(basePath, focusFiles);
        for (const file of relatedFiles) {
            if (!context.relevantFiles.has(file)) {
                try {
                    const content = await fs_1.promises.readFile(path.join(basePath, file), 'utf-8');
                    context.relevantFiles.set(file, content);
                }
                catch (e) {
                }
            }
        }
        this.contextCache.set(cacheKey, context);
        return context;
    }
    createContextualPrompt(basePrompt, context) {
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
    async analyzeWithContext(prompt, context) {
        const enhancedPrompt = this.createContextualPrompt(prompt, context);
        const response = await this.claude.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            temperature: 0.2,
            messages: [{
                    role: 'user',
                    content: enhancedPrompt
                }]
        });
        return response.content[0].type === 'text' ? response.content[0].text : '';
    }
    async getProjectStructure(basePath) {
        const files = await (0, glob_1.glob)('**/*.{ts,tsx,js,jsx,json}', {
            cwd: basePath,
            ignore: ['node_modules/**', 'dist/**', '.git/**'],
            nodir: true
        });
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
        }, {});
        return this.formatTree(tree);
    }
    formatTree(tree, indent = '') {
        return Object.entries(tree)
            .map(([key, value]) => {
            if (value === 'file') {
                return `${indent}├── ${key}`;
            }
            else {
                return `${indent}├── ${key}/\n${this.formatTree(value, indent + '│   ')}`;
            }
        })
            .join('\n');
    }
    async getDependencies(basePath) {
        try {
            const packageJson = JSON.parse(await fs_1.promises.readFile(path.join(basePath, 'package.json'), 'utf-8'));
            return {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };
        }
        catch (e) {
            return {};
        }
    }
    async getRecentChanges(basePath) {
        return [
            'Recent changes would be extracted from git log',
            'This would show what files were modified'
        ];
    }
    async getTestPatterns(basePath) {
        const testFiles = await (0, glob_1.glob)('**/*.{test,spec}.{ts,tsx,js,jsx}', {
            cwd: basePath,
            ignore: ['node_modules/**', 'dist/**']
        });
        const patterns = new Set();
        for (const file of testFiles.slice(0, 5)) {
            try {
                const content = await fs_1.promises.readFile(path.join(basePath, file), 'utf-8');
                if (content.includes('describe('))
                    patterns.add('Jest/Mocha style tests');
                if (content.includes('test('))
                    patterns.add('Jest test syntax');
                if (content.includes('it('))
                    patterns.add('BDD style tests');
                if (content.includes('@testing-library'))
                    patterns.add('React Testing Library');
                if (content.includes('playwright'))
                    patterns.add('Playwright e2e tests');
            }
            catch (e) {
            }
        }
        return Array.from(patterns);
    }
    async findRelatedFiles(basePath, focusFiles) {
        if (!focusFiles || focusFiles.length === 0)
            return [];
        const related = new Set();
        for (const file of focusFiles) {
            const baseName = path.basename(file, path.extname(file));
            const dir = path.dirname(file);
            const patterns = [
                `${dir}/${baseName}.test.*`,
                `${dir}/${baseName}.spec.*`,
                `${dir}/__tests__/${baseName}.*`,
                `${dir}/../__tests__/${baseName}.*`
            ];
            for (const pattern of patterns) {
                const matches = await (0, glob_1.glob)(pattern, { cwd: basePath });
                matches.forEach(m => related.add(m));
            }
            try {
                const content = await fs_1.promises.readFile(path.join(basePath, file), 'utf-8');
                const imports = content.match(/from ['"]([^'"]+)['"]/g) || [];
                for (const imp of imports) {
                    const importPath = imp.match(/from ['"]([^'"]+)['"]/)?.[1];
                    if (importPath && importPath.startsWith('.')) {
                        const resolved = path.resolve(path.dirname(file), importPath);
                        const relative = path.relative(basePath, resolved);
                        for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
                            const withExt = relative + ext;
                            try {
                                await fs_1.promises.access(path.join(basePath, withExt));
                                related.add(withExt);
                                break;
                            }
                            catch (e) {
                            }
                        }
                    }
                }
            }
            catch (e) {
            }
        }
        return Array.from(related);
    }
}
exports.EnhancedContextProvider = EnhancedContextProvider;
