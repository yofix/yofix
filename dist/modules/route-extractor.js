#!/usr/bin/env node
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function extractRoutes() {
    const previewUrl = process.env.INPUT_PREVIEW_URL;
    const maxRoutes = parseInt(process.env.INPUT_MAX_ROUTES || '10');
    const debug = process.env.INPUT_DEBUG === 'true';
    if (!previewUrl) {
        console.error('❌ Preview URL is required');
        process.exit(1);
    }
    console.log(`🔍 Extracting routes for ${previewUrl}`);
    console.log(`📊 Max routes: ${maxRoutes}`);
    try {
        let routes = [];
        try {
            routes = await extractRoutesWithTreeSitter(maxRoutes, debug);
        }
        catch (treeError) {
            console.log('⚠️ Tree-sitter extraction failed, using fallback method');
            if (debug) {
                console.log('Tree-sitter error:', treeError);
            }
            routes = await extractRoutesSimple(maxRoutes, debug);
        }
        if (debug) {
            console.log('📋 Extracted routes:', JSON.stringify(routes, null, 2));
        }
        console.log(`✅ Found ${routes.length} routes`);
        const outputPath = path.join(process.cwd(), 'routes.json');
        fs.writeFileSync(outputPath, JSON.stringify(routes, null, 2));
        const githubOutput = process.env.GITHUB_OUTPUT;
        if (githubOutput) {
            fs.appendFileSync(githubOutput, `routes=${JSON.stringify(routes)}\n`);
            fs.appendFileSync(githubOutput, `route-count=${routes.length}\n`);
        }
    }
    catch (error) {
        console.error('❌ Route extraction failed:', error);
        const fallbackRoutes = [
            { path: '/', title: 'Home', method: 'static', priority: 100 }
        ];
        const outputPath = path.join(process.cwd(), 'routes.json');
        fs.writeFileSync(outputPath, JSON.stringify(fallbackRoutes, null, 2));
        const githubOutput = process.env.GITHUB_OUTPUT;
        if (githubOutput) {
            fs.appendFileSync(githubOutput, `routes=${JSON.stringify(fallbackRoutes)}\n`);
            fs.appendFileSync(githubOutput, `route-count=1\n`);
        }
    }
}
async function extractRoutesWithTreeSitter(maxRoutes, debug) {
    const Parser = (await Promise.resolve().then(() => __importStar(require('tree-sitter')))).default;
    const TSX = (await Promise.resolve().then(() => __importStar(require('tree-sitter-typescript/tsx')))).default;
    const parser = new Parser();
    parser.setLanguage(TSX);
    const routes = new Set();
    const routeFiles = [
        'src/routes/index.tsx',
        'src/routes/index.ts',
        'src/router/index.tsx',
        'src/router/index.ts',
        'src/App.tsx',
        'src/App.ts',
        'src/routes.tsx',
        'src/routes.ts'
    ];
    for (const file of routeFiles) {
        if (fs.existsSync(file)) {
            if (debug) {
                console.log(`🔍 Scanning ${file} for routes...`);
            }
            const content = await fs.promises.readFile(file, 'utf-8');
            const tree = parser.parse(content);
            const objects = tree.rootNode.descendantsOfType('object');
            for (const obj of objects) {
                const pairs = obj.children.filter(child => child.type === 'pair');
                let pathValue = null;
                let hasElement = false;
                for (const pair of pairs) {
                    const keyNode = pair.childForFieldName('key');
                    const valueNode = pair.childForFieldName('value');
                    if (keyNode && valueNode) {
                        const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
                        if (keyName === 'path') {
                            pathValue = content.slice(valueNode.startIndex, valueNode.endIndex).replace(/['"]/g, '');
                        }
                        if (keyName === 'element' || keyName === 'component') {
                            hasElement = true;
                        }
                    }
                }
                if (pathValue && hasElement) {
                    routes.add(pathValue);
                }
            }
        }
    }
    routes.add('/');
    return Array.from(routes)
        .map(route => ({
        path: route,
        title: route === '/' ? 'Home' :
            route.substring(1).split('/').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
        method: 'static',
        priority: route === '/' ? 100 :
            route.split('/').length === 2 ? 80 : 50
    }))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, maxRoutes);
}
async function extractRoutesSimple(maxRoutes, debug) {
    const routes = new Set();
    const commonRoutes = [
        '/',
        '/dashboard',
        '/login',
        '/signup',
        '/profile',
        '/settings',
        '/about',
        '/contact',
        '/help',
        '/admin',
        '/users',
        '/products',
        '/orders',
        '/reports',
        '/analytics'
    ];
    const routeFiles = [
        'src/routes/index.tsx',
        'src/routes/index.ts',
        'src/App.tsx',
        'src/App.ts'
    ];
    for (const file of routeFiles) {
        if (fs.existsSync(file)) {
            try {
                const content = await fs.promises.readFile(file, 'utf-8');
                const pathRegex = /['"]path['"]\s*:\s*['"]([^'"]+)['"]/g;
                let match;
                while ((match = pathRegex.exec(content)) !== null) {
                    routes.add(match[1]);
                }
                const routeRegex = /['"]\/[a-zA-Z0-9-/]+['"]/g;
                while ((match = routeRegex.exec(content)) !== null) {
                    const route = match[0].replace(/['"]/g, '');
                    if (route.length > 1 && !route.includes('.')) {
                        routes.add(route);
                    }
                }
            }
            catch (error) {
                if (debug) {
                    console.log(`Failed to read ${file}:`, error);
                }
            }
        }
    }
    const allRoutes = Array.from(routes);
    for (const route of commonRoutes) {
        if (allRoutes.length >= maxRoutes)
            break;
        if (!routes.has(route)) {
            allRoutes.push(route);
        }
    }
    return allRoutes
        .slice(0, maxRoutes)
        .map(route => ({
        path: route,
        title: route === '/' ? 'Home' :
            route.substring(1).split('/').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
        method: 'static',
        priority: route === '/' ? 100 :
            route.split('/').length === 2 ? 80 : 50
    }))
        .sort((a, b) => b.priority - a.priority);
}
if (require.main === module) {
    extractRoutes().catch(console.error);
}
