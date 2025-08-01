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
exports.cleanupOldFiles = exports.createTempFile = exports.watch = exports.getStats = exports.move = exports.copy = exports.listDirectory = exports.ensureDirectory = exports.deleteFile = exports.write = exports.read = exports.exists = exports.FileSystem = void 0;
const fs = __importStar(require("fs/promises"));
const fsSync = __importStar(require("fs"));
const path = __importStar(require("path"));
const ErrorHandlerFactory_1 = require("../error/ErrorHandlerFactory");
const CentralizedErrorHandler_1 = require("../error/CentralizedErrorHandler");
const ConsistencyPatterns_1 = require("../patterns/ConsistencyPatterns");
const logger = (0, ErrorHandlerFactory_1.createModuleLogger)({
    module: 'FileSystem',
    defaultCategory: CentralizedErrorHandler_1.ErrorCategory.FILE_SYSTEM
});
class FileSystem {
    static async exists(filePath) {
        const result = await (0, ConsistencyPatterns_1.executeOperation)(async () => {
            try {
                await fs.access(filePath, fsSync.constants.F_OK);
                return true;
            }
            catch {
                return false;
            }
        }, {
            name: `Check file exists: ${path.basename(filePath)}`,
            category: CentralizedErrorHandler_1.ErrorCategory.FILE_SYSTEM,
            severity: CentralizedErrorHandler_1.ErrorSeverity.LOW,
            fallback: false
        });
        return result.data ?? false;
    }
    static async read(filePath, options = {}) {
        const result = await (0, ConsistencyPatterns_1.executeOperation)(async () => {
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
            if (options.json) {
                try {
                    return JSON.parse(content.toString());
                }
                catch (error) {
                    throw new Error(`Failed to parse JSON from ${filePath}: ${error}`);
                }
            }
            return content.toString();
        }, {
            name: `Read file: ${path.basename(filePath)}`,
            category: CentralizedErrorHandler_1.ErrorCategory.FILE_SYSTEM,
            severity: CentralizedErrorHandler_1.ErrorSeverity.MEDIUM,
            metadata: { filePath, options },
            fallback: null
        });
        return result.data;
    }
    static async write(filePath, content, options = {}) {
        const result = await (0, ConsistencyPatterns_1.executeOperation)(async () => {
            if (options.createDirectories) {
                await this.ensureDirectory(path.dirname(filePath));
            }
            let data;
            if (typeof content === 'object' && !Buffer.isBuffer(content)) {
                data = JSON.stringify(content, null, 2);
            }
            else {
                data = content;
            }
            if (options.backup && await this.exists(filePath)) {
                const backupPath = `${filePath}.backup`;
                await fs.copyFile(filePath, backupPath);
                logger.debug(`Created backup: ${backupPath}`);
            }
            if (options.atomic) {
                const tempPath = `${filePath}.tmp`;
                await fs.writeFile(tempPath, data, {
                    encoding: options.encoding || 'utf-8',
                    mode: options.mode,
                    flag: options.flag || 'w'
                });
                await fs.rename(tempPath, filePath);
            }
            else {
                await fs.writeFile(filePath, data, {
                    encoding: options.encoding || 'utf-8',
                    mode: options.mode,
                    flag: options.flag || 'w'
                });
            }
            return true;
        }, {
            name: `Write file: ${path.basename(filePath)}`,
            category: CentralizedErrorHandler_1.ErrorCategory.FILE_SYSTEM,
            severity: CentralizedErrorHandler_1.ErrorSeverity.MEDIUM,
            metadata: { filePath, options },
            fallback: false
        });
        return result.data ?? false;
    }
    static async delete(filePath) {
        const result = await (0, ConsistencyPatterns_1.executeOperation)(async () => {
            await fs.unlink(filePath);
            return true;
        }, {
            name: `Delete file: ${path.basename(filePath)}`,
            category: CentralizedErrorHandler_1.ErrorCategory.FILE_SYSTEM,
            severity: CentralizedErrorHandler_1.ErrorSeverity.LOW,
            metadata: { filePath },
            fallback: false
        });
        return result.data ?? false;
    }
    static async ensureDirectory(dirPath) {
        const result = await (0, ConsistencyPatterns_1.executeOperation)(async () => {
            await fs.mkdir(dirPath, { recursive: true });
            return true;
        }, {
            name: `Create directory: ${path.basename(dirPath)}`,
            category: CentralizedErrorHandler_1.ErrorCategory.FILE_SYSTEM,
            severity: CentralizedErrorHandler_1.ErrorSeverity.LOW,
            metadata: { dirPath },
            fallback: false
        });
        return result.data ?? false;
    }
    static async listDirectory(dirPath, options = {}) {
        const result = await (0, ConsistencyPatterns_1.executeOperation)(async () => {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            let files = [];
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (!options.includeHidden && entry.name.startsWith('.')) {
                    continue;
                }
                if (options.filter && !options.filter(entry.name)) {
                    continue;
                }
                if (entry.isDirectory() && options.recursive) {
                    const subFiles = await this.listDirectory(fullPath, options);
                    files.push(...subFiles);
                }
                else if (entry.isFile()) {
                    files.push(fullPath);
                }
            }
            return files;
        }, {
            name: `List directory: ${path.basename(dirPath)}`,
            category: CentralizedErrorHandler_1.ErrorCategory.FILE_SYSTEM,
            severity: CentralizedErrorHandler_1.ErrorSeverity.LOW,
            metadata: { dirPath, options },
            fallback: []
        });
        return result.data ?? [];
    }
    static async copy(source, destination, options = {}) {
        return await (0, ConsistencyPatterns_1.retryOperation)(async () => {
            if (!options.overwrite && await this.exists(destination)) {
                throw new Error(`Destination file already exists: ${destination}`);
            }
            await this.ensureDirectory(path.dirname(destination));
            await fs.copyFile(source, destination);
            return true;
        }, {
            maxAttempts: 3,
            delayMs: 1000,
            backoff: true,
            onRetry: (attempt, error) => {
                logger.debug(`Copy retry ${attempt}: ${error.message}`);
            }
        });
    }
    static async move(source, destination) {
        const result = await (0, ConsistencyPatterns_1.executeOperation)(async () => {
            try {
                await fs.rename(source, destination);
            }
            catch (error) {
                if (error.code === 'EXDEV') {
                    await this.copy(source, destination);
                    await this.delete(source);
                }
                else {
                    throw error;
                }
            }
            return true;
        }, {
            name: `Move file: ${path.basename(source)} to ${path.basename(destination)}`,
            category: CentralizedErrorHandler_1.ErrorCategory.FILE_SYSTEM,
            severity: CentralizedErrorHandler_1.ErrorSeverity.MEDIUM,
            metadata: { source, destination },
            fallback: false
        });
        return result.data ?? false;
    }
    static async getStats(filePath) {
        const result = await (0, ConsistencyPatterns_1.executeOperation)(async () => await fs.stat(filePath), {
            name: `Get file stats: ${path.basename(filePath)}`,
            category: CentralizedErrorHandler_1.ErrorCategory.FILE_SYSTEM,
            severity: CentralizedErrorHandler_1.ErrorSeverity.LOW,
            metadata: { filePath },
            fallback: null
        });
        return result.data;
    }
    static async watch(filePath, callback) {
        try {
            return fsSync.watch(filePath, (event, filename) => {
                logger.debug(`File ${event}: ${filename}`);
                callback(event, filename);
            });
        }
        catch (error) {
            logger.error(`Failed to watch file ${filePath}: ${error}`);
            return null;
        }
    }
    static async createTempFile(prefix = 'yofix', extension = '.tmp') {
        const tempDir = process.env.TMPDIR || '/tmp';
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const tempPath = path.join(tempDir, `${prefix}-${timestamp}-${random}${extension}`);
        await this.write(tempPath, '', { createDirectories: true });
        return tempPath;
    }
    static async cleanupOldFiles(directory, maxAgeMs, pattern) {
        let deletedCount = 0;
        const now = Date.now();
        try {
            const files = await this.listDirectory(directory);
            for (const file of files) {
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
        }
        catch (error) {
            logger.error(`Cleanup failed: ${error}`);
        }
        return deletedCount;
    }
}
exports.FileSystem = FileSystem;
exports.exists = FileSystem.exists, exports.read = FileSystem.read, exports.write = FileSystem.write, exports.deleteFile = FileSystem.delete, exports.ensureDirectory = FileSystem.ensureDirectory, exports.listDirectory = FileSystem.listDirectory, exports.copy = FileSystem.copy, exports.move = FileSystem.move, exports.getStats = FileSystem.getStats, exports.watch = FileSystem.watch, exports.createTempFile = FileSystem.createTempFile, exports.cleanupOldFiles = FileSystem.cleanupOldFiles;
