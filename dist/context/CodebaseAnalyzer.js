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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodebaseAnalyzer = void 0;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const t = __importStar(require("@babel/types"));
class CodebaseAnalyzer {
    constructor(rootPath = process.cwd()) {
        this.rootPath = rootPath;
        this.context = this.initializeContext();
    }
    async analyzeRepository() {
        core.info('🔍 Analyzing codebase structure...');
        try {
            await this.detectFramework();
            this.context.structure = await this.buildFileTree(this.rootPath);
            this.context.routes = await this.extractRoutes();
            this.context.components = await this.mapComponents();
            this.context.patterns = await this.extractPatterns();
            this.context.dependencies = await this.analyzeDependencies();
            this.context.lastUpdated = Date.now();
            core.info(`✅ Codebase analysis complete: ${this.context.routes.length} routes, ${this.context.components.length} components found`);
            return this.context;
        }
        catch (error) {
            core.warning(`Codebase analysis failed: ${error.message}`);
            return this.context;
        }
    }
    initializeContext() {
        return {
            repository: {
                name: path.basename(this.rootPath),
                owner: '',
                defaultBranch: 'main'
            },
            framework: 'unknown',
            styleSystem: 'css',
            buildTool: 'unknown',
            structure: { name: 'root', path: '/', type: 'directory' },
            routes: [],
            components: [],
            patterns: [],
            dependencies: [],
            lastUpdated: Date.now(),
            version: '1.0.0'
        };
    }
    async detectFramework() {
        const packageJsonPath = path.join(this.rootPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            return;
        }
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
            if (deps['next']) {
                this.context.framework = 'nextjs';
                this.context.buildTool = 'nextjs';
            }
            else if (deps['react']) {
                this.context.framework = 'react';
                if (deps['vite']) {
                    this.context.buildTool = 'vite';
                }
                else if (deps['react-scripts']) {
                    this.context.buildTool = 'cra';
                }
                else {
                    this.context.buildTool = 'webpack';
                }
            }
            else if (deps['vue']) {
                this.context.framework = 'vue';
                this.context.buildTool = deps['vite'] ? 'vite' : 'webpack';
            }
            else if (deps['@angular/core']) {
                this.context.framework = 'angular';
            }
            if (deps['tailwindcss']) {
                this.context.styleSystem = 'tailwind';
            }
            else if (deps['styled-components']) {
                this.context.styleSystem = 'styled-components';
            }
            else if (deps['sass'] || deps['node-sass']) {
                this.context.styleSystem = 'sass';
            }
        }
        catch (error) {
            core.warning(`Failed to parse package.json: ${error.message}`);
        }
    }
    async buildFileTree(dirPath, relativePath = '') {
        const name = path.basename(dirPath);
        const tree = {
            name,
            path: relativePath || '/',
            type: 'directory',
            children: []
        };
        if (name === 'node_modules' || name.startsWith('.')) {
            return tree;
        }
        try {
            const items = fs.readdirSync(dirPath);
            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const itemRelativePath = path.join(relativePath, item);
                const stats = fs.statSync(itemPath);
                if (stats.isDirectory()) {
                    const subTree = await this.buildFileTree(itemPath, itemRelativePath);
                    tree.children?.push(subTree);
                }
                else if (stats.isFile()) {
                    const ext = path.extname(item);
                    if (['.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.sass'].includes(ext)) {
                        tree.children?.push({
                            name: item,
                            path: itemRelativePath,
                            type: 'file',
                            language: this.getLanguageFromExt(ext),
                            size: stats.size
                        });
                    }
                }
            }
        }
        catch (error) {
            core.warning(`Failed to read directory ${dirPath}: ${error.message}`);
        }
        return tree;
    }
    async extractRoutes() {
        const routes = [];
        switch (this.context.framework) {
            case 'nextjs':
                routes.push(...await this.extractNextJsRoutes());
                break;
            case 'react':
                routes.push(...await this.extractReactRouterRoutes());
                break;
            case 'vue':
                routes.push(...await this.extractVueRoutes());
                break;
        }
        if (!routes.find(r => r.path === '/')) {
            routes.push({
                path: '/',
                component: 'App',
                file: this.findMainFile()
            });
        }
        return routes;
    }
    async extractNextJsRoutes() {
        const routes = [];
        const appDir = path.join(this.rootPath, 'app');
        if (fs.existsSync(appDir)) {
            await this.extractNextJsAppRoutes(appDir, '', routes);
        }
        const pagesDir = path.join(this.rootPath, 'pages');
        if (fs.existsSync(pagesDir)) {
            await this.extractNextJsPagesRoutes(pagesDir, '', routes);
        }
        return routes;
    }
    async extractNextJsAppRoutes(dir, basePath, routes) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stats = fs.statSync(itemPath);
            if (stats.isDirectory()) {
                if (!item.startsWith('_') && !item.startsWith('.')) {
                    const routePath = basePath + '/' + item.replace(/\[(.+)\]/, ':$1');
                    await this.extractNextJsAppRoutes(itemPath, routePath, routes);
                }
            }
            else if (stats.isFile() && (item === 'page.tsx' || item === 'page.js')) {
                routes.push({
                    path: basePath || '/',
                    component: `Page${basePath.replace(/\//g, '')}`,
                    file: path.relative(this.rootPath, itemPath),
                    dynamic: basePath.includes(':')
                });
            }
        }
    }
    async extractNextJsPagesRoutes(dir, basePath, routes) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stats = fs.statSync(itemPath);
            if (stats.isDirectory()) {
                if (!item.startsWith('_') && !item.startsWith('.')) {
                    const routePath = basePath + '/' + item.replace(/\[(.+)\]/, ':$1');
                    await this.extractNextJsPagesRoutes(itemPath, routePath, routes);
                }
            }
            else if (stats.isFile() && ['.tsx', '.jsx', '.js'].includes(path.extname(item))) {
                const name = path.basename(item, path.extname(item));
                if (name !== '_app' && name !== '_document') {
                    const routePath = basePath + (name === 'index' ? '' : `/${name.replace(/\[(.+)\]/, ':$1')}`);
                    routes.push({
                        path: routePath || '/',
                        component: `Page${routePath.replace(/[/:]/g, '')}`,
                        file: path.relative(this.rootPath, itemPath),
                        dynamic: routePath.includes(':')
                    });
                }
            }
        }
    }
    async extractReactRouterRoutes() {
        const routes = [];
        const routeFiles = await this.findFilesContaining(['Route', 'Router', 'createBrowserRouter']);
        for (const file of routeFiles) {
            try {
                const content = fs.readFileSync(file, 'utf-8');
                const ast = (0, parser_1.parse)(content, {
                    sourceType: 'module',
                    plugins: ['jsx', 'typescript']
                });
                const self = this;
                (0, traverse_1.default)(ast, {
                    JSXElement(nodePath) {
                        if (t.isJSXIdentifier(nodePath.node.openingElement.name) &&
                            nodePath.node.openingElement.name.name === 'Route') {
                            const pathAttr = nodePath.node.openingElement.attributes.find(attr => t.isJSXAttribute(attr) && attr.name.name === 'path');
                            const componentAttr = nodePath.node.openingElement.attributes.find(attr => t.isJSXAttribute(attr) &&
                                (attr.name.name === 'component' || attr.name.name === 'element'));
                            if (pathAttr && t.isJSXAttribute(pathAttr) && pathAttr.value) {
                                let routePath = '';
                                if (t.isStringLiteral(pathAttr.value)) {
                                    routePath = pathAttr.value.value;
                                }
                                else if (t.isJSXExpressionContainer(pathAttr.value) &&
                                    t.isStringLiteral(pathAttr.value.expression)) {
                                    routePath = pathAttr.value.expression.value;
                                }
                                if (routePath) {
                                    routes.push({
                                        path: routePath,
                                        component: 'Component',
                                        file: path.relative(self.rootPath, file),
                                        dynamic: routePath.includes(':')
                                    });
                                }
                            }
                        }
                    }
                });
            }
            catch (error) {
                core.warning(`Failed to parse ${file}: ${error.message}`);
            }
        }
        return routes;
    }
    async extractVueRoutes() {
        return [];
    }
    async mapComponents() {
        const components = [];
        const componentFiles = await this.findComponentFiles();
        for (const file of componentFiles) {
            try {
                const content = fs.readFileSync(file, 'utf-8');
                const component = await this.analyzeComponent(file, content);
                if (component) {
                    components.push(component);
                }
            }
            catch (error) {
                core.warning(`Failed to analyze component ${file}: ${error.message}`);
            }
        }
        return components;
    }
    async analyzeComponent(filePath, content) {
        const ext = path.extname(filePath);
        const name = path.basename(filePath, ext);
        if (name.includes('.test') || name.includes('.spec')) {
            return null;
        }
        const component = {
            name,
            type: 'unknown',
            file: path.relative(this.rootPath, filePath),
            dependencies: [],
            hasStyles: false
        };
        try {
            const ast = (0, parser_1.parse)(content, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript']
            });
            (0, traverse_1.default)(ast, {
                FunctionDeclaration(path) {
                    if (path.node.id && /^[A-Z]/.test(path.node.id.name)) {
                        component.name = path.node.id.name;
                        component.type = 'functional';
                    }
                },
                VariableDeclarator(path) {
                    if (t.isIdentifier(path.node.id) && /^[A-Z]/.test(path.node.id.name) &&
                        (t.isArrowFunctionExpression(path.node.init) ||
                            t.isFunctionExpression(path.node.init))) {
                        component.name = path.node.id.name;
                        component.type = 'functional';
                    }
                },
                ClassDeclaration(path) {
                    if (path.node.id && /^[A-Z]/.test(path.node.id.name)) {
                        component.name = path.node.id.name;
                        component.type = 'class';
                    }
                },
                ImportDeclaration(path) {
                    const source = path.node.source.value;
                    if (!source.startsWith('.') && !source.startsWith('@/')) {
                        component.dependencies.push(source);
                    }
                }
            });
            if (content.includes('styled-components') ||
                content.includes('.module.css') ||
                content.includes('makeStyles') ||
                content.includes('sx=')) {
                component.hasStyles = true;
            }
        }
        catch (error) {
        }
        return component.type !== 'unknown' ? component : null;
    }
    async extractPatterns() {
        const patterns = [];
        const styleFiles = await this.findStyleFiles();
        for (const file of styleFiles) {
            try {
                const content = fs.readFileSync(file, 'utf-8');
                const filePatterns = this.extractStylePatterns(content, file);
                patterns.push(...filePatterns);
            }
            catch (error) {
                core.warning(`Failed to extract patterns from ${file}: ${error.message}`);
            }
        }
        return patterns;
    }
    extractStylePatterns(content, filePath) {
        const patterns = [];
        const positioningRegex = /position:\s*(fixed|absolute|sticky)[^}]+}/gs;
        const positioningMatches = content.matchAll(positioningRegex);
        for (const match of positioningMatches) {
            patterns.push({
                id: `pos-${patterns.length}`,
                type: 'positioning',
                description: 'Positioning pattern',
                code: match[0],
                usage: path.basename(filePath),
                files: [filePath]
            });
        }
        const mediaQueryRegex = /@media[^{]+{[^}]+}/gs;
        const mediaMatches = content.matchAll(mediaQueryRegex);
        for (const match of mediaMatches) {
            patterns.push({
                id: `resp-${patterns.length}`,
                type: 'responsive',
                description: 'Responsive pattern',
                code: match[0],
                usage: 'media query',
                files: [filePath]
            });
        }
        return patterns;
    }
    async analyzeDependencies() {
        const dependencies = [];
        const packageJsonPath = path.join(this.rootPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            return dependencies;
        }
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
                dependencies.push({
                    name,
                    version: version,
                    type: 'production',
                    isUILibrary: this.isUILibrary(name)
                });
            }
            for (const [name, version] of Object.entries(packageJson.devDependencies || {})) {
                dependencies.push({
                    name,
                    version: version,
                    type: 'development',
                    isUILibrary: this.isUILibrary(name)
                });
            }
        }
        catch (error) {
            core.warning(`Failed to analyze dependencies: ${error.message}`);
        }
        return dependencies;
    }
    async findFilesContaining(keywords) {
        const files = [];
        const searchDir = (dir) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const itemPath = path.join(dir, item);
                const stats = fs.statSync(itemPath);
                if (stats.isDirectory() && !item.includes('node_modules') && !item.startsWith('.')) {
                    searchDir(itemPath);
                }
                else if (stats.isFile() && ['.js', '.jsx', '.ts', '.tsx'].includes(path.extname(item))) {
                    try {
                        const content = fs.readFileSync(itemPath, 'utf-8');
                        if (keywords.some(keyword => content.includes(keyword))) {
                            files.push(itemPath);
                        }
                    }
                    catch (error) {
                    }
                }
            }
        };
        searchDir(this.rootPath);
        return files;
    }
    async findComponentFiles() {
        const files = [];
        const componentDirs = ['src/components', 'components', 'src', 'app'];
        for (const dir of componentDirs) {
            const dirPath = path.join(this.rootPath, dir);
            if (fs.existsSync(dirPath)) {
                this.findFilesInDir(dirPath, ['.jsx', '.tsx'], files);
            }
        }
        return files;
    }
    async findStyleFiles() {
        const files = [];
        this.findFilesInDir(this.rootPath, ['.css', '.scss', '.sass'], files);
        return files;
    }
    findFilesInDir(dir, extensions, results) {
        if (dir.includes('node_modules') || path.basename(dir).startsWith('.')) {
            return;
        }
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const itemPath = path.join(dir, item);
                const stats = fs.statSync(itemPath);
                if (stats.isDirectory()) {
                    this.findFilesInDir(itemPath, extensions, results);
                }
                else if (stats.isFile() && extensions.includes(path.extname(item))) {
                    results.push(itemPath);
                }
            }
        }
        catch (error) {
        }
    }
    getLanguageFromExt(ext) {
        const map = {
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.css': 'css',
            '.scss': 'scss',
            '.sass': 'sass'
        };
        return map[ext] || 'unknown';
    }
    findMainFile() {
        const candidates = [
            'src/App.tsx',
            'src/App.jsx',
            'src/App.js',
            'src/index.tsx',
            'src/index.jsx',
            'src/index.js',
            'pages/_app.tsx',
            'pages/_app.js',
            'app/layout.tsx',
            'app/layout.js'
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(path.join(this.rootPath, candidate))) {
                return candidate;
            }
        }
        return 'src/App.js';
    }
    isUILibrary(name) {
        const uiLibraries = [
            'react', 'vue', 'angular',
            '@mui/material', 'antd', 'bootstrap',
            'tailwindcss', 'styled-components',
            '@chakra-ui/react', 'semantic-ui-react'
        ];
        return uiLibraries.includes(name);
    }
    getContext() {
        return this.context;
    }
}
exports.CodebaseAnalyzer = CodebaseAnalyzer;
