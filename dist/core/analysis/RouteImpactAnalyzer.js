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
exports.RouteImpactAnalyzer = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const CodebaseAnalyzer_1 = require("../../context/CodebaseAnalyzer");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class RouteImpactAnalyzer {
    constructor(githubToken) {
        this.githubToken = githubToken;
        this.codebaseContext = null;
        this.componentUsageMap = new Map();
        this.octokit = github.getOctokit(githubToken);
    }
    async analyzePRImpact(prNumber) {
        core.info('🔍 Analyzing route impact from PR changes...');
        const changedFiles = await this.getChangedFiles(prNumber);
        const analyzer = new CodebaseAnalyzer_1.CodebaseAnalyzer();
        this.codebaseContext = await analyzer.analyzeRepository();
        await this.buildComponentUsageMap();
        const routeImpacts = await this.analyzeRouteImpacts(changedFiles);
        const affectedRoutes = routeImpacts.filter(impact => impact.directChanges.length > 0 ||
            impact.componentChanges.length > 0 ||
            impact.styleChanges.length > 0);
        const sharedComponents = this.findSharedComponents(affectedRoutes);
        return {
            affectedRoutes,
            sharedComponents,
            totalFilesChanged: changedFiles.length,
            totalRoutesAffected: affectedRoutes.length
        };
    }
    async getChangedFiles(prNumber) {
        const { data: files } = await this.octokit.rest.pulls.listFiles({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber,
            per_page: 100
        });
        return files
            .filter(file => file.status !== 'removed')
            .map(file => file.filename);
    }
    async buildComponentUsageMap() {
        if (!this.codebaseContext)
            return;
        for (const route of this.codebaseContext.routes) {
            const routeComponents = await this.getRouteComponents(route);
            for (const component of routeComponents) {
                if (!this.componentUsageMap.has(component)) {
                    this.componentUsageMap.set(component, new Set());
                }
                this.componentUsageMap.get(component).add(route.path);
            }
        }
    }
    async getRouteComponents(route) {
        const components = new Set();
        const visited = new Set();
        await this.collectComponentsRecursively(route.file, components, visited);
        return Array.from(components);
    }
    async collectComponentsRecursively(filePath, components, visited) {
        if (visited.has(filePath))
            return;
        visited.add(filePath);
        try {
            const fullPath = path.join(process.cwd(), filePath);
            if (!fs.existsSync(fullPath))
                return;
            const content = fs.readFileSync(fullPath, 'utf-8');
            const importRegex = /import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
            const matches = content.matchAll(importRegex);
            for (const match of matches) {
                const importPath = match[1];
                if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
                    continue;
                }
                const resolvedPath = this.resolveImportPath(filePath, importPath);
                if (resolvedPath && this.isComponentFile(resolvedPath)) {
                    components.add(resolvedPath);
                    await this.collectComponentsRecursively(resolvedPath, components, visited);
                }
            }
        }
        catch (error) {
            core.debug(`Failed to analyze ${filePath}: ${error}`);
        }
    }
    resolveImportPath(fromFile, importPath) {
        const fromDir = path.dirname(fromFile);
        let resolvedPath;
        if (importPath.startsWith('@/')) {
            resolvedPath = importPath.replace('@/', 'src/');
        }
        else {
            resolvedPath = path.join(fromDir, importPath);
        }
        const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
        for (const ext of extensions) {
            const fullPath = resolvedPath.endsWith(ext) ? resolvedPath : resolvedPath + ext;
            if (fs.existsSync(path.join(process.cwd(), fullPath))) {
                return fullPath;
            }
        }
        return null;
    }
    isComponentFile(filePath) {
        const ext = path.extname(filePath);
        const name = path.basename(filePath, ext);
        return (['.tsx', '.jsx'].includes(ext) &&
            !name.includes('.test') &&
            !name.includes('.spec') &&
            !name.includes('.stories') &&
            (name[0] === name[0].toUpperCase() || filePath.includes('components/')));
    }
    async analyzeRouteImpacts(changedFiles) {
        if (!this.codebaseContext)
            return [];
        const impacts = [];
        for (const route of this.codebaseContext.routes) {
            const impact = await this.analyzeRouteImpact(route, changedFiles);
            impacts.push(impact);
        }
        return impacts;
    }
    async analyzeRouteImpact(route, changedFiles) {
        const directChanges = [];
        const componentChanges = [];
        const styleChanges = [];
        const sharedComponents = [];
        if (changedFiles.includes(route.file)) {
            directChanges.push(route.file);
        }
        const routeComponents = await this.getRouteComponents(route);
        for (const component of routeComponents) {
            if (changedFiles.includes(component)) {
                componentChanges.push(component);
                const usedByRoutes = this.componentUsageMap.get(component);
                if (usedByRoutes && usedByRoutes.size > 1) {
                    sharedComponents.push(component);
                }
            }
        }
        const styleFiles = changedFiles.filter(file => file.endsWith('.css') ||
            file.endsWith('.scss') ||
            file.endsWith('.sass') ||
            file.includes('.module.'));
        const globalStyles = styleFiles.filter(file => file.includes('global') ||
            file.includes('app.css') ||
            file.includes('index.css') ||
            file.includes('styles/'));
        if (globalStyles.length > 0) {
            styleChanges.push(...globalStyles);
        }
        const routeDir = path.dirname(route.file);
        const routeSpecificStyles = styleFiles.filter(file => file.startsWith(routeDir) ||
            file.includes(path.basename(route.file, path.extname(route.file))));
        styleChanges.push(...routeSpecificStyles);
        return {
            route: route.path,
            directChanges: [...new Set(directChanges)],
            componentChanges: [...new Set(componentChanges)],
            styleChanges: [...new Set(styleChanges)],
            sharedComponents: [...new Set(sharedComponents)]
        };
    }
    findSharedComponents(affectedRoutes) {
        const sharedMap = new Map();
        const allChangedComponents = new Set();
        for (const route of affectedRoutes) {
            route.componentChanges.forEach(c => allChangedComponents.add(c));
        }
        for (const component of allChangedComponents) {
            const routes = this.componentUsageMap.get(component);
            if (routes && routes.size > 1) {
                const affectedRoutesPaths = affectedRoutes.map(r => r.route);
                const sharedRoutes = Array.from(routes).filter(r => affectedRoutesPaths.includes(r));
                if (sharedRoutes.length > 1) {
                    sharedMap.set(component, sharedRoutes);
                }
            }
        }
        return sharedMap;
    }
    formatImpactTree(tree) {
        if (tree.affectedRoutes.length === 0) {
            return '✅ No routes affected by changes in this PR';
        }
        let output = '## 🌳 Route Impact Tree\n\n';
        output += `📊 **${tree.totalFilesChanged}** files changed → **${tree.totalRoutesAffected}** routes affected\n\n`;
        if (tree.sharedComponents.size > 0) {
            output += '⚠️ **Shared Components** (changes affect multiple routes):\n';
            for (const [component, routes] of tree.sharedComponents) {
                const componentName = path.basename(component);
                output += `- \`${componentName}\` → affects ${routes.map(r => `\`${r}\``).join(', ')}\n`;
            }
            output += '\n';
        }
        output += '```\nRoute Tree:\n';
        for (let i = 0; i < tree.affectedRoutes.length; i++) {
            const impact = tree.affectedRoutes[i];
            const isLast = i === tree.affectedRoutes.length - 1;
            const prefix = isLast ? '└── ' : '├── ';
            const childPrefix = isLast ? '    ' : '│   ';
            output += `${prefix}${impact.route}\n`;
            for (const file of impact.directChanges) {
                output += `${childPrefix}├── ${path.basename(file)} (route file)\n`;
            }
            for (const file of impact.componentChanges) {
                const isShared = impact.sharedComponents.includes(file);
                const label = isShared ? 'shared component' : 'component';
                output += `${childPrefix}├── ${path.basename(file)} (${label})\n`;
            }
            for (let j = 0; j < impact.styleChanges.length; j++) {
                const file = impact.styleChanges[j];
                const isLastFile = j === impact.styleChanges.length - 1 &&
                    impact.directChanges.length === 0 &&
                    impact.componentChanges.length === 0;
                const filePrefix = isLastFile ? '└── ' : '├── ';
                output += `${childPrefix}${filePrefix}${path.basename(file)} (styles)\n`;
            }
        }
        output += '```';
        return output;
    }
}
exports.RouteImpactAnalyzer = RouteImpactAnalyzer;
