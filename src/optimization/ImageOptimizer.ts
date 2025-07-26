import * as core from '@actions/core';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import crypto from 'crypto';

/**
 * Image optimization for screenshots and baselines
 */
export class ImageOptimizer {
  private quality: number;
  private maxWidth: number;
  private maxHeight: number;
  private enableWebP: boolean;
  private enableCompression: boolean;

  constructor(options?: {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
    enableWebP?: boolean;
    enableCompression?: boolean;
  }) {
    this.quality = options?.quality || 85;
    this.maxWidth = options?.maxWidth || 2560;
    this.maxHeight = options?.maxHeight || 1440;
    this.enableWebP = options?.enableWebP ?? true;
    this.enableCompression = options?.enableCompression ?? true;
  }

  /**
   * Optimize image buffer
   */
  async optimize(
    buffer: Buffer,
    options?: {
      format?: 'png' | 'webp' | 'jpeg';
      quality?: number;
      resize?: boolean;
    }
  ): Promise<OptimizedImage> {
    const startTime = Date.now();
    const originalSize = buffer.length;
    
    try {
      let image = sharp(buffer);
      const metadata = await image.metadata();
      
      // Resize if needed
      if (options?.resize !== false && 
          (metadata.width! > this.maxWidth || metadata.height! > this.maxHeight)) {
        image = image.resize(this.maxWidth, this.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
        core.debug(`Resized image from ${metadata.width}x${metadata.height}`);
      }
      
      // Convert to optimal format
      const format = options?.format || (this.enableWebP ? 'webp' : 'png');
      const quality = options?.quality || this.quality;
      
      let optimized: Buffer;
      
      switch (format) {
        case 'webp':
          optimized = await image
            .webp({ quality, effort: 4 })
            .toBuffer();
          break;
          
        case 'jpeg':
          optimized = await image
            .jpeg({ quality, progressive: true })
            .toBuffer();
          break;
          
        case 'png':
        default:
          optimized = await image
            .png({ 
              compressionLevel: this.enableCompression ? 9 : 0,
              adaptiveFiltering: true,
              palette: true
            })
            .toBuffer();
      }
      
      const optimizedSize = optimized.length;
      const savings = ((originalSize - optimizedSize) / originalSize) * 100;
      
      core.debug(
        `Optimized image: ${format}, ${originalSize} → ${optimizedSize} bytes ` +
        `(${savings.toFixed(1)}% reduction)`
      );
      
      return {
        buffer: optimized,
        format,
        originalSize,
        optimizedSize,
        savings,
        duration: Date.now() - startTime,
        dimensions: {
          width: metadata.width!,
          height: metadata.height!
        },
        fingerprint: this.generateFingerprint(optimized)
      };
      
    } catch (error) {
      core.warning(`Image optimization failed: ${error.message}`);
      
      // Return original on failure
      return {
        buffer,
        format: 'png',
        originalSize,
        optimizedSize: originalSize,
        savings: 0,
        duration: Date.now() - startTime,
        dimensions: { width: 0, height: 0 },
        fingerprint: this.generateFingerprint(buffer)
      };
    }
  }

  /**
   * Batch optimize multiple images
   */
  async optimizeBatch(
    images: Array<{
      buffer: Buffer;
      name: string;
      options?: any;
    }>,
    concurrency: number = 3
  ): Promise<Map<string, OptimizedImage>> {
    const results = new Map<string, OptimizedImage>();
    
    // Process in batches
    for (let i = 0; i < images.length; i += concurrency) {
      const batch = images.slice(i, i + concurrency);
      
      const batchResults = await Promise.all(
        batch.map(async (img) => {
          const result = await this.optimize(img.buffer, img.options);
          return { name: img.name, result };
        })
      );
      
      for (const { name, result } of batchResults) {
        results.set(name, result);
      }
    }
    
    // Log summary
    const totalOriginal = Array.from(results.values())
      .reduce((sum, r) => sum + r.originalSize, 0);
    const totalOptimized = Array.from(results.values())
      .reduce((sum, r) => sum + r.optimizedSize, 0);
    const totalSavings = ((totalOriginal - totalOptimized) / totalOriginal) * 100;
    
    core.info(
      `Optimized ${images.length} images: ` +
      `${this.formatBytes(totalOriginal)} → ${this.formatBytes(totalOptimized)} ` +
      `(${totalSavings.toFixed(1)}% reduction)`
    );
    
    return results;
  }

  /**
   * Create responsive variants
   */
  async createResponsiveVariants(
    buffer: Buffer,
    breakpoints: number[] = [375, 768, 1024, 1920]
  ): Promise<ResponsiveVariants> {
    const variants: ResponsiveVariant[] = [];
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    for (const width of breakpoints) {
      if (width >= metadata.width!) {
        continue; // Skip if breakpoint is larger than original
      }
      
      const resized = await image
        .resize(width, undefined, {
          withoutEnlargement: true
        })
        .toBuffer();
      
      const optimized = await this.optimize(resized, {
        resize: false // Already resized
      });
      
      variants.push({
        width,
        buffer: optimized.buffer,
        format: optimized.format,
        size: optimized.optimizedSize,
        url: '' // To be filled by storage
      });
    }
    
    // Add original as largest variant
    const original = await this.optimize(buffer);
    variants.push({
      width: metadata.width!,
      buffer: original.buffer,
      format: original.format,
      size: original.optimizedSize,
      url: ''
    });
    
    return {
      variants: variants.sort((a, b) => a.width - b.width),
      srcset: this.generateSrcSet(variants)
    };
  }

  /**
   * Extract dominant colors
   */
  async extractColors(
    buffer: Buffer,
    count: number = 5
  ): Promise<ColorPalette> {
    try {
      const { dominant, palette } = await sharp(buffer)
        .resize(100, 100) // Resize for faster processing
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then(({ data, info }) => {
          const pixels: Map<string, number> = new Map();
          
          // Count pixel colors
          for (let i = 0; i < data.length; i += info.channels) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const hex = this.rgbToHex(r, g, b);
            
            pixels.set(hex, (pixels.get(hex) || 0) + 1);
          }
          
          // Sort by frequency
          const sorted = Array.from(pixels.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, count);
          
          return {
            dominant: sorted[0][0],
            palette: sorted.map(([color]) => color)
          };
        });
      
      return {
        dominant,
        palette,
        css: this.generateCSSVariables(palette)
      };
      
    } catch (error) {
      core.warning(`Color extraction failed: ${error.message}`);
      return {
        dominant: '#000000',
        palette: ['#000000'],
        css: ''
      };
    }
  }

