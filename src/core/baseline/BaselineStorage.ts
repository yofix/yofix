import * as core from '@actions/core';
import * as crypto from 'crypto';
import { 
  Baseline, 
  BaselineStorageProvider, 
  BaselineQuery 
} from './types';
import { FirebaseStorage } from '../../providers/storage/FirebaseStorage';
import * as github from '@actions/github';

/**
 * Manages baseline storage and retrieval
 */
export class BaselineStorage implements BaselineStorageProvider {
  private firebaseStorage: FirebaseStorage;
  private baselines: Map<string, Baseline> = new Map();
  private baselineIndexPath = 'baselines/index.json';

  constructor(firebaseConfig?: any) {
    this.firebaseStorage = new FirebaseStorage(firebaseConfig);
  }

  /**
   * Initialize storage and load baseline index
   */
  async initialize(): Promise<void> {
    try {
      await this.firebaseStorage.initialize();
      await this.loadBaselineIndex();
    } catch (error) {
      core.warning(`Failed to initialize baseline storage: ${error.message}`);
    }
  }

  /**
   * Save a new baseline
   */
  async save(baselineData: Omit<Baseline, 'id' | 'storage'>): Promise<Baseline> {
    const id = this.generateId(baselineData);
    
    const baseline: Baseline = {
      id,
      ...baselineData,
      storage: {
        provider: 'firebase',
        path: `baselines/${id}/screenshot.png`
      }
    };

    // Store in memory
    this.baselines.set(id, baseline);
    
    // Persist index
    await this.saveBaselineIndex();
    
    return baseline;
  }

  /**
   * Get a baseline by ID
   */
  async get(id: string): Promise<Baseline | null> {
    return this.baselines.get(id) || null;
  }

  /**
   * Find baselines matching query
   */
  async find(query: BaselineQuery): Promise<Baseline[]> {
    let results = Array.from(this.baselines.values());
    
    // Filter by repository
    if (query.repository) {
      if (query.repository.owner) {
        results = results.filter(b => b.repository.owner === query.repository!.owner);
      }
      if (query.repository.name) {
        results = results.filter(b => b.repository.name === query.repository!.name);
      }
      if (query.repository.branch) {
        results = results.filter(b => b.repository.branch === query.repository!.branch);
      }
    }
    
    // Filter by route
    if (query.route) {
      results = results.filter(b => b.route === query.route);
    }
    
    // Filter by viewport
    if (query.viewport) {
      results = results.filter(b => b.viewport === query.viewport);
    }
    
    // Filter by commit
    if (query.commit) {
      results = results.filter(b => b.metadata.commit === query.commit);
    }
    
    // Filter by PR number
    if (query.prNumber !== undefined) {
      results = results.filter(b => b.metadata.prNumber === query.prNumber);
    }
    
    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(b => 
        b.metadata.tags && 
        query.tags!.some(tag => b.metadata.tags!.includes(tag))
      );
    }
    
    // Sort by updatedAt descending
    results.sort((a, b) => b.updatedAt - a.updatedAt);
    
    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 10;
    
    return results.slice(offset, offset + limit);
  }

  /**
   * Delete a baseline
   */
  async delete(id: string): Promise<boolean> {
    const baseline = this.baselines.get(id);
    if (!baseline) {
      return false;
    }
    
    // Delete from storage
    try {
      await this.firebaseStorage.deleteFile(baseline.storage.path);
    } catch (error) {
      core.warning(`Failed to delete baseline image: ${error.message}`);
    }
    
    // Remove from memory
    this.baselines.delete(id);
    
    // Update index
    await this.saveBaselineIndex();
    
    return true;
  }

  /**
   * Get baseline image
   */
  async getImage(baseline: Baseline): Promise<Buffer> {
    const url = await this.firebaseStorage.getSignedUrl(baseline.storage.path);
    
    // Fetch image from URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch baseline image: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Save baseline image
   */
  async saveImage(buffer: Buffer, metadata: any): Promise<string> {
    const fingerprint = this.calculateFingerprint(buffer);
    const path = `baselines/${fingerprint}/screenshot.png`;
    
    const url = await this.firebaseStorage.uploadFile(path, buffer, {
      contentType: 'image/png',
      metadata: {
        ...metadata,
        fingerprint,
        uploadedAt: new Date().toISOString()
      }
    });
    
    return path;
  }

  /**
   * Load baseline index from storage
   */
  private async loadBaselineIndex(): Promise<void> {
    try {
      const url = await this.firebaseStorage.getSignedUrl(this.baselineIndexPath);
      const response = await fetch(url);
      
      if (response.ok) {
        const index = await response.json();
        
        // Reconstruct Map from saved data
        for (const baseline of index.baselines) {
          this.baselines.set(baseline.id, baseline);
        }
        
        core.info(`Loaded ${this.baselines.size} baselines from storage`);
      }
    } catch (error) {
      core.warning(`No existing baseline index found: ${error.message}`);
    }
  }

  /**
   * Save baseline index to storage
   */
  private async saveBaselineIndex(): Promise<void> {
    const index = {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      count: this.baselines.size,
      baselines: Array.from(this.baselines.values())
    };
    
    const buffer = Buffer.from(JSON.stringify(index, null, 2));
    
    await this.firebaseStorage.uploadFile(this.baselineIndexPath, buffer, {
      contentType: 'application/json',
      metadata: {
        updatedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Generate unique ID for baseline
   */
  private generateId(baseline: Omit<Baseline, 'id' | 'storage'>): string {
    const parts = [
      baseline.repository.owner,
      baseline.repository.name,
      baseline.repository.branch,
      baseline.route,
      baseline.viewport,
      baseline.metadata.commit
    ];
    
    return crypto
      .createHash('sha256')
      .update(parts.join('-'))
      .digest('hex')
      .substring(0, 12);
  }

  /**
   * Calculate fingerprint for image
   */
  private calculateFingerprint(buffer: Buffer): string {
    return crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
  }

  /**
   * Get current repository info
   */
  static getCurrentRepository(): Baseline['repository'] {
    const context = github.context;
    
    return {
      owner: context.repo.owner,
      name: context.repo.repo,
      branch: context.ref?.replace('refs/heads/', '') || 'main'
    };
  }
}