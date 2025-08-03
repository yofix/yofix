/**
 * Centralized File System Operations Wrapper
 * Provides consistent error handling and async operations for file system access
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { createModuleLogger } from '../error/ErrorHandlerFactory';
import { ErrorCategory, ErrorSeverity } from '../error/CentralizedErrorHandler';
import { executeOperation, retryOperation } from '../patterns/ConsistencyPatterns';

export interface FileOptions {
  encoding?: BufferEncoding;
  createIfNotExists?: boolean;
  createDirectories?: boolean;
  mode?: number;
  flag?: string;
}

export interface ReadOptions extends FileOptions {
  maxSize?: number; // Maximum file size to read (prevent OOM)
  json?: boolean; // Parse as JSON
}

export interface WriteOptions extends FileOptions {
  atomic?: boolean; // Write to temp file and rename
  backup?: boolean; // Create backup before overwriting
}

const logger = createModuleLogger({
  module: 'FileSystem',
  defaultCategory: ErrorCategory.FILE_SYSTEM
});

/**
 * Safe file system operations
 */
export class FileSystem {
  /**
   * Check if file exists
   */
  static async exists(filePath: string): Promise<boolean> {
    const result = await executeOperation(
      async () => {
        try {
          await fs.access(filePath, fsSync.constants.F_OK);
          return true;
        } catch {
          return false;
        }
      },
      {
        name: `Check file exists: ${path.basename(filePath)}`,
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.LOW,
        fallback: false
      }
    );
    
    return result.data ?? false;
  }

  /**
   * Read file with error handling
   */
  static async read(filePath: string, options: ReadOptions = {}): Promise<string | null> {
    const result = await executeOperation(
      async () => {
        // Check file size if maxSize specified
        if (options.maxSize) {
          const stats = await fs.stat(filePath);
          if (stats.size > options.maxSize) {
            throw new Error(`File size ${stats.size} exceeds maximum ${options.maxSize}`);
          }
        }

        const content = await fs.readFile(filePath, {
          encoding: options.encoding || 'utf-8',
          flag: options.flag
        });

        // Parse JSON if requested
        if (options.json) {
          try {
            return JSON.parse(content.toString());
          } catch (error) {
            throw new Error(`Failed to parse JSON from ${filePath}: ${error}`);
          }
        }

        return content.toString();
      },
      {
        name: `Read file: ${path.basename(filePath)}`,
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        metadata: { filePath, options },
        fallback: null
      }
    );

    return result.data;
  }

  /**
   * Write file with error handling
   */
  static async write(
    filePath: string, 
    content: string | Buffer | object,
    options: WriteOptions = {}
  ): Promise<boolean> {
    const result = await executeOperation(
      async () => {
        // Create directories if needed
        if (options.createDirectories) {
          await this.ensureDirectory(path.dirname(filePath));
        }

        // Convert object to JSON
        let data: string | Buffer;
        if (typeof content === 'object' && !Buffer.isBuffer(content)) {
          data = JSON.stringify(content, null, 2);
        } else {
          data = content;
        }

        // Create backup if requested
        if (options.backup && await this.exists(filePath)) {
          const backupPath = `${filePath}.backup`;
          await fs.copyFile(filePath, backupPath);
          logger.debug(`Created backup: ${backupPath}`);
        }

        // Write atomically if requested
        if (options.atomic) {
          const tempPath = `${filePath}.tmp`;
          await fs.writeFile(tempPath, data, {
            encoding: options.encoding || 'utf-8',
            mode: options.mode,
            flag: options.flag || 'w'
          });
          await fs.rename(tempPath, filePath);
        } else {
          await fs.writeFile(filePath, data, {
            encoding: options.encoding || 'utf-8',
            mode: options.mode,
            flag: options.flag || 'w'
          });
        }

        return true;
      },
      {
        name: `Write file: ${path.basename(filePath)}`,
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        metadata: { filePath, options },
        fallback: false
      }
    );

    return result.data ?? false;
  }

  /**
   * Delete file or directory with error handling
   */
  static async delete(filePath: string): Promise<boolean> {
    const result = await executeOperation(
      async () => {
        try {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            // Delete directory recursively
            await fs.rm(filePath, { recursive: true, force: true });
          } else {
            // Delete file
            await fs.unlink(filePath);
          }
          return true;
        } catch (error: any) {
          // If ENOENT, consider it already deleted
          if (error.code === 'ENOENT') {
            return true;
          }
          throw error;
        }
      },
      {
        name: `Delete: ${path.basename(filePath)}`,
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.LOW,
        metadata: { filePath },
        fallback: false
      }
    );