  /**
   * Create placeholder image
   */
  async createPlaceholder(
    buffer: Buffer,
    type: 'blur' | 'lqip' | 'color' = 'blur'
  ): Promise<string> {
    try {
      const image = sharp(buffer);
      
      switch (type) {
        case 'blur':
          // Low quality blurred version
          const blurred = await image
            .resize(40)
            .blur(5)
            .jpeg({ quality: 40 })
            .toBuffer();
          return `data:image/jpeg;base64,${blurred.toString('base64')}`;
          
        case 'lqip':
          // Low Quality Image Placeholder
          const lqip = await image
            .resize(20)
            .jpeg({ quality: 20 })
            .toBuffer();
          return `data:image/jpeg;base64,${lqip.toString('base64')}`;
          
        case 'color':
          // Dominant color placeholder
          const { dominant } = await this.extractColors(buffer, 1);
          return dominant;
          
        default:
          return '';
      }
    } catch (error) {
      core.warning(`Placeholder creation failed: ${error.message}`);
      return '';
    }
  }

  /**
   * Compare two images for similarity
   */
  async compareImages(
    buffer1: Buffer,
    buffer2: Buffer
  ): Promise<ImageComparison> {
    try {
      // Resize to same dimensions for comparison
      const size = 64; // Small size for quick comparison
      
      const [img1, img2] = await Promise.all([
        sharp(buffer1).resize(size, size).raw().toBuffer(),
        sharp(buffer2).resize(size, size).raw().toBuffer()
      ]);
      
      // Calculate perceptual hash
      const hash1 = this.calculatePerceptualHash(img1);
      const hash2 = this.calculatePerceptualHash(img2);
      
      // Calculate hamming distance
      const distance = this.hammingDistance(hash1, hash2);
      const similarity = 1 - (distance / (size * size));
      
      return {
        similar: similarity > 0.9,
        similarity,
        hash1,
        hash2,
        distance
      };
      
    } catch (error) {
      core.warning(`Image comparison failed: ${error.message}`);
      return {
        similar: false,
        similarity: 0,
        hash1: '',
        hash2: '',
        distance: Infinity
      };
    }
  }

  /**
   * Generate fingerprint for image
   */
  private generateFingerprint(buffer: Buffer): string {
    return crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Generate srcset string
   */
  private generateSrcSet(variants: ResponsiveVariant[]): string {
    return variants
      .map(v => `${v.url} ${v.width}w`)
      .join(', ');
  }

  /**
   * Convert RGB to hex
   */
  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b]
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generate CSS variables from palette
   */
  private generateCSSVariables(palette: string[]): string {
    return palette
      .map((color, i) => `--yofix-color-${i}: ${color};`)
      .join('\n');
  }

  /**
   * Calculate perceptual hash
   */
  private calculatePerceptualHash(buffer: Buffer): string {
    // Simple average hash implementation
    const size = Math.sqrt(buffer.length / 3);
    const pixels: number[] = [];
    
    for (let i = 0; i < buffer.length; i += 3) {
      const gray = (buffer[i] + buffer[i + 1] + buffer[i + 2]) / 3;
      pixels.push(gray);
    }
    
    const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    
    return pixels
      .map(p => p > avg ? '1' : '0')
      .join('');
  }

  /**
   * Calculate hamming distance between hashes
   */
  private hammingDistance(hash1: string, hash2: string): number {
    let distance = 0;
    
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }
    
    return distance;
  }
}

export interface OptimizedImage {
  buffer: Buffer;
  format: string;
  originalSize: number;
  optimizedSize: number;
  savings: number;
  duration: number;
  dimensions: {
    width: number;
    height: number;
  };
  fingerprint: string;
}

export interface ResponsiveVariants {
  variants: ResponsiveVariant[];
  srcset: string;
}

export interface ResponsiveVariant {
  width: number;
  buffer: Buffer;
  format: string;
  size: number;
  url: string;
}

export interface ColorPalette {
  dominant: string;
  palette: string[];
  css: string;
}

export interface ImageComparison {
  similar: boolean;
  similarity: number;
  hash1: string;
  hash2: string;
  distance: number;
}