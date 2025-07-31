import * as core from '@actions/core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { 
  BaselineComparison, 
  DiffRegion, 
  Baseline 
} from './types';

/**
 * Visual diff generator using pixel comparison
 */
export class VisualDiffer {
  private threshold: number;
  private includeAA: boolean;
  private alpha: number;
  private diffColor: [number, number, number];

  constructor(options?: {
    threshold?: number;
    includeAA?: boolean;
    alpha?: number;
    diffColor?: [number, number, number];
  }) {
    this.threshold = options?.threshold || 0.1; // 10% difference threshold
    this.includeAA = options?.includeAA ?? true; // Include anti-aliasing
    this.alpha = options?.alpha || 0.1; // Transparency for diff overlay
    this.diffColor = options?.diffColor || [255, 0, 255]; // Magenta
  }

  /**
   * Compare current screenshot with baseline
   */
  async compare(
    baseline: Baseline,
    currentBuffer: Buffer,
    metadata?: any
  ): Promise<BaselineComparison> {
    try {
      // Parse PNG images
      const baselineImage = await this.parsePNG(baseline);
      const currentImage = PNG.sync.read(currentBuffer);
      
      // Ensure images have same dimensions
      const { width, height, resized } = this.ensureSameDimensions(
        baselineImage,
        currentImage
      );
      
      // Create diff image
      const diffImage = new PNG({ width, height });
      
      // Perform pixel comparison
      const pixelsDiff = pixelmatch(
        resized.baseline.data,
        resized.current.data,
        diffImage.data,
        width,
        height,
        {
          threshold: this.threshold,
          includeAA: this.includeAA,
          alpha: this.alpha,
          diffColor: this.diffColor,
          diffColorAlt: [0, 255, 0], // Green for anti-aliased pixels
          diffMask: false
        }
      );
      
      const totalPixels = width * height;
      const diffPercentage = (pixelsDiff / totalPixels) * 100;
      
      // Find diff regions
      const regions = this.findDiffRegions(
        resized.baseline,
        resized.current,
        diffImage,
        pixelsDiff > 0
      );
      
      return {
        baseline,
        current: {
          screenshot: currentBuffer,
          metadata: metadata || {
            commit: process.env.GITHUB_SHA || 'unknown',
            timestamp: Date.now()
          }
        },
        diff: {
          hasDifferences: pixelsDiff > 0,
          percentage: parseFloat(diffPercentage.toFixed(2)),
          pixelsDiff,
          totalPixels,
          diffImage: pixelsDiff > 0 ? PNG.sync.write(diffImage) : undefined,
          regions: regions.length > 0 ? regions : undefined
        }
      };
      
    } catch (error) {
      core.error(`Visual diff failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse PNG from baseline
   */
  private async parsePNG(baseline: Baseline): Promise<PNG> {
    // This would fetch the image from storage
    // For now, we'll throw an error to be implemented later
    throw new Error('Baseline image fetching not yet implemented');
  }

  /**
   * Ensure images have same dimensions
   */
  private ensureSameDimensions(
    baseline: PNG,
    current: PNG
  ): {
    width: number;
    height: number;
    resized: {
      baseline: PNG;
      current: PNG;
    };
  } {
    if (baseline.width === current.width && baseline.height === current.height) {
      return {
        width: baseline.width,
        height: baseline.height,
        resized: { baseline, current }
      };
    }
    
    // Use larger dimensions
    const width = Math.max(baseline.width, current.width);
    const height = Math.max(baseline.height, current.height);
    
    // Resize if needed
    const resizedBaseline = this.resizeImage(baseline, width, height);
    const resizedCurrent = this.resizeImage(current, width, height);
    
    return {
      width,
      height,
      resized: {
        baseline: resizedBaseline,
        current: resizedCurrent
      }
    };
  }

  /**
   * Resize image to target dimensions
   */
  private resizeImage(source: PNG, targetWidth: number, targetHeight: number): PNG {
    if (source.width === targetWidth && source.height === targetHeight) {
      return source;
    }
    
    const resized = new PNG({ width: targetWidth, height: targetHeight });
    
    // Simple nearest-neighbor resize (could be improved with better algorithm)
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const srcX = Math.floor((x / targetWidth) * source.width);
        const srcY = Math.floor((y / targetHeight) * source.height);
        
        const srcIdx = (source.width * srcY + srcX) << 2;
        const dstIdx = (targetWidth * y + x) << 2;
        
        resized.data[dstIdx] = source.data[srcIdx];
        resized.data[dstIdx + 1] = source.data[srcIdx + 1];
        resized.data[dstIdx + 2] = source.data[srcIdx + 2];
        resized.data[dstIdx + 3] = source.data[srcIdx + 3];
      }
    }
    
    return resized;
  }

  /**
   * Find regions where differences occur
   */
  private findDiffRegions(
    baseline: PNG,
    current: PNG,
    diff: PNG,
    hasDifferences: boolean
  ): DiffRegion[] {
    if (!hasDifferences) return [];
    
    const regions: DiffRegion[] = [];
    const visited = new Set<string>();
    const width = diff.width;
    const height = diff.height;
    
    // Scan for different pixels and group them into regions
    for (let y = 0; y < height; y += 10) { // Sample every 10 pixels for performance
      for (let x = 0; x < width; x += 10) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        
        const idx = (width * y + x) << 2;
        
        // Check if this pixel is different (magenta in diff image)
        if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 255) {
          // Found a difference, expand to find region bounds
          const region = this.expandRegion(diff, x, y, visited);
          if (region.width > 10 && region.height > 10) { // Ignore tiny regions
            regions.push({
              ...region,
              type: this.determineChangeType(baseline, current, region),
              confidence: 0.9 // High confidence for pixel-perfect comparison
            });
          }
        }
      }
    }
    
    // Merge overlapping regions
    return this.mergeRegions(regions);
  }

  /**
   * Expand from a point to find the bounds of a diff region
   */
  private expandRegion(
    diff: PNG,
    startX: number,
    startY: number,
    visited: Set<string>
  ): Omit<DiffRegion, 'type' | 'confidence'> {
    let minX = startX, maxX = startX;
    let minY = startY, maxY = startY;
    
    const width = diff.width;
    const height = diff.height;
    const queue: Array<[number, number]> = [[startX, startY]];
    
    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      const key = `${x},${y}`;
      
      if (visited.has(key) || x < 0 || x >= width || y < 0 || y >= height) {
        continue;
      }
      
      visited.add(key);
      
      const idx = (width * y + x) << 2;
      
      // Check if this pixel is different
      if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 255) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        
        // Add neighbors to queue
        queue.push([x + 10, y]);
        queue.push([x - 10, y]);
        queue.push([x, y + 10]);
        queue.push([x, y - 10]);
      }
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  /**
   * Determine the type of change in a region
   */
  private determineChangeType(
    baseline: PNG,
    current: PNG,
    region: Omit<DiffRegion, 'type' | 'confidence'>
  ): 'added' | 'removed' | 'changed' {
    // Sample pixels in the region to determine change type
    const samples = 10;
    let baselineEmpty = 0;
    let currentEmpty = 0;
    
    for (let i = 0; i < samples; i++) {
      const x = region.x + Math.floor(Math.random() * region.width);
      const y = region.y + Math.floor(Math.random() * region.height);
      
      const idx = (baseline.width * y + x) << 2;
      
      // Check if pixel is transparent/white in baseline
      if (baseline.data[idx + 3] === 0 || 
          (baseline.data[idx] > 250 && baseline.data[idx + 1] > 250 && baseline.data[idx + 2] > 250)) {
        baselineEmpty++;
      }
      
      // Check if pixel is transparent/white in current
      if (current.data[idx + 3] === 0 ||
          (current.data[idx] > 250 && current.data[idx + 1] > 250 && current.data[idx + 2] > 250)) {
        currentEmpty++;
      }
    }
    
    if (baselineEmpty > samples * 0.7 && currentEmpty < samples * 0.3) {
      return 'added';
    } else if (baselineEmpty < samples * 0.3 && currentEmpty > samples * 0.7) {
      return 'removed';
    } else {
      return 'changed';
    }
  }

  /**
   * Merge overlapping regions
   */
  private mergeRegions(regions: DiffRegion[]): DiffRegion[] {
    if (regions.length <= 1) return regions;
    
    const merged: DiffRegion[] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < regions.length; i++) {
      if (used.has(i)) continue;
      
      let current = { ...regions[i] };
      let didMerge = true;
      
      while (didMerge) {
        didMerge = false;
        
        for (let j = i + 1; j < regions.length; j++) {
          if (used.has(j)) continue;
          
          const other = regions[j];
          
          // Check if regions overlap or are adjacent
          if (this.regionsOverlap(current, other)) {
            // Merge regions
            const minX = Math.min(current.x, other.x);
            const minY = Math.min(current.y, other.y);
            const maxX = Math.max(current.x + current.width, other.x + other.width);
            const maxY = Math.max(current.y + current.height, other.y + other.height);
            
            current = {
              x: minX,
              y: minY,
              width: maxX - minX,
              height: maxY - minY,
              type: current.type, // Keep the type of the larger region
              confidence: Math.min(current.confidence, other.confidence)
            };
            
            used.add(j);
            didMerge = true;
          }
        }
      }
      
      merged.push(current);
      used.add(i);
    }
    
    return merged;
  }

  /**
   * Check if two regions overlap
   */
  private regionsOverlap(a: DiffRegion, b: DiffRegion): boolean {
    const margin = 20; // Allow 20px margin for adjacent regions
    
    return !(
      a.x + a.width + margin < b.x ||
      b.x + b.width + margin < a.x ||
      a.y + a.height + margin < b.y ||
      b.y + b.height + margin < a.y
    );
  }
}