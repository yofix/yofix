/**
 * Baseline management types and interfaces
 */

export interface Baseline {
  id: string;
  repository: {
    owner: string;
    name: string;
    branch: string;
  };
  route: string;
  viewport: string;
  createdAt: number;
  updatedAt: number;
  metadata: {
    commit: string;
    author: string;
    prNumber?: number;
    tags?: string[];
  };
  storage: {
    provider: 'firebase' | 's3' | 'local';
    path: string;
    url?: string;
    size?: number;
  };
  fingerprint: string; // Hash of the image for quick comparison
  dimensions: {
    width: number;
    height: number;
  };
}

export interface BaselineComparison {
  baseline: Baseline;
  current: {
    screenshot: Buffer;
    metadata: {
      commit: string;
      timestamp: number;
    };
  };
  diff: {
    hasDifferences: boolean;
    percentage: number;
    pixelsDiff: number;
    totalPixels: number;
    diffImage?: Buffer;
    regions?: DiffRegion[];
  };
}

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'added' | 'removed' | 'changed';
  confidence: number;
}

export interface BaselineStorageProvider {
  save(baseline: Omit<Baseline, 'id' | 'storage'>): Promise<Baseline>;
  get(id: string): Promise<Baseline | null>;
  find(query: BaselineQuery): Promise<Baseline[]>;
  delete(id: string): Promise<boolean>;
  getImage(baseline: Baseline): Promise<Buffer>;
  saveImage(buffer: Buffer, metadata: any): Promise<string>;
}

export interface BaselineQuery {
  repository?: {
    owner?: string;
    name?: string;
    branch?: string;
  };
  route?: string;
  viewport?: string;
  commit?: string;
  prNumber?: number;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface BaselineStrategy {
  name: string;
  description: string;
  selectBaseline(
    query: BaselineQuery,
    candidates: Baseline[]
  ): Baseline | null;
}

export interface BaselineUpdateRequest {
  prNumber: number;
  routes?: string[];
  viewports?: string[];
  screenshots: Array<{
    route: string;
    viewport: string;
    buffer: Buffer;
    metadata?: any;
  }>;
}