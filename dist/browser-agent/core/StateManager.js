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
exports.StateManager = void 0;
const core = __importStar(require("@actions/core"));
class StateManager {
    constructor(task) {
        this.patterns = new Map();
        this.state = {
            task,
            currentUrl: '',
            history: [],
            memory: new Map(),
            fileSystem: new Map(),
            completed: false
        };
        this.memoryTTLCheck = setInterval(() => this.cleanExpiredMemory(), 60000);
    }
    recordStep(result) {
        this.state.history.push(result);
        core.debug(`Recorded step ${result.action} - Success: ${result.result.success}`);
        if (result.result.success) {
            this.learnPattern(result);
        }
    }
    getRecentSteps(n) {
        return this.state.history.slice(-n);
    }
    saveToMemory(key, value, category, ttl) {
        const entry = {
            key,
            value,
            timestamp: Date.now(),
            category,
            ttl
        };
        this.state.memory.set(key, entry);
        core.debug(`Saved to memory: ${key} (category: ${category || 'general'})`);
    }
    getFromMemory(key) {
        const entry = this.state.memory.get(key);
        if (!entry)
            return undefined;
        if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
            this.state.memory.delete(key);
            return undefined;
        }
        return entry.value;
    }
    getMemoryByCategory(category) {
        const results = new Map();
        for (const [key, entry] of this.state.memory) {
            const memEntry = entry;
            if (memEntry.category === category) {
                results.set(key, memEntry.value);
            }
        }
        return results;
    }
    saveFile(path, content) {
        this.state.fileSystem.set(path, content);
        core.debug(`Saved file: ${path} (${content.length} bytes)`);
    }
    readFile(path) {
        return this.state.fileSystem.get(path);
    }
    listFiles() {
        return Array.from(this.state.fileSystem.keys());
    }
    updateUrl(url) {
        this.state.currentUrl = url;
    }
    markCompleted(success = true, error) {
        this.state.completed = true;
        if (error) {
            this.state.error = error;
        }
    }
    isCompleted() {
        return this.state.completed;
    }
    getState() {
        return this.state;
    }
    learnPattern(step) {
        const patternKey = `${step.action}:${this.getContextSignature(step)}`;
        const existing = this.patterns.get(patternKey);
        if (existing) {
            existing.successRate = (existing.successRate * 0.9) + 0.1;
            existing.lastUsed = Date.now();
        }
        else {
            this.patterns.set(patternKey, {
                id: patternKey,
                pattern: JSON.stringify({ action: step.action, params: step.parameters }),
                solution: JSON.stringify(step.result),
                successRate: 1.0,
                lastUsed: Date.now()
            });
        }
    }
    getRelevantPatterns(action) {
        const relevant = [];
        for (const [key, pattern] of this.patterns) {
            if (key.startsWith(`${action}:`)) {
                relevant.push(pattern);
            }
        }
        return relevant.sort((a, b) => {
            const scoreA = a.successRate * (1 - (Date.now() - a.lastUsed) / (7 * 24 * 60 * 60 * 1000));
            const scoreB = b.successRate * (1 - (Date.now() - b.lastUsed) / (7 * 24 * 60 * 60 * 1000));
            return scoreB - scoreA;
        });
    }
    getContextSignature(step) {
        try {
            const url = new URL(this.state.currentUrl);
            return `${url.hostname}:${step.parameters.element || 'none'}`;
        }
        catch {
            return `unknown:${step.parameters.element || 'none'}`;
        }
    }
    cleanExpiredMemory() {
        const now = Date.now();
        const toDelete = [];
        for (const [key, entry] of this.state.memory) {
            const memEntry = entry;
            if (memEntry.ttl && now - memEntry.timestamp > memEntry.ttl) {
                toDelete.push(key);
            }
        }
        toDelete.forEach(key => this.state.memory.delete(key));
        if (toDelete.length > 0) {
            core.debug(`Cleaned ${toDelete.length} expired memory entries`);
        }
    }
    getStateSummary() {
        const lines = [
            `Task: ${this.state.task}`,
            `Current URL: ${this.state.currentUrl}`,
            `Steps completed: ${this.state.history.length}`,
            `Files saved: ${this.state.fileSystem.size}`,
            `Memory entries: ${this.state.memory.size}`,
            `Status: ${this.state.completed ? 'Completed' : 'In Progress'}`
        ];
        if (this.state.error) {
            lines.push(`Error: ${this.state.error}`);
        }
        const recentSteps = this.getRecentSteps(3);
        if (recentSteps.length > 0) {
            lines.push('\nRecent steps:');
            recentSteps.forEach((step, i) => {
                lines.push(`  ${i + 1}. ${step.action} - ${step.result.success ? '✓' : '✗'}`);
            });
        }
        return lines.join('\n');
    }
    exportState() {
        return JSON.stringify({
            state: this.state,
            patterns: Array.from(this.patterns.entries())
        });
    }
    importState(data) {
        try {
            const parsed = JSON.parse(data);
            this.state = parsed.state;
            this.patterns = new Map(parsed.patterns);
            this.state.memory = new Map(Object.entries(this.state.memory));
            this.state.fileSystem = new Map(Object.entries(this.state.fileSystem));
            core.info('State imported successfully');
        }
        catch (error) {
            core.error(`Failed to import state: ${error}`);
        }
    }
    cleanup() {
        if (this.memoryTTLCheck) {
            clearInterval(this.memoryTTLCheck);
        }
    }
}
exports.StateManager = StateManager;
