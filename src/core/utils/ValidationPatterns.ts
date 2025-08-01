/**
 * Centralized Validation Patterns
 * Provides reusable validators and validation utilities
 */

import { createModuleLogger } from '../error/ErrorHandlerFactory';
import { ErrorCategory, ErrorSeverity } from '../error/CentralizedErrorHandler';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: Record<string, any>;
}

export interface ValidatorOptions {
  required?: boolean;
  trim?: boolean;
  normalize?: boolean;
}

const logger = createModuleLogger({
  module: 'ValidationPatterns',
  defaultCategory: ErrorCategory.VALIDATION
});

/**
 * Common validators
 */
export class Validators {
  /**
   * URL validation
   */
  static isURL(value: string, options: { protocols?: string[] } = {}): ValidationResult {
    if (!value) {
      return { valid: false, error: 'URL is required' };
    }

    try {
      const url = new URL(value);
      const allowedProtocols = options.protocols || ['http:', 'https:'];
      
      if (!allowedProtocols.includes(url.protocol)) {
        return {
          valid: false,
          error: `Protocol ${url.protocol} not allowed. Use: ${allowedProtocols.join(', ')}`
        };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Email validation
   */
  static isEmail(value: string): ValidationResult {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!value) {
      return { valid: false, error: 'Email is required' };
    }

    if (!emailRegex.test(value)) {
      return { valid: false, error: 'Invalid email format' };
    }

    return { valid: true };
  }

  /**
   * Selector validation (CSS/XPath)
   */
  static isSelector(value: string, type: 'css' | 'xpath' = 'css'): ValidationResult {
    if (!value) {
      return { valid: false, error: 'Selector is required' };
    }

    if (type === 'css') {
      try {
        // Test if it's a valid CSS selector by creating a dummy query
        document.createDocumentFragment().querySelector(value);
        return { valid: true };
      } catch {
        return { valid: false, error: 'Invalid CSS selector' };
      }
    } else {
      // Basic XPath validation
      if (!value.startsWith('/') && !value.startsWith('//')) {
        return { valid: false, error: 'XPath must start with / or //' };
      }
      return { valid: true };
    }
  }

  /**
   * GitHub token validation
   */
  static isGitHubToken(value: string): ValidationResult {
    if (!value) {
      return { valid: false, error: 'GitHub token is required' };
    }

    // GitHub tokens have specific prefixes
    const validPrefixes = ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'];
    const hasValidPrefix = validPrefixes.some(prefix => value.startsWith(prefix));

    if (!hasValidPrefix && !value.match(/^[a-f0-9]{40}$/)) {
      return { 
        valid: false, 
        error: 'Invalid GitHub token format',
        details: { 
          hint: 'Token should start with ghp_, gho_, etc. or be a 40-character hex string' 
        }
      };
    }

    return { valid: true };
  }

  /**
   * API key validation (generic)
   */
  static isAPIKey(value: string, options: { 
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    prefix?: string;
  } = {}): ValidationResult {
    if (!value) {
      return { valid: false, error: 'API key is required' };
    }

    const { minLength = 20, maxLength = 200, pattern, prefix } = options;

    if (value.length < minLength) {
      return { valid: false, error: `API key must be at least ${minLength} characters` };
    }

    if (value.length > maxLength) {
      return { valid: false, error: `API key must not exceed ${maxLength} characters` };
    }

    if (prefix && !value.startsWith(prefix)) {
      return { valid: false, error: `API key must start with ${prefix}` };
    }

    if (pattern && !pattern.test(value)) {
      return { valid: false, error: 'API key format is invalid' };
    }

    return { valid: true };
  }

  /**
   * Port number validation
   */
  static isPort(value: string | number): ValidationResult {
    const port = typeof value === 'string' ? parseInt(value, 10) : value;

    if (isNaN(port)) {
      return { valid: false, error: 'Port must be a number' };
    }

    if (port < 1 || port > 65535) {
      return { valid: false, error: 'Port must be between 1 and 65535' };
    }

    return { valid: true };
  }

  /**
   * Timeout validation (e.g., "30s", "5m", "1000ms")
   */
  static isTimeout(value: string): ValidationResult {
    const match = value.match(/^(\d+)(ms|s|m|h)?$/);
    
    if (!match) {
      return { 
        valid: false, 
        error: 'Invalid timeout format',
        details: { example: '30s, 5m, 1000ms' }
      };
    }

    const [, amount, unit = 'ms'] = match;
    const num = parseInt(amount, 10);

    if (num <= 0) {
      return { valid: false, error: 'Timeout must be positive' };
    }

    // Convert to milliseconds for max check
    const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000 };
    const ms = num * multipliers[unit as keyof typeof multipliers];

    if (ms > 3600000) { // 1 hour max
      return { valid: false, error: 'Timeout cannot exceed 1 hour' };
    }

    return { valid: true, details: { milliseconds: ms } };
  }

  /**
   * File path validation
   */
  static isFilePath(value: string, options: {
    mustExist?: boolean;
    allowRelative?: boolean;
    extensions?: string[];
  } = {}): ValidationResult {
    if (!value) {
      return { valid: false, error: 'File path is required' };
    }

    // Check for dangerous patterns
    if (value.includes('..') && !options.allowRelative) {
      return { valid: false, error: 'Relative paths with .. are not allowed' };
    }

    // Check extension if specified
    if (options.extensions && options.extensions.length > 0) {
      const hasValidExt = options.extensions.some(ext => 
        value.toLowerCase().endsWith(ext.toLowerCase())
      );
      if (!hasValidExt) {
        return { 
          valid: false, 
          error: `File must have one of these extensions: ${options.extensions.join(', ')}` 
        };
      }
    }

    return { valid: true };
  }

  /**
   * JSON string validation
   */
  static isJSON(value: string): ValidationResult {
    try {
      JSON.parse(value);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: 'Invalid JSON format',
        details: { parseError: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Semantic version validation
   */
  static isSemVer(value: string): ValidationResult {
    const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    
    if (!semverRegex.test(value)) {
      return { 
        valid: false, 
        error: 'Invalid semantic version',
        details: { example: '1.2.3, 1.0.0-alpha, 2.1.0+build123' }
      };
    }

    return { valid: true };
  }
}

/**
 * Validation builder for complex validations
 */
export class ValidationBuilder<T = any> {
  private validators: Array<(value: T) => ValidationResult> = [];
  private fieldName: string;

  constructor(fieldName: string) {
    this.fieldName = fieldName;
  }

  /**
   * Add custom validator
   */
  custom(validator: (value: T) => ValidationResult): this {
    this.validators.push(validator);
    return this;
  }

  /**
   * Required field
   */
  required(message?: string): this {
    this.validators.push((value) => {
      if (value === null || value === undefined || value === '') {
        return { valid: false, error: message || `${this.fieldName} is required` };
      }
      return { valid: true };
    });
    return this;
  }

  /**
   * String length validation
   */
  length(min?: number, max?: number): this {
    this.validators.push((value) => {
      const str = String(value);
      if (min !== undefined && str.length < min) {
        return { valid: false, error: `${this.fieldName} must be at least ${min} characters` };
      }
      if (max !== undefined && str.length > max) {
        return { valid: false, error: `${this.fieldName} must not exceed ${max} characters` };
      }
      return { valid: true };
    });
    return this;
  }

  /**
   * Pattern matching
   */
  pattern(regex: RegExp, message?: string): this {
    this.validators.push((value) => {
      if (!regex.test(String(value))) {
        return { valid: false, error: message || `${this.fieldName} format is invalid` };
      }
      return { valid: true };
    });
    return this;
  }

  /**
   * One of allowed values
   */
  oneOf(values: T[], message?: string): this {
    this.validators.push((value) => {
      if (!values.includes(value)) {
        return { 
          valid: false, 
          error: message || `${this.fieldName} must be one of: ${values.join(', ')}` 
        };
      }
      return { valid: true };
    });
    return this;
  }

  /**
   * Numeric range
   */
  range(min?: number, max?: number): this {
    this.validators.push((value) => {
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, error: `${this.fieldName} must be a number` };
      }
      if (min !== undefined && num < min) {
        return { valid: false, error: `${this.fieldName} must be at least ${min}` };
      }
      if (max !== undefined && num > max) {
        return { valid: false, error: `${this.fieldName} must not exceed ${max}` };
      }
      return { valid: true };
    });
    return this;
  }

  /**
   * Validate value
   */
  validate(value: T): ValidationResult {
    for (const validator of this.validators) {
      const result = validator(value);
      if (!result.valid) {
        return result;
      }
    }
    return { valid: true };
  }

  /**
   * Build validator function
   */
  build(): (value: T) => ValidationResult {
    return (value: T) => this.validate(value);
  }
}

/**
 * Validate multiple fields
 */
export class FormValidator<T extends Record<string, any>> {
  private rules: Map<keyof T, ValidationBuilder> = new Map();

  /**
   * Add field validation
   */
  field(name: keyof T): ValidationBuilder {
    const builder = new ValidationBuilder(String(name));
    this.rules.set(name, builder);
    return builder;
  }

  /**
   * Validate all fields
   */
  validate(data: T): { valid: boolean; errors: Record<keyof T, string> } {
    const errors: Record<string, string> = {};
    let valid = true;

    for (const [field, builder] of this.rules) {
      const result = builder.validate(data[field]);
      if (!result.valid) {
        errors[String(field)] = result.error!;
        valid = false;
      }
    }

    return { valid, errors: errors as Record<keyof T, string> };
  }
}

/**
 * Helper functions
 */
export function validate(value: any, validator: (value: any) => ValidationResult): void {
  const result = validator(value);
  if (!result.valid) {
    throw new Error(result.error);
  }
}

export function isValid(value: any, validator: (value: any) => ValidationResult): boolean {
  return validator(value).valid;
}

/**
 * Create reusable validator
 */
export function createValidator<T>(
  name: string,
  validationFn: (value: T) => boolean,
  errorMessage: string | ((value: T) => string)
): (value: T) => ValidationResult {
  return (value: T) => {
    if (!validationFn(value)) {
      const error = typeof errorMessage === 'function' ? errorMessage(value) : errorMessage;
      logger.debug(`Validation failed for ${name}: ${error}`);
      return { valid: false, error };
    }
    return { valid: true };
  };
}