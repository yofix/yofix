import { StorageProvider } from '../../providers/storage/types';
import { LoginSchema, LoginSchemaGenerator } from './LoginSchemaGenerator';
import * as crypto from 'crypto';
import * as core from '@actions/core';

/**
 * Manages login schemas with Firebase/S3 storage
 * Similar to BaselineManager for visual baselines
 */
export class LoginSchemaManager {
  private storage: StorageProvider;
  private generator: LoginSchemaGenerator;
  private cacheDir: string;

  constructor(storage: StorageProvider, claudeApiKey: string, cacheDir: string = '.yofix-cache/schemas') {
    this.storage = storage;
    this.generator = new LoginSchemaGenerator(claudeApiKey);
    this.cacheDir = cacheDir;
  }

  /**
   * Get or generate login schema with aggressive caching
   *
   * PRIORITY: Reliability + subsequent run speed
   * - First run: 30s (Babel + LLM + validation)
   * - Subsequent runs: <1s (load from cache)
   */
  async getOrGenerateSchema(
    loginUrl: string,
    sourceFiles: string[],
    options: {
      forceRegenerate?: boolean;
      model?: string;
      testCredentials?: { email: string; password: string };
    } = {}
  ): Promise<LoginSchema> {
    const schemaKey = this.generateSchemaKey(loginUrl, sourceFiles);
    const storagePath = `schemas/${schemaKey}.json`;

    // Step 1: Try remote storage (FAST path - <1s)
    if (!options.forceRegenerate) {
      try {
        core.info(`🔍 Checking remote storage: ${schemaKey}`);
        const remoteSchema = await this.storage.downloadFile(storagePath);
        if (remoteSchema) {
          const schema: LoginSchema = JSON.parse(remoteSchema.toString('utf-8'));

          // Validate schema is still current
          if (LoginSchemaGenerator.isSchemaCurrent(schema, sourceFiles)) {
            core.info(`✅ Using cached schema (instant!)`);
            core.info(`   Generated: ${schema.meta.generatedAt}`);
            core.info(`   Library: ${schema.meta.detectedLibrary}`);
            core.info(`   Validated: ${(schema as any).validated ? 'Yes' : 'N/A'}`);
            return schema;
          } else {
            core.info(`⚠️  Cached schema outdated, regenerating...`);
          }
        } else {
          core.info(`📝 No cached schema found - first run`);
        }
      } catch (error) {
        core.debug(`Cache miss: ${error.message}`);
      }
    } else {
      core.info(`🔄 Force regenerate requested`);
    }

    // Step 2: Generate new schema (RELIABLE path - may take 30s)
    core.info(`🎯 Generating schema with RELIABILITY priority...`);
    core.info(`   This may take 30s but ensures 100% correctness`);
    core.info(`   Subsequent runs will be instant (<1s)`);

    const { ReliableSchemaGenerator } = await import('./ReliableSchemaGenerator');
    const reliableGenerator = new ReliableSchemaGenerator(this.claudeApiKey);

    const schemaWithValidation = await reliableGenerator.generateReliableSchema(sourceFiles, {
      loginUrl,
      model: options.model,
      testCredentials: options.testCredentials
    });

    // Step 3: Save to remote storage for instant subsequent runs
    try {
      core.info(`💾 Caching schema to remote storage...`);
      const schemaJson = JSON.stringify(schemaWithValidation, null, 2);
      await this.storage.uploadFile(storagePath, Buffer.from(schemaJson, 'utf-8'), 'application/json');
      core.info(`✅ Schema cached! All future runs will be instant.`);
      core.info(`   Path: ${storagePath}`);
    } catch (error) {
      core.warning(`Failed to cache schema: ${error.message}`);
    }

    return schemaWithValidation;
  }

  /**
   * Generate unique key for schema based on URL and source files
   * Similar to how we generate baseline keys
   */
  private generateSchemaKey(loginUrl: string, sourceFiles: string[]): string {
    // Create deterministic key from URL and file list
    const urlHash = crypto
      .createHash('md5')
      .update(loginUrl)
      .digest('hex')
      .substring(0, 8);

    const filesHash = crypto
      .createHash('md5')
      .update(sourceFiles.sort().join('|'))
      .digest('hex')
      .substring(0, 8);

    // Extract domain for readability
    const domain = new URL(loginUrl).hostname.replace(/\./g, '-');

    return `${domain}-${urlHash}-${filesHash}`;
  }

  /**
   * Generate version string from source file modifications
   */
  private generateVersion(sourceFiles: string[]): string {
    const fs = require('fs');
    const mtimes = sourceFiles
      .map((file) => {
        try {
          const stats = fs.statSync(file);
          return stats.mtime.getTime();
        } catch {
          return 0;
        }
      })
      .sort();

    const hash = crypto
      .createHash('md5')
      .update(mtimes.join('|'))
      .digest('hex')
      .substring(0, 8);

    return `v1.${hash}`;
  }

  /**
   * List all schemas in storage
   */
  async listSchemas(): Promise<string[]> {
    try {
      return await this.storage.listFiles('schemas/');
    } catch (error) {
      core.warning(`Failed to list schemas: ${error.message}`);
      return [];
    }
  }

  /**
   * Delete schema from storage
   */
  async deleteSchema(loginUrl: string, sourceFiles: string[]): Promise<void> {
    const schemaKey = this.generateSchemaKey(loginUrl, sourceFiles);
    const storagePath = `schemas/${schemaKey}.json`;

    try {
      await this.storage.deleteFile(storagePath);
      core.info(`🗑️  Deleted schema: ${storagePath}`);
    } catch (error) {
      core.warning(`Failed to delete schema: ${error.message}`);
    }
  }

  /**
   * Clear all schemas (for testing or forcing regeneration)
   */
  async clearAllSchemas(): Promise<void> {
    const schemas = await this.listSchemas();
    core.info(`🗑️  Clearing ${schemas.length} schemas...`);

    for (const schema of schemas) {
      try {
        await this.storage.deleteFile(schema);
      } catch (error) {
        core.warning(`Failed to delete ${schema}: ${error.message}`);
      }
    }

    core.info(`✅ Cleared all schemas`);
  }

  /**
   * Get schema metadata without downloading full schema
   */
  async getSchemaMetadata(loginUrl: string, sourceFiles: string[]): Promise<{
    exists: boolean;
    key: string;
    storagePath: string;
  }> {
    const schemaKey = this.generateSchemaKey(loginUrl, sourceFiles);
    const storagePath = `schemas/${schemaKey}.json`;

    try {
      const exists = await this.storage.fileExists(storagePath);
      return { exists, key: schemaKey, storagePath };
    } catch {
      return { exists: false, key: schemaKey, storagePath };
    }
  }
}