    return result.data ?? false;
  }

  /**
   * Create directory with parents
   */
  static async ensureDirectory(dirPath: string): Promise<boolean> {
    const result = await executeOperation(
      async () => {
        await fs.mkdir(dirPath, { recursive: true });
        return true;
      },
      {
        name: `Create directory: ${path.basename(dirPath)}`,
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.LOW,
        metadata: { dirPath },
        fallback: false
      }
    );

    return result.data ?? false;
  }

  /**
   * List directory contents
   */
  static async listDirectory(
    dirPath: string,
    options: {
      recursive?: boolean;
      filter?: (name: string) => boolean;
      includeHidden?: boolean;
    } = {}
  ): Promise<string[]> {
    const result = await executeOperation(
      async () => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        let files: string[] = [];

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          // Skip hidden files unless requested
          if (!options.includeHidden && entry.name.startsWith('.')) {
            continue;
          }

          // Apply filter if provided
          if (options.filter && !options.filter(entry.name)) {
            continue;
          }

          if (entry.isDirectory() && options.recursive) {
            const subFiles = await this.listDirectory(fullPath, options);
            files.push(...subFiles);
          } else if (entry.isFile()) {
            files.push(fullPath);
          }
        }

        return files;
      },
      {
        name: `List directory: ${path.basename(dirPath)}`,
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.LOW,
        metadata: { dirPath, options },
        fallback: []
      }
    );

    return result.data ?? [];
  }

  /**
   * Copy file with retry
   */
  static async copy(
    source: string, 
    destination: string,
    options: { overwrite?: boolean } = {}
  ): Promise<boolean> {
    return await retryOperation(
      async () => {
        // Check if destination exists
        if (!options.overwrite && await this.exists(destination)) {
          throw new Error(`Destination file already exists: ${destination}`);
        }

        // Ensure destination directory exists
        await this.ensureDirectory(path.dirname(destination));

        // Copy file
        await fs.copyFile(source, destination);
        return true;
      },
      {
        maxAttempts: 3,
        delayMs: 1000,
        backoff: true,
        onRetry: (attempt, error) => {
          logger.debug(`Copy retry ${attempt}: ${error.message}`);
        }
      }
    );
  }

  /**
   * Move file (with cross-device support)
   */
  static async move(source: string, destination: string): Promise<boolean> {
    const result = await executeOperation(
      async () => {
        try {
          // Try rename first (same device)
          await fs.rename(source, destination);
        } catch (error: any) {
          // If cross-device, copy and delete
          if (error.code === 'EXDEV') {
            await this.copy(source, destination);
            await this.delete(source);
          } else {
            throw error;
          }
        }
        return true;
      },
      {
        name: `Move file: ${path.basename(source)} to ${path.basename(destination)}`,
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        metadata: { source, destination },
        fallback: false
      }
    );

    return result.data ?? false;
  }

  /**
   * Get file stats
   */
  static async getStats(filePath: string): Promise<fsSync.Stats | null> {
    const result = await executeOperation(
      async () => await fs.stat(filePath),
      {
        name: `Get file stats: ${path.basename(filePath)}`,
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.LOW,
        metadata: { filePath },
        fallback: null
      }
    );

    return result.data;
  }

  /**
   * Watch file for changes
   */
  static async watch(
    filePath: string,
    callback: (event: string, filename: string) => void
  ): Promise<fsSync.FSWatcher | null> {
    try {
      return fsSync.watch(filePath, (event, filename) => {
        logger.debug(`File ${event}: ${filename}`);
        callback(event, filename);
      });
    } catch (error) {
      logger.error(`Failed to watch file ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Create temporary file
   */
  static async createTempFile(
    prefix: string = 'yofix',
    extension: string = '.tmp'
  ): Promise<string> {
    const tempDir = process.env.TMPDIR || '/tmp';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const tempPath = path.join(tempDir, `${prefix}-${timestamp}-${random}${extension}`);
    
    await this.write(tempPath, '', { createDirectories: true });
    return tempPath;
  }

  /**
   * Clean up old files
   */
  static async cleanupOldFiles(
    directory: string,
    maxAgeMs: number,
    pattern?: RegExp
  ): Promise<number> {
    let deletedCount = 0;
    const now = Date.now();

    try {
      const files = await this.listDirectory(directory);
      
      for (const file of files) {
        // Check pattern if provided
        if (pattern && !pattern.test(path.basename(file))) {
          continue;
        }

        const stats = await this.getStats(file);
        if (stats && (now - stats.mtime.getTime()) > maxAgeMs) {
          if (await this.delete(file)) {
            deletedCount++;
            logger.debug(`Deleted old file: ${file}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Cleanup failed: ${error}`);
    }

    return deletedCount;
  }
}

// Export convenience functions
export const {
  exists,
  read,
  write,
  delete: deleteFile,
  ensureDirectory,
  listDirectory,
  copy,
  move,
  getStats,
  watch,
  createTempFile,
  cleanupOldFiles
} = FileSystem;