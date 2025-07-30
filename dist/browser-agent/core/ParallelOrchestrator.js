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
exports.BrowserTaskOrchestrator = exports.ParallelOrchestrator = void 0;
const events_1 = require("events");
const core = __importStar(require("@actions/core"));
class ParallelOrchestrator extends events_1.EventEmitter {
    constructor(maxConcurrency = 3) {
        super();
        this.maxConcurrency = maxConcurrency;
        this.runningTasks = new Map();
    }
    async executeParallel(tasks) {
        const sortedTasks = [...tasks].sort((a, b) => (b.priority || 0) - (a.priority || 0));
        const results = [];
        const queue = [...sortedTasks];
        const executing = [];
        while (queue.length > 0 || executing.length > 0) {
            while (executing.length < this.maxConcurrency && queue.length > 0) {
                const task = queue.shift();
                const execution = this.executeTask(task, results).then(() => { });
                executing.push(execution);
            }
            if (executing.length > 0) {
                await Promise.race(executing);
                for (let i = executing.length - 1; i >= 0; i--) {
                    if (await this.isResolved(executing[i])) {
                        executing.splice(i, 1);
                    }
                }
            }
        }
        return results;
    }
    async executeWithDependencies(tasks) {
        const results = [];
        const completed = new Set();
        const running = new Map();
        while (results.length < tasks.length) {
            const ready = tasks.filter(task => !completed.has(task.id) &&
                !running.has(task.id) &&
                (!task.dependencies || task.dependencies.every(dep => completed.has(dep))));
            const toStart = ready.slice(0, this.maxConcurrency - running.size);
            for (const task of toStart) {
                const promise = this.executeTask(task, results);
                running.set(task.id, promise);
                promise.then(() => {
                    running.delete(task.id);
                    completed.add(task.id);
                });
            }
            if (running.size > 0) {
                await Promise.race(running.values());
            }
        }
        return results;
    }
    async executeTask(task, results) {
        const startTime = Date.now();
        try {
            core.debug(`Starting parallel task: ${task.name}`);
            this.emit('taskStart', task);
            let result;
            if (task.timeout) {
                result = await this.withTimeout(task.execute(), task.timeout);
            }
            else {
                result = await task.execute();
            }
            const taskResult = {
                id: task.id,
                success: true,
                result,
                duration: Date.now() - startTime
            };
            results.push(taskResult);
            this.emit('taskComplete', taskResult);
            core.debug(`Completed task ${task.name} in ${taskResult.duration}ms`);
            return taskResult;
        }
        catch (error) {
            const taskResult = {
                id: task.id,
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime
            };
            results.push(taskResult);
            this.emit('taskError', taskResult);
            core.warning(`Task ${task.name} failed: ${taskResult.error}`);
            return taskResult;
        }
    }
    async withTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Task timed out after ${timeout}ms`)), timeout))
        ]);
    }
    async isResolved(promise) {
        return Promise.race([
            promise.then(() => true),
            Promise.resolve(false)
        ]);
    }
}
exports.ParallelOrchestrator = ParallelOrchestrator;
class BrowserTaskOrchestrator extends ParallelOrchestrator {
    async parallelInitialization(params) {
        const tasks = [
            {
                id: 'planning',
                name: 'Generate task plan',
                execute: params.planningTask,
                priority: 2
            },
            {
                id: 'dom',
                name: 'Index DOM',
                execute: params.domIndexTask,
                priority: 1
            },
            {
                id: 'screenshot',
                name: 'Take screenshot',
                execute: params.screenshotTask,
                priority: 0
            }
        ];
        const results = await this.executeParallel(tasks);
        return {
            plan: results.find(r => r.id === 'planning')?.result,
            dom: results.find(r => r.id === 'dom')?.result,
            screenshot: results.find(r => r.id === 'screenshot')?.result
        };
    }
    async batchActions(params) {
        const tasks = params.actions.map((action, index) => ({
            id: `action_${index}`,
            name: `${action.action}`,
            execute: () => params.executeAction(action.action, action.parameters),
            priority: params.actions.length - index
        }));
        const results = await this.executeParallel(tasks);
        return results.map(r => r.result);
    }
}
exports.BrowserTaskOrchestrator = BrowserTaskOrchestrator;
