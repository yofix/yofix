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
exports.ComponentRouteMapper = void 0;
const tree_sitter_1 = __importDefault(require("tree-sitter"));
const tsx_1 = __importDefault(require("tree-sitter-typescript/tsx"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ComponentRouteMapper {
    constructor(rootPath) {
        this.rootPath = rootPath;
        this.componentRouteMap = new Map();
        this.parser = new tree_sitter_1.default();
        this.parser.setLanguage(tsx_1.default);
    }
    async analyzeRouteFile(filePath) {
        const fullPath = path.join(this.rootPath, filePath);
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const tree = this.parser.parse(content);
        const mappings = [];
        const routeObjects = this.findRouteObjects(tree, content);
        for (const routeObj of routeObjects) {
            const routePath = this.extractRoutePath(routeObj, content);
            const componentInfo = this.extractRouteComponent(routeObj, content);
            if (routePath && componentInfo) {
                mappings.push({
                    routePath,
                    componentName: componentInfo.name,
                    componentPath: componentInfo.path,
                    line: routeObj.startPosition.row + 1
                });
                if (!this.componentRouteMap.has(componentInfo.name)) {
                    this.componentRouteMap.set(componentInfo.name, new Set());
                }
                this.componentRouteMap.get(componentInfo.name).add(routePath);
            }
        }
        return mappings;
    }
    findRouteObjects(tree, content) {
        const routeObjects = [];
        const objects = tree.rootNode.descendantsOfType('object');
        for (const obj of objects) {
            const hasRouteProp = this.hasRouteProperties(obj, content);
            if (hasRouteProp) {
                routeObjects.push(obj);
            }
        }
        return routeObjects;
    }
    hasRouteProperties(obj, content) {
        const pairs = obj.children.filter(child => child.type === 'pair');
        let hasPath = false;
        let hasElement = false;
        let hasIndex = false;
        for (const pair of pairs) {
            const keyNode = pair.childForFieldName('key');
            if (keyNode) {
                const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
                if (keyName === 'path')
                    hasPath = true;
                if (keyName === 'element' || keyName === 'component')
                    hasElement = true;
                if (keyName === 'index')
                    hasIndex = true;
            }
        }
        return hasPath || hasIndex || hasElement;
    }
    extractRoutePath(obj, content) {
        const pairs = obj.children.filter(child => child.type === 'pair');
        for (const pair of pairs) {
            const keyNode = pair.childForFieldName('key');
            const valueNode = pair.childForFieldName('value');
            if (keyNode && valueNode) {
                const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
                if (keyName === 'path') {
                    return this.extractStringValue(valueNode, content);
                }
                else if (keyName === 'index') {
                    const indexValue = content.slice(valueNode.startIndex, valueNode.endIndex);
                    if (indexValue === 'true') {
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
                    if (valueNode.type === 'jsx_self_closing_element' || valueNode.type === 'jsx_element') {
                        const identifier = valueNode.type === 'jsx_self_closing_element'
                            ? valueNode.childForFieldName('name')
                            : valueNode.childForFieldName('opening_element')?.childForFieldName('name');
                        if (identifier) {
                            const componentName = content.slice(identifier.startIndex, identifier.endIndex);
                            return { name: componentName };
                        }
                    }
                }
            }
        }
        return null;
    }
    extractStringValue(node, content) {
        const text = content.slice(node.startIndex, node.endIndex);
        if (text.startsWith('"') || text.startsWith("'")) {
            return text.slice(1, -1);
        }
        return text;
    }
    getRoutesForComponent(componentName) {
        return Array.from(this.componentRouteMap.get(componentName) || []);
    }
    clearCache() {
        this.componentRouteMap.clear();
    }
}
exports.ComponentRouteMapper = ComponentRouteMapper;
