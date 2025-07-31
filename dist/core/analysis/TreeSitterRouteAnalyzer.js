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
exports.TreeSitterRouteAnalyzer = void 0;
const tree_sitter_1 = __importDefault(require("tree-sitter"));
const typescript_1 = __importDefault(require("tree-sitter-typescript/typescript"));
const tsx_1 = __importDefault(require("tree-sitter-typescript/tsx"));
const tree_sitter_javascript_1 = __importDefault(require("tree-sitter-javascript"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const crypto_1 = __importDefault(require("crypto"));
const ComponentRouteMapper_1 = require("./ComponentRouteMapper");
const StorageFactory_1 = require("../../providers/storage/StorageFactory");
class TreeSitterRouteAnalyzer {
    constructor(rootPath = process.cwd(), storageProvider) {
        this.rootPath = rootPath;
        this.astCache = new Map();
        this.fileCache = new Map();
        this.importGraph = new Map();
        this.routeCache = new Map();
        this.componentToRoutes = new Map();
        this.storageProvider = null;
        this.tsParser = new tree_sitter_1.default();
        this.tsParser.setLanguage(typescript_1.default);
        this.tsxParser = new tree_sitter_1.default();
        this.tsxParser.setLanguage(tsx_1.default);
        this.jsParser = new tree_sitter_1.default();
        this.jsParser.setLanguage(tree_sitter_javascript_1.default);
        this.parser = this.tsxParser;
        this.componentRouteMapper = new ComponentRouteMapper_1.ComponentRouteMapper(rootPath);
        this.storageProvider = storageProvider || null;
        const repoName = path.basename(rootPath);
        this.cacheKey = `yofix-cache/${repoName}/import-graph.json`;
    }
    async clearCache() {
        core.info('🗑️ Clearing all route analysis caches...');
        this.astCache.clear();
        this.fileCache.clear();
        this.importGraph.clear();
        this.routeCache.clear();
        this.componentToRoutes.clear();
        try {
            if (this.storageProvider) {
                await this.storageProvider.deleteFile?.(this.cacheKey);
                core.info(`✅ Cleared cache from storage: ${this.cacheKey}`);
            }
            else {
                const localCacheDir = path.join(this.rootPath, '.yofix-cache');
                if (fs.existsSync(localCacheDir)) {
                    await fs.promises.rm(localCacheDir, { recursive: true, force: true });
                    core.info(`✅ Cleared local cache directory: ${localCacheDir}`);
                }
            }
        }
        catch (error) {
            core.warning(`Failed to clear persistent cache: ${error}`);
        }
    }
    async initialize(forceRebuild = false) {
        const start = Date.now();
        if (!this.storageProvider) {
            try {
                const storageProviderName = core.getInput('storage-provider') || 'github';
                if (storageProviderName === 'github') {
                    core.info('Using local cache for import graph (GitHub storage)');
                }
                else {
                    this.storageProvider = await StorageFactory_1.StorageFactory.createFromInputs();
                }
            }
            catch (error) {
                core.warning(`Storage provider initialization failed, using local cache: ${error}`);
            }
        }
        if (forceRebuild) {
            core.info('🔄 Force rebuild requested, clearing cache...');
            await this.clearCache();
        }
        if (!forceRebuild && await this.loadPersistedGraph()) {
            core.info(`✅ Loaded import graph from cache in ${Date.now() - start}ms`);
            return;
        }
        core.info('🔨 Building import graph with Tree-sitter...');
        await this.buildImportGraph();
        await this.persistGraph();
        core.info(`✅ Built import graph in ${Date.now() - start}ms`);
    }
    async detectRoutes(changedFiles) {
        const results = new Map();
        await this.updateGraphForFiles(changedFiles);
        const promises = changedFiles.map(file => this.detectRoutesForFile(file).then(routes => ({ file, routes })));
        const fileRoutes = await Promise.all(promises);
        fileRoutes.forEach(({ file, routes }) => {
            if (routes.length > 0) {
                results.set(file, routes);
            }
        });
        return results;
    }
    async getRouteInfo(changedFiles) {
        const results = new Map();
        for (const file of changedFiles) {
            const routes = await this.detectRoutesForFile(file);
            const node = this.importGraph.get(file);
            const fileNode = this.fileCache.get(file);
            let routeFileType;
            if (node?.isRouteFile) {
                routeFileType = this.classifyRouteFile(file);
            }
            results.set(file, {
                routes,
                isRouteDefiner: node?.isRouteFile || false,
                importChain: [],
                routeFileType
            });
        }
        return results;
    }
    async buildImportGraph() {
        const files = await this.getAllCodeFiles();
        const totalFiles = files.length;
        let processed = 0;
        const batchSize = 50;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            await Promise.all(batch.map(file => this.processFile(file)));
            processed += batch.length;
            if (processed % 100 === 0) {
                core.info(`Processed ${processed}/${totalFiles} files...`);
            }
        }
        this.identifyEntryPoints();
    }
    async processFile(filePath) {
        const cached = this.getCachedFile(filePath);
        if (cached)
            return cached;
        try {
            const fullPath = path.join(this.rootPath, filePath);
            const stats = await fs.promises.stat(fullPath);
            if (stats.size > 1024 * 1024) {
                core.debug(`Skipping large file ${filePath} (${stats.size} bytes)`);
                return {
                    path: filePath,
                    imports: [],
                    exports: [],
                    routes: [],
                    hash: '',
                    lastModified: Date.now()
                };
            }
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            if (content.includes('\0')) {
                core.debug(`Skipping binary file ${filePath}`);
                return {
                    path: filePath,
                    imports: [],
                    exports: [],
                    routes: [],
                    hash: '',
                    lastModified: Date.now()
                };
            }
            const hash = this.getFileHash(content);
            let parser;
            let tree;
            try {
                if (filePath.endsWith('.tsx')) {
                    parser = this.tsxParser;
                }
                else if (filePath.endsWith('.ts')) {
                    parser = this.tsParser;
                }
                else if (filePath.endsWith('.jsx')) {
                    parser = this.tsxParser;
                }
                else {
                    parser = this.jsParser;
                }
                tree = parser.parse(content);
            }
            catch (parseError) {
                core.debug(`Parse error for ${filePath}: ${parseError}. Trying TSX parser as fallback.`);
                try {
                    tree = this.tsxParser.parse(content);
                }
                catch (fallbackError) {
                    core.debug(`Fallback parse also failed for ${filePath}: ${fallbackError}`);
                    throw fallbackError;
                }
            }
            this.astCache.set(filePath, { tree, hash });
            const imports = this.extractImports(tree, filePath, content);
            const exports = this.extractExports(tree, content);
            const routes = this.extractRoutes(tree, filePath, content);
            const fileNode = {
                path: filePath,
                imports,
                exports,
                routes,
                hash,
                lastModified: Date.now()
            };
            this.fileCache.set(filePath, fileNode);
            this.updateImportGraph(filePath, fileNode);
            return fileNode;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                core.debug(`File not found: ${filePath}`);
            }
            else if (error.message?.includes('Invalid argument')) {
                core.debug(`Invalid argument error for ${filePath} - likely a parsing issue with special characters or encoding`);
            }
            else {
                core.debug(`Failed to process ${filePath}: ${error.message || error}`);
            }
            return {
                path: filePath,
                imports: [],
                exports: [],
                routes: [],
                hash: '',
                lastModified: Date.now()
            };
        }
    }
    extractImports(tree, filePath, content) {
        const imports = [];
        const importStatements = tree.rootNode.descendantsOfType('import_statement');
        for (const node of importStatements) {
            const sourceNode = node.childForFieldName('source');
            if (sourceNode) {
                const source = content.slice(sourceNode.startIndex + 1, sourceNode.endIndex - 1);
                const resolved = this.resolveImportPath(filePath, source);
                if (resolved) {
                    imports.push({
                        source: resolved,
                        specifiers: [],
                        line: sourceNode.startPosition.row + 1
                    });
                }
            }
        }
        const callExpressions = tree.rootNode.descendantsOfType('call_expression');
        for (const call of callExpressions) {
            const funcNode = call.childForFieldName('function');
            if (funcNode && content.slice(funcNode.startIndex, funcNode.endIndex) === 'import') {
                const args = call.childForFieldName('arguments');
                if (args) {
                    const stringNodes = args.descendantsOfType('string');
                    if (stringNodes.length > 0) {
                        const importPath = content.slice(stringNodes[0].startIndex + 1, stringNodes[0].endIndex - 1);
                        const resolved = this.resolveImportPath(filePath, importPath);
                        if (resolved) {
                            imports.push({
                                source: resolved,
                                specifiers: ['default'],
                                line: call.startPosition.row + 1
                            });
                        }
                    }
                }
            }
        }
        return imports;
    }
    extractExports(tree, content) {
        const exports = [];
        const exportNodes = tree.rootNode.descendantsOfType(['export_statement', 'export_specifier']);
        for (const node of exportNodes) {
            const text = content.slice(node.startIndex, node.endIndex);
            if (text.includes('export default')) {
                exports.push('default');
            }
            else {
                const match = text.match(/export\s+(?:const|let|var|function|class)\s+(\w+)/);
                if (match) {
                    exports.push(match[1]);
                }
            }
        }
        return exports;
    }
    extractRoutes(tree, filePath, content) {
        const routes = [];
        const jsxElements = tree.rootNode.descendantsOfType('jsx_element');
        for (const element of jsxElements) {
            const openingElement = element.childForFieldName('opening_element');
            if (!openingElement)
                continue;
            const attributes = openingElement.descendantsOfType('jsx_attribute');
            for (const attr of attributes) {
                const nameNode = attr.childForFieldName('name');
                if (nameNode && content.slice(nameNode.startIndex, nameNode.endIndex) === 'path') {
                    const valueNode = attr.childForFieldName('value');
                    if (valueNode) {
                        const pathValue = this.extractStringValue(valueNode, content);
                        if (pathValue) {
                            routes.push({
                                path: pathValue,
                                component: this.extractComponentName(element, attributes, content),
                                file: filePath,
                                line: element.startPosition.row + 1
                            });
                        }
                    }
                }
            }
        }
        const objectExpressions = tree.rootNode.descendantsOfType('object');
        for (const obj of objectExpressions) {
            let hasPath = false;
            let pathValue = '';
            let hasElement = false;
            let hasIndex = false;
            let componentValue = '';
            const directPairs = [];
            for (const child of obj.children) {
                if (child.type === 'pair') {
                    directPairs.push(child);
                }
            }
            for (const pair of directPairs) {
                const keyNode = pair.childForFieldName('key');
                const valueNode = pair.childForFieldName('value');
                if (keyNode && valueNode) {
                    const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
                    if (keyName === 'path') {
                        pathValue = this.extractStringValue(valueNode, content) || '';
                        hasPath = true;
                    }
                    else if (keyName === 'element' || keyName === 'component') {
                        hasElement = true;
                        if (valueNode.type === 'jsx_self_closing_element') {
                            const identifier = valueNode.childForFieldName('name');
                            if (identifier) {
                                componentValue = content.slice(identifier.startIndex, identifier.endIndex);
                            }
                        }
                        else if (valueNode.type === 'jsx_element') {
                            const opening = valueNode.childForFieldName('opening_element');
                            if (opening) {
                                const identifier = opening.childForFieldName('name');
                                if (identifier) {
                                    componentValue = content.slice(identifier.startIndex, identifier.endIndex);
                                }
                            }
                        }
                    }
                    else if (keyName === 'index') {
                        const indexValue = content.slice(valueNode.startIndex, valueNode.endIndex);
                        if (indexValue === 'true') {
                            hasIndex = true;
                            if (!hasPath) {
                                pathValue = '(index)';
                            }
                        }
                    }
                }
            }
            if (hasPath || hasIndex || hasElement) {
                routes.push({
                    path: pathValue || '/',
                    component: componentValue || 'unknown',
                    file: filePath,
                    line: obj.startPosition.row + 1
                });
            }
        }
        if (filePath.endsWith('.vue') || content.includes('vue-router') || content.includes('createRouter')) {
        }
        if (filePath.endsWith('.ts') && (content.includes('@angular/router') || content.includes('RouterModule'))) {
        }
        if (filePath.includes('/routes/') && filePath.endsWith('.svelte')) {
            const routeMatch = filePath.match(/routes(\/.+?)(?:\/\+page)?\.svelte$/);
            if (routeMatch) {
                routes.push({
                    path: routeMatch[1],
                    component: 'SvelteKit Page',
                    file: filePath,
                    line: 1
                });
            }
        }
        if (filePath.includes('/app/') && (filePath.endsWith('/page.tsx') || filePath.endsWith('/page.jsx') ||
            filePath.endsWith('/page.ts') || filePath.endsWith('/page.js'))) {
            const routeMatch = filePath.match(/app(\/.+?)\/page\.[jt]sx?$/);
            if (routeMatch) {
                let routePath = routeMatch[1];
                routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');
                routePath = routePath.replace(/\[\.\.\.([^\]]+)\]/g, '*');
                routePath = routePath.replace(/\[\[\.\.\.([^\]]+)\]\]/g, '*');
                routes.push({
                    path: routePath,
                    component: 'Next.js Page',
                    file: filePath,
                    line: 1
                });
            }
        }
        if (filePath.includes('/pages/') && !filePath.includes('_app') && !filePath.includes('_document') &&
            (filePath.endsWith('.tsx') || filePath.endsWith('.jsx') || filePath.endsWith('.ts') || filePath.endsWith('.js'))) {
            const routeMatch = filePath.match(/pages(\/.+?)\.[jt]sx?$/);
            if (routeMatch) {
                let routePath = routeMatch[1];
                routePath = routePath.replace(/\/index$/, '') || '/';
                routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');
                routes.push({
                    path: routePath,
                    component: 'Next.js Page',
                    file: filePath,
                    line: 1
                });
            }
        }
        return routes;
    }
    async detectRoutesForFile(filePath) {
        if (this.routeCache.has(filePath)) {
            return this.routeCache.get(filePath);
        }
        const routes = new Set();
        const visited = new Set();
        const queue = [{ file: filePath, depth: 0 }];
        while (queue.length > 0) {
            const { file, depth } = queue.shift();
            if (visited.has(file))
                continue;
            visited.add(file);
            const node = this.importGraph.get(file);
            if (!node)
                continue;
            if (node.isRouteFile) {
                const fileNode = this.fileCache.get(file);
                if (fileNode) {
                    fileNode.routes.forEach(r => routes.add(r.path));
                }
                if (routes.size > 0 && depth > 2) {
                    break;
                }
            }
            for (const importer of node.importedBy) {
                if (!visited.has(importer)) {
                    queue.push({ file: importer, depth: depth + 1 });
                }
            }
        }
        const result = Array.from(routes);
        this.routeCache.set(filePath, result);
        return result;
    }
    async updateGraphForFiles(files) {
        for (const file of files) {
            this.astCache.delete(file);
            this.fileCache.delete(file);
            this.routeCache.delete(file);
            await this.processFile(file);
            const node = this.importGraph.get(file);
            if (node) {
                for (const importer of node.importedBy) {
                    this.routeCache.delete(importer);
                }
            }
        }
    }
    updateImportGraph(filePath, fileNode) {
        if (!this.importGraph.has(filePath)) {
            this.importGraph.set(filePath, {
                file: filePath,
                importedBy: new Set(),
                imports: new Set(),
                isRouteFile: false,
                isEntryPoint: false
            });
        }
        const node = this.importGraph.get(filePath);
        node.imports.clear();
        for (const imp of fileNode.imports) {
            node.imports.add(imp.source);
            if (!this.importGraph.has(imp.source)) {
                this.importGraph.set(imp.source, {
                    file: imp.source,
                    importedBy: new Set(),
                    imports: new Set(),
                    isRouteFile: false,
                    isEntryPoint: false
                });
            }
            this.importGraph.get(imp.source).importedBy.add(filePath);
        }
        node.isRouteFile = fileNode.routes.length > 0;
        if (fileNode.routes.length > 0) {
            core.info(`Found ${fileNode.routes.length} routes in ${filePath}: ${fileNode.routes.map(r => r.path).join(', ')}`);
        }
    }
    identifyEntryPoints() {
        for (const [file, node] of this.importGraph) {
            if (node.importedBy.size === 0) {
                if (file.includes('index') || file.includes('main') || file.includes('App')) {
                    node.isEntryPoint = true;
                }
            }
        }
    }
    async persistGraph() {
        const data = {
            version: '1.0',
            timestamp: Date.now(),
            graph: Array.from(this.importGraph.entries()).map(([file, node]) => ({
                file,
                importedBy: Array.from(node.importedBy),
                imports: Array.from(node.imports),
                isRouteFile: node.isRouteFile,
                isEntryPoint: node.isEntryPoint
            })),
            fileCache: Array.from(this.fileCache.entries()).map(([file, node]) => ({
                ...node,
                imports: node.imports.map(imp => ({ ...imp }))
            }))
        };
        const jsonData = JSON.stringify(data, null, 2);
        const buffer = Buffer.from(jsonData, 'utf-8');
        try {
            if (this.storageProvider) {
                await this.storageProvider.uploadFile(this.cacheKey, buffer, {
                    contentType: 'application/json',
                    metadata: {
                        repository: path.basename(this.rootPath),
                        timestamp: data.timestamp.toString()
                    }
                });
                core.info(`✅ Persisted import graph to storage: ${this.cacheKey}`);
            }
            else {
                const localCacheDir = path.join(this.rootPath, '.yofix-cache');
                const localCacheFile = path.join(localCacheDir, 'import-graph.json');
                if (!fs.existsSync(localCacheDir)) {
                    await fs.promises.mkdir(localCacheDir, { recursive: true });
                }
                await fs.promises.writeFile(localCacheFile, jsonData);
                core.info(`✅ Persisted import graph to local cache: ${localCacheFile}`);
            }
        }
        catch (error) {
            core.warning(`Failed to persist import graph: ${error}`);
        }
    }
    async loadPersistedGraph() {
        try {
            let jsonData = null;
            if (this.storageProvider) {
                try {
                    const files = await this.storageProvider.listFiles?.(`yofix-cache/${path.basename(this.rootPath)}/`);
                    if (files?.includes(this.cacheKey)) {
                        const buffer = await this.storageProvider.downloadFile(this.cacheKey);
                        jsonData = buffer.toString('utf-8');
                    }
                }
                catch (error) {
                    core.debug(`Failed to load from storage provider: ${error}`);
                }
            }
            if (!jsonData) {
                const localCacheFile = path.join(this.rootPath, '.yofix-cache', 'import-graph.json');
                if (fs.existsSync(localCacheFile)) {
                    jsonData = await fs.promises.readFile(localCacheFile, 'utf-8');
                }
            }
            if (!jsonData)
                return false;
            const data = JSON.parse(jsonData);
            this.importGraph.clear();
            for (const node of data.graph) {
                this.importGraph.set(node.file, {
                    file: node.file,
                    importedBy: new Set(node.importedBy),
                    imports: new Set(node.imports),
                    isRouteFile: node.isRouteFile,
                    isEntryPoint: node.isEntryPoint
                });
            }
            this.fileCache.clear();
            if (data.fileCache && Array.isArray(data.fileCache)) {
                for (const item of data.fileCache) {
                    if (Array.isArray(item)) {
                        const [file, node] = item;
                        this.fileCache.set(file, node);
                    }
                    else if (item.path) {
                        this.fileCache.set(item.path, item);
                    }
                }
            }
            return true;
        }
        catch (error) {
            core.debug(`Failed to load persisted graph: ${error}`);
            return false;
        }
    }
    async downloadFile(key) {
        if (!this.storageProvider || !this.storageProvider.downloadFile) {
            return null;
        }
        try {
            return await this.storageProvider.downloadFile(key);
        }
        catch (error) {
            core.debug(`Failed to download file ${key}: ${error}`);
            return null;
        }
    }
    async listFiles(prefix) {
        if (!this.storageProvider || !this.storageProvider.listFiles) {
            return null;
        }
        try {
            return await this.storageProvider.listFiles(prefix);
        }
        catch (error) {
            core.debug(`Failed to list files with prefix ${prefix}: ${error}`);
            return null;
        }
    }
    getFileHash(content) {
        return crypto_1.default.createHash('md5').update(content).digest('hex');
    }
    getCachedFile(filePath) {
        const cached = this.fileCache.get(filePath);
        if (!cached)
            return null;
        try {
            const stats = fs.statSync(path.join(this.rootPath, filePath));
            if (stats.mtimeMs > cached.lastModified) {
                return null;
            }
            return cached;
        }
        catch {
            return null;
        }
    }
    extractStringValue(node, content) {
        const text = content.slice(node.startIndex, node.endIndex);
        if (text.startsWith('"') || text.startsWith("'")) {
            return text.slice(1, -1);
        }
        return null;
    }
    extractComponentName(element, attributes, content) {
        for (const attr of attributes) {
            const nameNode = attr.childForFieldName('name');
            if (nameNode) {
                const name = content.slice(nameNode.startIndex, nameNode.endIndex);
                if (['element', 'component'].includes(name)) {
                    const valueNode = attr.childForFieldName('value');
                    if (valueNode) {
                        return content.slice(valueNode.startIndex, valueNode.endIndex);
                    }
                }
            }
        }
        return 'unknown';
    }
    findObjectProperty(obj, key, content) {
        const pairs = obj.descendantsOfType('pair');
        for (const pair of pairs) {
            const keyNode = pair.childForFieldName('key');
            if (keyNode && content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '') === key) {
                const valueNode = pair.childForFieldName('value');
                if (valueNode) {
                    const jsxElement = valueNode.descendantsOfType('jsx_element')[0];
                    if (jsxElement) {
                        const opening = jsxElement.childForFieldName('opening_element');
                        if (opening) {
                            const identifier = opening.childForFieldName('name');
                            if (identifier) {
                                return content.slice(identifier.startIndex, identifier.endIndex);
                            }
                        }
                    }
                    return this.extractStringValue(valueNode, content);
                }
            }
        }
        return null;
    }
    async getAllCodeFiles() {
        const files = [];
        const scanDir = async (dir) => {
            const dirName = path.basename(dir);
            if (dirName === 'node_modules' ||
                dirName === '.git' ||
                dirName === 'dist' ||
                dirName === 'build' ||
                dirName === 'coverage' ||
                dirName === '.next' ||
                dirName === 'out') {
                return;
            }
            try {
                const items = await fs.promises.readdir(dir);
                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stats = await fs.promises.stat(itemPath);
                    if (stats.isDirectory()) {
                        await scanDir(itemPath);
                    }
                    else if (this.isCodeFile(item)) {
                        files.push(path.relative(this.rootPath, itemPath));
                    }
                }
            }
            catch (error) {
                core.debug(`Skipping directory ${dir}: ${error}`);
            }
        };
        await scanDir(this.rootPath);
        return files;
    }
    isCodeFile(filename) {
        const ext = path.extname(filename);
        return ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'].includes(ext);
    }
    resolveImportPath(fromFile, importPath) {
        if (!importPath.startsWith('.') && !importPath.startsWith('@/') && !importPath.startsWith('src/')) {
            return null;
        }
        const fromDir = path.dirname(fromFile);
        let resolvedPath;
        if (importPath.startsWith('@/')) {
            resolvedPath = importPath.replace('@/', 'src/');
        }
        else if (importPath.startsWith('src/')) {
            resolvedPath = importPath;
        }
        else {
            resolvedPath = path.normalize(path.join(fromDir, importPath));
        }
        const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
        for (const ext of extensions) {
            const fullPath = resolvedPath + ext;
            if (fs.existsSync(path.join(this.rootPath, fullPath))) {
                return fullPath;
            }
        }
        return null;
    }
    getMetrics() {
        return {
            totalFiles: this.importGraph.size,
            routeFiles: Array.from(this.importGraph.values()).filter(n => n.isRouteFile).length,
            entryPoints: Array.from(this.importGraph.values()).filter(n => n.isEntryPoint).length,
            cacheSize: this.astCache.size,
            importEdges: Array.from(this.importGraph.values()).reduce((sum, n) => sum + n.imports.size, 0)
        };
    }
    classifyRouteFile(filePath) {
        const lowerPath = filePath.toLowerCase();
        if (lowerPath.includes('test') || lowerPath.includes('spec') ||
            lowerPath.includes('__tests__') || lowerPath.includes('__mocks__')) {
            return 'test';
        }
        if (lowerPath.includes('router') || lowerPath.includes('routes') ||
            lowerPath.includes('routing') || lowerPath.endsWith('router.tsx') ||
            lowerPath.endsWith('routes.ts') || lowerPath.endsWith('routing.ts') ||
            lowerPath.includes('app.tsx') || lowerPath.includes('app.ts')) {
            return 'primary';
        }
        return 'component-with-routes';
    }
    async findRoutesServingComponent(componentFile) {
        const servingRoutes = [];
        if (!componentFile) {
            core.debug('findRoutesServingComponent called with undefined componentFile');
            return servingRoutes;
        }
        const componentName = path.basename(componentFile, path.extname(componentFile));
        for (const [filePath, node] of this.importGraph) {
            if (node.isRouteFile) {
                try {
                    const fullPath = path.join(this.rootPath, filePath);
                    const content = await fs.promises.readFile(fullPath, 'utf-8');
                    const componentAlias = await this.findComponentAlias(content, componentFile);
                    if (!componentAlias) {
                        continue;
                    }
                    const parser = filePath.endsWith('.tsx') ? this.tsxParser : this.tsParser;
                    const tree = parser.parse(content);
                    const routeObjects = this.findRouteObjects(tree, content);
                    for (const routeObj of routeObjects) {
                        const routePath = this.extractRoutePath(routeObj, content);
                        const routeComponent = this.extractRouteComponent(routeObj, content);
                        if (routePath && routeComponent === componentAlias) {
                            servingRoutes.push({
                                routePath,
                                component: `${componentAlias} (${componentName})`,
                                routeFile: filePath,
                                line: routeObj.startPosition.row + 1
                            });
                        }
                    }
                }
                catch (error) {
                    core.debug(`Error analyzing ${filePath}: ${error}`);
                }
            }
        }
        return servingRoutes;
    }
    async findComponentAlias(content, componentFile) {
        const normalizedComponentFile = componentFile.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
        const componentBaseName = path.basename(componentFile, path.extname(componentFile));
        const lazyImportRegex = /const\s+(\w+)\s*=\s*lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        let match;
        while ((match = lazyImportRegex.exec(content)) !== null) {
            const [_, alias, importPath] = match;
            const normalizedImportPath = importPath.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
            if (normalizedImportPath === normalizedComponentFile ||
                normalizedImportPath.endsWith('/' + normalizedComponentFile) ||
                normalizedComponentFile.endsWith('/' + normalizedImportPath) ||
                normalizedImportPath.endsWith(normalizedComponentFile.replace(/^src\//, ''))) {
                return alias;
            }
        }
        const defaultImportRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
        while ((match = defaultImportRegex.exec(content)) !== null) {
            const [_, alias, importPath] = match;
            const normalizedImportPath = importPath.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
            if (normalizedImportPath === normalizedComponentFile ||
                normalizedImportPath.endsWith('/' + normalizedComponentFile) ||
                normalizedComponentFile.endsWith('/' + normalizedImportPath)) {
                return alias;
            }
        }
        const namedImportRegex = /import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g;
        while ((match = namedImportRegex.exec(content)) !== null) {
            const [_, imports, importPath] = match;
            const normalizedImportPath = importPath.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
            if (normalizedImportPath === normalizedComponentFile ||
                normalizedImportPath.endsWith('/' + normalizedComponentFile) ||
                normalizedComponentFile.endsWith('/' + normalizedImportPath)) {
                const importParts = imports.split(',').map(s => s.trim());
                for (const importPart of importParts) {
                    const asMatch = importPart.match(/(\w+)\s+as\s+(\w+)/);
                    if (asMatch) {
                        const [_, original, alias] = asMatch;
                        if (original === componentBaseName || original.toLowerCase() === componentBaseName.toLowerCase()) {
                            return alias;
                        }
                    }
                    else {
                        const componentName = importPart.trim();
                        if (componentName === componentBaseName || componentName.toLowerCase() === componentBaseName.toLowerCase()) {
                            return componentName;
                        }
                    }
                }
            }
        }
        return null;
    }
    findRouteObjects(tree, content) {
        const routeObjects = [];
        const objects = tree.rootNode.descendantsOfType('object');
        for (const obj of objects) {
            const pairs = obj.children.filter(child => child.type === 'pair');
            let hasRouteProperties = false;
            for (const pair of pairs) {
                const keyNode = pair.childForFieldName('key');
                if (keyNode) {
                    const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
                    if (['path', 'element', 'component', 'index'].includes(keyName)) {
                        hasRouteProperties = true;
                        break;
                    }
                }
            }
            if (hasRouteProperties) {
                routeObjects.push(obj);
            }
        }
        return routeObjects;
    }
    extractRoutePath(obj, content) {
        const pairs = obj.children.filter(child => child.type === 'pair');
        for (const pair of pairs) {
            const keyNode = pair.childForFieldName('key');
            const valueNode = pair.childForFieldName('value');
            if (keyNode && valueNode) {
                const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
                if (keyName === 'path') {
                    const value = content.slice(valueNode.startIndex, valueNode.endIndex);
                    return value.replace(/['"]/g, '');
                }
                else if (keyName === 'index') {
                    const value = content.slice(valueNode.startIndex, valueNode.endIndex);
                    if (value === 'true') {
                        return '(index)';
                    }
                }
            }
        }
        return null;
    }
    extractRouteComponent(obj, content) {
        const pairs = obj.children.filter(child => child.type === 'pair');
        for (const pair of pairs) {
            const keyNode = pair.childForFieldName('key');
            const valueNode = pair.childForFieldName('value');
            if (keyNode && valueNode) {
                const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
                if (keyName === 'element' || keyName === 'component') {
                    if (valueNode.type === 'jsx_self_closing_element') {
                        const nameNode = valueNode.childForFieldName('name');
                        if (nameNode) {
                            return content.slice(nameNode.startIndex, nameNode.endIndex);
                        }
                    }
                    else if (valueNode.type === 'jsx_element') {
                        const opening = valueNode.childForFieldName('opening_element');
                        if (opening) {
                            const nameNode = opening.childForFieldName('name');
                            if (nameNode) {
                                return content.slice(nameNode.startIndex, nameNode.endIndex);
                            }
                        }
                    }
                    else if (valueNode.type === 'call_expression') {
                        const funcNode = valueNode.childForFieldName('function');
                        if (funcNode && funcNode.type === 'identifier') {
                            return content.slice(funcNode.startIndex, funcNode.endIndex);
                        }
                    }
                    else if (valueNode.type === 'identifier') {
                        return content.slice(valueNode.startIndex, valueNode.endIndex);
                    }
                }
            }
        }
        return null;
    }
}
exports.TreeSitterRouteAnalyzer = TreeSitterRouteAnalyzer;
