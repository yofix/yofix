import * as core from '@actions/core';
import { AgentState, StepResult, MemoryEntry, Pattern } from '../types';

export class StateManager {
  private state: AgentState;
  private patterns: Map<string, Pattern> = new Map();
  private memoryTTLCheck: any;

  constructor(task: string) {
    this.state = {
      task,
      currentUrl: '',
      history: [],
      memory: new Map(),
      fileSystem: new Map(),
      completed: false
    };

    // Start memory TTL checker
    this.memoryTTLCheck = setInterval(() => this.cleanExpiredMemory(), 60000); // Check every minute
  }

  /**
   * Record a completed step
   */
  recordStep(result: StepResult): void {
    this.state.history.push(result);
    core.debug(`Recorded step ${result.action} - Success: ${result.result.success}`);
    
    // Learn from successful patterns
    if (result.result.success) {
      this.learnPattern(result);
    }
  }

  /**
   * Get recent steps
   */
  getRecentSteps(n: number): StepResult[] {
    return this.state.history.slice(-n);
  }

  /**
   * Save to memory with optional TTL
   */
  saveToMemory(key: string, value: any, category?: string, ttl?: number): void {
    const entry: MemoryEntry = {
      key,
      value,
      timestamp: Date.now(),
      category,
      ttl
    };
    
    this.state.memory.set(key, entry);
    core.debug(`Saved to memory: ${key} (category: ${category || 'general'})`);
  }

  /**
   * Retrieve from memory
   */
  getFromMemory(key: string): any {
    const entry = this.state.memory.get(key) as MemoryEntry;
    if (!entry) return undefined;
    
    // Check if expired
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      this.state.memory.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  /**
   * Get memory by category
   */
  getMemoryByCategory(category: string): Map<string, any> {
    const results = new Map<string, any>();
    
    for (const [key, entry] of this.state.memory) {
      const memEntry = entry as MemoryEntry;
      if (memEntry.category === category) {
        results.set(key, memEntry.value);
      }
    }
    
    return results;
  }

  /**
   * Save content to virtual file system
   */
  saveFile(path: string, content: string): void {
    this.state.fileSystem.set(path, content);
    core.debug(`Saved file: ${path} (${content.length} bytes)`);
  }

  /**
   * Read from virtual file system
   */
  readFile(path: string): string | undefined {
    return this.state.fileSystem.get(path);
  }

  /**
   * List files in virtual file system
   */
  listFiles(): string[] {
    return Array.from(this.state.fileSystem.keys());
  }

  /**
   * Update current URL
   */
  updateUrl(url: string): void {
    this.state.currentUrl = url;
  }

  /**
   * Mark task as completed
   */
  markCompleted(success: boolean = true, error?: string): void {
    this.state.completed = true;
    if (error) {
      this.state.error = error;
    }
  }

  /**
   * Check if task is completed
   */
  isCompleted(): boolean {
    return this.state.completed;
  }

  /**
   * Get full state
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Learn from successful patterns
   */
  private learnPattern(step: StepResult): void {
    // Create pattern key from action and context
    const patternKey = `${step.action}:${this.getContextSignature(step)}`;
    
    const existing = this.patterns.get(patternKey);
    if (existing) {
      // Update success rate
      existing.successRate = (existing.successRate * 0.9) + 0.1; // Weighted average
      existing.lastUsed = Date.now();
    } else {
      // Create new pattern
      this.patterns.set(patternKey, {
        id: patternKey,
        pattern: JSON.stringify({ action: step.action, params: step.parameters }),
        solution: JSON.stringify(step.result),
        successRate: 1.0,
        lastUsed: Date.now()
      });
    }
  }

  /**
   * Get relevant patterns for current context
   */
  getRelevantPatterns(action: string): Pattern[] {
    const relevant: Pattern[] = [];
    
    for (const [key, pattern] of this.patterns) {
      if (key.startsWith(`${action}:`)) {
        relevant.push(pattern);
      }
    }
    
    // Sort by success rate and recency
    return relevant.sort((a, b) => {
      const scoreA = a.successRate * (1 - (Date.now() - a.lastUsed) / (7 * 24 * 60 * 60 * 1000));
      const scoreB = b.successRate * (1 - (Date.now() - b.lastUsed) / (7 * 24 * 60 * 60 * 1000));
      return scoreB - scoreA;
    });
  }

  /**
   * Get context signature for pattern matching
   */
  private getContextSignature(step: StepResult): string {
    // Create a signature based on relevant context
    try {
      const url = new URL(this.state.currentUrl);
      return `${url.hostname}:${step.parameters.element || 'none'}`;
    } catch {
      // If URL is invalid, use a default signature
      return `unknown:${step.parameters.element || 'none'}`;
    }
  }

  /**
   * Clean expired memory entries
   */
  private cleanExpiredMemory(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [key, entry] of this.state.memory) {
      const memEntry = entry as MemoryEntry;
      if (memEntry.ttl && now - memEntry.timestamp > memEntry.ttl) {
        toDelete.push(key);
      }
    }
    
    toDelete.forEach(key => this.state.memory.delete(key));
    
    if (toDelete.length > 0) {
      core.debug(`Cleaned ${toDelete.length} expired memory entries`);
    }
  }

  /**
   * Get state summary for LLM context
   */
  getStateSummary(): string {
    const lines: string[] = [
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
    
    // Add recent steps
    const recentSteps = this.getRecentSteps(3);
    if (recentSteps.length > 0) {
      lines.push('\nRecent steps:');
      recentSteps.forEach((step, i) => {
        lines.push(`  ${i + 1}. ${step.action} - ${step.result.success ? '✓' : '✗'}`);
      });
    }
    
    return lines.join('\n');
  }

  /**
   * Export state for persistence
   */
  exportState(): string {
    return JSON.stringify({
      state: this.state,
      patterns: Array.from(this.patterns.entries())
    });
  }

  /**
   * Import state from persistence
   */
  importState(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.state = parsed.state;
      this.patterns = new Map(parsed.patterns);
      
      // Recreate Map objects
      this.state.memory = new Map(Object.entries(this.state.memory));
      this.state.fileSystem = new Map(Object.entries(this.state.fileSystem));
      
      core.info('State imported successfully');
    } catch (error) {
      core.error(`Failed to import state: ${error}`);
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.memoryTTLCheck) {
      clearInterval(this.memoryTTLCheck);
    }
  }
}