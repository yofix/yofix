/**
 * Core YoFix utilities for centralized error handling and GitHub interactions
 */

// GitHub Comment Engine
export {
  GitHubCommentEngine,
  getGitHubCommentEngine,
  CommentOptions,
  ErrorContext
} from './github/GitHubCommentEngine';

// Centralized Error Handler
export {
  CentralizedErrorHandler,
  errorHandler,
  YoFixError,
  ErrorSeverity,
  ErrorCategory,
  ErrorOptions
} from './error/CentralizedErrorHandler';

// Bot Activity Handler
export {
  BotActivityHandler,
  botActivity,
  BotActivity,
  BotActivityStep
} from './bot/BotActivityHandler';

// Error Handler Factory
export {
  createModuleLogger,
  createTryCatch,
  wrapAsync,
  ModuleErrorOptions,
  LoggerInterface
} from './error/ErrorHandlerFactory';

// Consistency Patterns
export {
  executeOperation,
  GitHubOperations,
  BotOperations,
  ConfigPattern,
  retryOperation,
  executeParallel,
  OperationResult
} from './patterns/ConsistencyPatterns';

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerConfig,
  CircuitBreakerError,
  CircuitBreakerFactory,
  CircuitBreakerStats,
  CircuitState,
  WithCircuitBreaker,
  withCircuitBreaker
} from './patterns/CircuitBreaker';

// Configuration Manager
export {
  ConfigurationManager,
  config,
  getRequiredConfig,
  getOptionalConfig,
  getSecretConfig,
  getBooleanConfig,
  getNumberConfig,
  getArrayConfig,
  getJSONConfig,
  ConfigOptions,
  ValidationRule
} from './config/ConfigurationManager';

// JSON Parser
export {
  safeJSONParse,
  parseJSONAs,
  safeJSONStringify,
  jsonClone,
  mergeJSON,
  TypeGuards,
  ParseOptions,
  ParseResult
} from './utils/JSONParser';

// File System Wrapper
export {
  FileSystem,
  exists,
  read,
  write,
  deleteFile,
  ensureDirectory,
  listDirectory,
  copy,
  move,
  getStats,
  watch,
  createTempFile,
  cleanupOldFiles,
  FileOptions,
  ReadOptions,
  WriteOptions
} from './utils/FileSystemWrapper';

// Validation Patterns
export {
  Validators,
  ValidationBuilder,
  FormValidator,
  ValidationResult,
  ValidatorOptions,
  validate,
  isValid,
  createValidator
} from './utils/ValidationPatterns';

// Async Utilities
export {
  withTimeout,
  delay,
  sleep,
  retryWithBackoff,
  throttle,
  debounce,
  concurrent,
  createDeferred,
  parseTimeout,
  allSettled,
  raceWithCleanup,
  TimeoutOptions,
  DelayOptions,
  ThrottleOptions,
  DebounceOptions,
  ConcurrencyOptions
} from './utils/AsyncUtilities';

// Import the instances we need for the functions
import { errorHandler } from './error/CentralizedErrorHandler';
import { getGitHubCommentEngine } from './github/GitHubCommentEngine';

/**
 * Initialize all core services
 */
export function initializeCoreServices(githubToken: string): void {
  // Initialize error handler with GitHub integration
  errorHandler.initialize(githubToken);
  
  // Initialize global comment engine
  getGitHubCommentEngine(githubToken);
  
  // Log initialization
  console.log('✅ YoFix core services initialized');
}

/**
 * Cleanup and post summaries
 */
export async function finalizeCoreServices(): Promise<void> {
  // Post error summary if there were any errors
  await errorHandler.postErrorSummary();
  
  // Reset for next run
  errorHandler.reset();
}