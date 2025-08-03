/**
 * Logger hook interface for decoupling from GitHub Actions
 */
export interface LoggerHook {
  info(message: string): void;
  debug(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  setOutput(name: string, value: string): void;
}

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements LoggerHook {
  info(message: string): void {
    console.log(`ℹ️  ${message}`);
  }
  
  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(`🐛 ${message}`);
    }
  }
  
  warning(message: string): void {
    console.warn(`⚠️  ${message}`);
  }
  
  error(message: string): void {
    console.error(`❌ ${message}`);
  }
  
  setOutput(name: string, value: string): void {
    console.log(`📤 Output: ${name} = ${value}`);
  }
}

/**
 * GitHub Actions logger implementation
 */
export class GitHubActionsLogger implements LoggerHook {
  private core: any;
  
  constructor() {
    try {
      this.core = require('@actions/core');
    } catch (error) {
      console.warn('GitHub Actions core not available, falling back to console');
      this.core = null;
    }
  }
  
  info(message: string): void {
    if (this.core) {
      this.core.info(message);
    } else {
      console.log(message);
    }
  }
  
  debug(message: string): void {
    if (this.core) {
      this.core.debug(message);
    } else if (process.env.DEBUG) {
      console.log(`[DEBUG] ${message}`);
    }
  }
  
  warning(message: string): void {
    if (this.core) {
      this.core.warning(message);
    } else {
      console.warn(message);
    }
  }
  
  error(message: string): void {
    if (this.core) {
      this.core.error(message);
    } else {
      console.error(message);
    }
  }
  
  setOutput(name: string, value: string): void {
    if (this.core) {
      this.core.setOutput(name, value);
    } else {
      console.log(`Output: ${name} = ${value}`);
    }
  }
}

/**
 * Logger factory
 */
export class LoggerFactory {
  private static instance: LoggerHook;
  
  static getLogger(): LoggerHook {
    if (!this.instance) {
      // Detect environment and create appropriate logger
      if (process.env.GITHUB_ACTIONS === 'true') {
        this.instance = new GitHubActionsLogger();
      } else {
        this.instance = new ConsoleLogger();
      }
    }
    return this.instance;
  }
  
  static setLogger(logger: LoggerHook): void {
    this.instance = logger;
  }
}