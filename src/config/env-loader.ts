/**
 * Environment file loader
 * Loads .env.local files and integrates them with the smart defaults system
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Parse .env format file content
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  
  const lines = content.split('\n');
  for (const line of lines) {
    // Skip comments and empty lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // Parse KEY=VALUE format
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }
    
    const key = trimmed.substring(0, equalIndex).trim();
    let value = trimmed.substring(equalIndex + 1).trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    result[key] = value;
  }
  
  return result;
}

/**
 * Load environment variables from .env.local file
 */
export function loadEnvLocal(rootDir?: string): Record<string, string> {
  const projectRoot = rootDir || process.cwd();
  const envLocalPath = path.join(projectRoot, '.env.local');
  
  if (!fs.existsSync(envLocalPath)) {
    return {};
  }
  
  try {
    const content = fs.readFileSync(envLocalPath, 'utf8');
    return parseEnvFile(content);
  } catch (error) {
    console.warn(`Warning: Could not load .env.local file: ${error}`);
    return {};
  }
}

/**
 * Load and merge environment variables from multiple sources
 * Priority: process.env > .env.local > defaults
 */
export function loadEnvironmentConfig(): Record<string, string> {
  const envLocal = loadEnvLocal();
  
  // Merge with current process.env, giving precedence to process.env
  const merged: Record<string, string> = {};
  
  // First add .env.local values
  Object.assign(merged, envLocal);
  
  // Then override with process.env values
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  
  return merged;
}

/**
 * Initialize environment from .env.local if not already set
 * This should be called early in the application lifecycle
 */
export function initializeEnvironment(): void {
  const envLocal = loadEnvLocal();
  
  // Only set variables that aren't already in process.env
  for (const [key, value] of Object.entries(envLocal)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}