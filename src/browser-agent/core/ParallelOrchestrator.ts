import { EventEmitter } from 'events';
import * as core from '@actions/core';

export interface ParallelTask<T> {
  id: string;
  name: string;
  execute: () => Promise<T>;
  priority?: number;
  timeout?: number;
}

export interface TaskResult<T> {
  id: string;
  success: boolean;
  result?: T;
  error?: string;
  duration: number;
}

export class ParallelOrchestrator extends EventEmitter {
  private maxConcurrency: number;
  private runningTasks: Map<string, Promise<any>>;
  
  constructor(maxConcurrency: number = 3) {
    super();
    this.maxConcurrency = maxConcurrency;
    this.runningTasks = new Map();
  }
  
  /**
   * Execute multiple tasks in parallel with concurrency control
   */
  async executeParallel<T>(tasks: ParallelTask<T>[]): Promise<TaskResult<T>[]> {
    // Sort by priority
    const sortedTasks = [...tasks].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    const results: TaskResult<T>[] = [];
    const queue = [...sortedTasks];
    const executing: Promise<void>[] = [];
    
    while (queue.length > 0 || executing.length > 0) {
      // Start new tasks up to concurrency limit
      while (executing.length < this.maxConcurrency && queue.length > 0) {
        const task = queue.shift()!;
        const execution = this.executeTask(task, results).then(() => {});
        executing.push(execution);
      }
      
      // Wait for at least one task to complete
      if (executing.length > 0) {
        await Promise.race(executing);
        // Remove completed tasks
        for (let i = executing.length - 1; i >= 0; i--) {
          if (await this.isResolved(executing[i])) {
            executing.splice(i, 1);
          }
        }
      }
    }
    
    return results;
  }
  
  /**
   * Execute tasks with dependencies
   */
  async executeWithDependencies<T>(
    tasks: Array<ParallelTask<T> & { dependencies?: string[] }>
  ): Promise<TaskResult<T>[]> {
    const results: TaskResult<T>[] = [];
    const completed = new Set<string>();
    const running = new Map<string, Promise<TaskResult<T>>>();
    
    while (results.length < tasks.length) {
      // Find tasks ready to run
      const ready = tasks.filter(task => 
        !completed.has(task.id) &&
        !running.has(task.id) &&
        (!task.dependencies || task.dependencies.every(dep => completed.has(dep)))
      );
      
      // Start ready tasks up to concurrency limit
      const toStart = ready.slice(0, this.maxConcurrency - running.size);
      
      for (const task of toStart) {
        const promise = this.executeTask(task, results);
        running.set(task.id, promise);
        
        promise.then(() => {
          running.delete(task.id);
          completed.add(task.id);
        });
      }
      
      // Wait for at least one task to complete
      if (running.size > 0) {
        await Promise.race(running.values());
      }
    }
    
    return results;
  }
  
  private async executeTask<T>(
    task: ParallelTask<T>, 
    results: TaskResult<T>[]
  ): Promise<TaskResult<T>> {
    const startTime = Date.now();
    
    try {
      core.debug(`Starting parallel task: ${task.name}`);
      this.emit('taskStart', task);
      
      // Execute with timeout if specified
      let result: T;
      if (task.timeout) {
        result = await this.withTimeout(task.execute(), task.timeout);
      } else {
        result = await task.execute();
      }
      
      const taskResult: TaskResult<T> = {
        id: task.id,
        success: true,
        result,
        duration: Date.now() - startTime
      };
      
      results.push(taskResult);
      this.emit('taskComplete', taskResult);
      core.debug(`Completed task ${task.name} in ${taskResult.duration}ms`);
      
      return taskResult;
      
    } catch (error) {
      const taskResult: TaskResult<T> = {
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
  
  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`Task timed out after ${timeout}ms`)), timeout)
      )
    ]);
  }
  
  private async isResolved(promise: Promise<any>): Promise<boolean> {
    return Promise.race([
      promise.then(() => true),
      Promise.resolve(false)
    ]);
  }
}

/**
 * Specialized orchestrator for browser automation tasks
 */
export class BrowserTaskOrchestrator extends ParallelOrchestrator {
  /**
   * Execute planning and initial DOM indexing in parallel
   */
  async parallelInitialization(params: {
    planningTask: () => Promise<any>;
    domIndexTask: () => Promise<any>;
    screenshotTask: () => Promise<any>;
  }): Promise<{
    plan?: any;
    dom?: any;
    screenshot?: any;
  }> {
    const tasks: ParallelTask<any>[] = [
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
  
  /**
   * Execute multiple browser actions in batch
   */
  async batchActions(params: {
    actions: Array<{ action: string; parameters: any }>;
    executeAction: (action: string, params: any) => Promise<any>;
  }): Promise<any[]> {
    const tasks = params.actions.map((action, index) => ({
      id: `action_${index}`,
      name: `${action.action}`,
      execute: () => params.executeAction(action.action, action.parameters),
      priority: params.actions.length - index // Execute in order
    }));
    
    const results = await this.executeParallel(tasks);
    return results.map(r => r.result);
  }
}