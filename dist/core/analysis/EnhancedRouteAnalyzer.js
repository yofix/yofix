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
exports.EnhancedRouteAnalyzer = void 0;
const TreeSitterRouteAnalyzer_1 = require("./TreeSitterRouteAnalyzer");
const ComponentRouteMapper_1 = require("./ComponentRouteMapper");
const path = __importStar(require("path"));
class EnhancedRouteAnalyzer {
    constructor(rootPath = process.cwd()) {
        this.rootPath = rootPath;
        this.componentImportMap = new Map();
        this.baseAnalyzer = new TreeSitterRouteAnalyzer_1.TreeSitterRouteAnalyzer(rootPath);
        this.componentMapper = new ComponentRouteMapper_1.ComponentRouteMapper(rootPath);
    }
    async initialize() {
        await this.baseAnalyzer.initialize();
        await this.buildComponentMappings();
    }
    async getRouteImpact(changedFiles) {
        const results = new Map();
        for (const file of changedFiles) {
            const impact = await this.analyzeFileImpact(file);
            results.set(file, impact);
        }
        return results;
    }
    async analyzeFileImpact(filePath) {
        const routeInfo = await this.baseAnalyzer.getRouteInfo([filePath]);
        const fileInfo = routeInfo.get(filePath);
        if (!fileInfo) {
            return {
                file: filePath,
                directRoutes: [],
                indirectRoutes: [],
                totalImpact: 0,
                isRouteFile: false
            };
        }
        if (fileInfo.isRouteDefiner) {
            return {
                file: filePath,
                directRoutes: fileInfo.routes,
                indirectRoutes: [],
                totalImpact: fileInfo.routes.length,
                isRouteFile: true
            };
        }
        const directRoutes = await this.findDirectRouteUsage(filePath);
        const indirectRoutes = await this.findIndirectRouteUsage(filePath);
        const indirectSet = new Set(indirectRoutes);
        directRoutes.forEach(route => indirectSet.delete(route));
        return {
            file: filePath,
            directRoutes,
            indirectRoutes: Array.from(indirectSet),
            totalImpact: directRoutes.length + indirectSet.size,
            isRouteFile: false
        };
    }
    async findDirectRouteUsage(componentPath) {
        const directRoutes = [];
        const componentName = path.basename(componentPath, path.extname(componentPath));
        const graph = this.baseAnalyzer.importGraph;
        const routeFiles = Array.from(graph.entries())
            .filter(([_, node]) => node.isRouteFile)
            .map(([file]) => file);
        for (const routeFile of routeFiles) {
            const importInfo = this.componentImportMap.get(routeFile);
            if (!importInfo)
                continue;
            let componentLocalName = null;
            for (const [localName, info] of importInfo) {
                if (info.sourcePath === componentPath ||
                    info.sourcePath.endsWith(componentName) ||
                    componentPath.endsWith(info.sourcePath + '.tsx') ||
                    componentPath.endsWith(info.sourcePath + '.ts')) {
                    componentLocalName = localName;
                    break;
                }
            }
            if (componentLocalName) {
                const routeMappings = await this.componentMapper.analyzeRouteFile(routeFile);
                for (const mapping of routeMappings) {
                    if (mapping.componentName === componentLocalName) {
                        directRoutes.push(mapping.routePath);
                    }
                }
            }
        }
        return directRoutes;
    }
    async findIndirectRouteUsage(componentPath) {
        return [];
    }
    async buildComponentMappings() {
        const graph = this.baseAnalyzer.importGraph;
        const fileCache = this.baseAnalyzer.fileCache;
        const routeFiles = Array.from(graph.entries())
            .filter(([_, node]) => node.isRouteFile)
            .map(([file]) => file);
        for (const routeFile of routeFiles) {
            const fileNode = fileCache.get(routeFile);
            if (!fileNode)
                continue;
            const importMap = new Map();
            for (const imp of fileNode.imports) {
                const sourcePath = imp.source;
                const componentName = path.basename(sourcePath, path.extname(sourcePath));
                importMap.set(componentName, {
                    localName: componentName,
                    sourcePath: sourcePath,
                    importType: 'default'
                });
            }
            this.componentImportMap.set(routeFile, importMap);
        }
    }
    getMetrics() {
        return this.baseAnalyzer.getMetrics();
    }
}
exports.EnhancedRouteAnalyzer = EnhancedRouteAnalyzer;
