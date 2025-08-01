/**
 * Centralized JSON Parser with consistent error handling
 * Handles multiple JSON formats and provides detailed error messages
 */

import { createModuleLogger } from '../error/ErrorHandlerFactory';
import { ErrorCategory, ErrorSeverity } from '../error/CentralizedErrorHandler';

export interface ParseOptions {
  /**
   * Allow multiple JSON objects in the input
   */
  allowMultiple?: boolean;
  /**
   * Extract JSON from markdown code blocks
   */
  extractFromMarkdown?: boolean;
  /**
   * Default value if parsing fails
   */
  defaultValue?: any;
  /**
   * Validate parsed result
   */
  validate?: (data: any) => boolean;
  /**
   * Transform parsed result
   */
  transform?: (data: any) => any;
  /**
   * Maximum content length to parse (prevent DoS)
   */
  maxLength?: number;
}

export interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    sourceFormat?: 'raw' | 'markdown' | 'multiple';
    objectCount?: number;
    truncated?: boolean;
  };
}

const logger = createModuleLogger({
  module: 'JSONParser',
  defaultCategory: ErrorCategory.PROCESSING
});

/**
 * Safe JSON parse with error handling
 */
export function safeJSONParse<T = any>(
  content: string,
  options: ParseOptions = {}
): ParseResult<T> {
  // Check max length
  if (options.maxLength && content.length > options.maxLength) {
    return {
      success: false,
      error: `Content exceeds maximum length of ${options.maxLength} characters`,
      metadata: { truncated: true }
    };
  }

  try {
    let jsonContent = content.trim();
    let sourceFormat: 'raw' | 'markdown' | 'multiple' = 'raw';

    // Extract from markdown if needed
    if (options.extractFromMarkdown) {
      const extracted = extractJSONFromMarkdown(jsonContent);
      if (extracted) {
        jsonContent = extracted;
        sourceFormat = 'markdown';
      }
    }

    // Try to parse as single JSON object
    try {
      const parsed = JSON.parse(jsonContent);
      
      // Validate if provided
      if (options.validate && !options.validate(parsed)) {
        throw new Error('Validation failed');
      }

      // Transform if provided
      const result = options.transform ? options.transform(parsed) : parsed;

      return {
        success: true,
        data: result,
        metadata: { sourceFormat, objectCount: 1 }
      };
    } catch (error) {
      // If single parse fails and allowMultiple, try multiple objects
      if (options.allowMultiple) {
        const multiResult = parseMultipleJSON(jsonContent, options);
        if (multiResult.success) {
          return multiResult as ParseResult<T>;
        }
      }
      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.debug(`JSON parse failed: ${errorMessage}`, { 
      contentPreview: content.substring(0, 100) 
    });

    // Return default value if provided
    if (options.defaultValue !== undefined) {
      return {
        success: true,
        data: options.defaultValue,
        error: errorMessage,
        metadata: { sourceFormat: 'raw' }
      };
    }

    return {
      success: false,
      error: `Failed to parse JSON: ${errorMessage}`
    };
  }
}

/**
 * Parse multiple JSON objects from a string
 */
function parseMultipleJSON<T>(
  content: string,
  options: ParseOptions
): ParseResult<T[]> {
  const objects: T[] = [];
  const lines = content.split('\n');
  let currentObject = '';
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      currentObject += char;

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;

        if (braceCount === 0 && currentObject.trim()) {
          try {
            const parsed = JSON.parse(currentObject);
            if (!options.validate || options.validate(parsed)) {
              const result = options.transform ? options.transform(parsed) : parsed;
              objects.push(result);
            }
          } catch (error) {
            // Skip invalid objects
            logger.debug(`Skipping invalid JSON object: ${error}`);
          }
          currentObject = '';
        }
      }
    }
  }

  if (objects.length > 0) {
    return {
      success: true,
      data: objects as any,
      metadata: { 
        sourceFormat: 'multiple', 
        objectCount: objects.length 
      }
    };
  }

  return {
    success: false,
    error: 'No valid JSON objects found'
  };
}

/**
 * Extract JSON from markdown code blocks
 */
function extractJSONFromMarkdown(content: string): string | null {
  // Try to find JSON in code blocks
  const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  const matches = Array.from(content.matchAll(codeBlockRegex));
  
  for (const match of matches) {
    const possibleJSON = match[1].trim();
    try {
      JSON.parse(possibleJSON);
      return possibleJSON;
    } catch {
      // Continue to next match
    }
  }

  // Try to find inline JSON
  const jsonRegex = /(\{[\s\S]*\}|\[[\s\S]*\])/;
  const match = content.match(jsonRegex);
  if (match) {
    try {
      JSON.parse(match[1]);
      return match[1];
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

/**
 * Parse JSON with type checking
 */
export function parseJSONAs<T>(
  content: string,
  typeGuard: (data: any) => data is T,
  options: ParseOptions = {}
): ParseResult<T> {
  const result = safeJSONParse(content, {
    ...options,
    validate: typeGuard
  });

  if (result.success && !typeGuard(result.data)) {
    return {
      success: false,
      error: 'Parsed data does not match expected type'
    };
  }

  return result as ParseResult<T>;
}

/**
 * Common type guards
 */
export const TypeGuards = {
  isString: (data: any): data is string => typeof data === 'string',
  isNumber: (data: any): data is number => typeof data === 'number',
  isBoolean: (data: any): data is boolean => typeof data === 'boolean',
  isArray: (data: any): data is any[] => Array.isArray(data),
  isObject: (data: any): data is Record<string, any> => 
    data !== null && typeof data === 'object' && !Array.isArray(data),
  isStringArray: (data: any): data is string[] => 
    Array.isArray(data) && data.every(item => typeof item === 'string'),
  hasProperty: <K extends string>(key: K) => 
    (data: any): data is Record<K, any> => 
      data !== null && typeof data === 'object' && key in data
};

/**
 * Stringify with error handling
 */
export function safeJSONStringify(
  data: any,
  options: {
    pretty?: boolean;
    replacer?: (key: string, value: any) => any;
    maxDepth?: number;
  } = {}
): ParseResult<string> {
  try {
    // Handle circular references
    const seen = new WeakSet();
    const replacer = (key: string, value: any) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return options.replacer ? options.replacer(key, value) : value;
    };

    const result = JSON.stringify(
      data, 
      replacer, 
      options.pretty ? 2 : undefined
    );

    return {
      success: true,
      data: result
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`JSON stringify failed: ${errorMessage}`);
    
    return {
      success: false,
      error: `Failed to stringify JSON: ${errorMessage}`
    };
  }
}

/**
 * Deep clone using JSON
 */
export function jsonClone<T>(data: T): T | null {
  const stringified = safeJSONStringify(data);
  if (!stringified.success) return null;
  
  const parsed = safeJSONParse<T>(stringified.data!);
  return parsed.success ? parsed.data! : null;
}

/**
 * Merge JSON objects safely
 */
export function mergeJSON<T extends object>(
  ...objects: Partial<T>[]
): T {
  const result = {} as T;
  
  for (const obj of objects) {
    if (obj && typeof obj === 'object') {
      Object.assign(result, jsonClone(obj) || obj);
    }
  }
  
  return result;
}