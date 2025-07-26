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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageOptimizer = void 0;
const core = __importStar(require("@actions/core"));
const sharp_1 = __importDefault(require("sharp"));
const crypto_1 = __importDefault(require("crypto"));
class ImageOptimizer {
    constructor(options) {
        this.quality = options?.quality || 85;
        this.maxWidth = options?.maxWidth || 2560;
        this.maxHeight = options?.maxHeight || 1440;
        this.enableWebP = options?.enableWebP ?? true;
        this.enableCompression = options?.enableCompression ?? true;
    }
    async optimize(buffer, options) {
        const startTime = Date.now();
        const originalSize = buffer.length;
        try {
            let image = (0, sharp_1.default)(buffer);
            const metadata = await image.metadata();
            if (options?.resize !== false &&
                (metadata.width > this.maxWidth || metadata.height > this.maxHeight)) {
                image = image.resize(this.maxWidth, this.maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
                core.debug(`Resized image from ${metadata.width}x${metadata.height}`);
            }
            const format = options?.format || (this.enableWebP ? 'webp' : 'png');
            const quality = options?.quality || this.quality;
            let optimized;
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
            core.debug(`Optimized image: ${format}, ${originalSize} → ${optimizedSize} bytes ` +
                `(${savings.toFixed(1)}% reduction)`);
            return {
                buffer: optimized,
                format,
                originalSize,
                optimizedSize,
                savings,
                duration: Date.now() - startTime,
                dimensions: {
                    width: metadata.width,
                    height: metadata.height
                },
                fingerprint: this.generateFingerprint(optimized)
            };
        }
        catch (error) {
            core.warning(`Image optimization failed: ${error.message}`);
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
    async optimizeBatch(images, concurrency = 3) {
        const results = new Map();
        for (let i = 0; i < images.length; i += concurrency) {
            const batch = images.slice(i, i + concurrency);
            const batchResults = await Promise.all(batch.map(async (img) => {
                const result = await this.optimize(img.buffer, img.options);
                return { name: img.name, result };
            }));
            for (const { name, result } of batchResults) {
                results.set(name, result);
            }
        }
        const totalOriginal = Array.from(results.values())
            .reduce((sum, r) => sum + r.originalSize, 0);
        const totalOptimized = Array.from(results.values())
            .reduce((sum, r) => sum + r.optimizedSize, 0);
        const totalSavings = ((totalOriginal - totalOptimized) / totalOriginal) * 100;
        core.info(`Optimized ${images.length} images: ` +
            `${this.formatBytes(totalOriginal)} → ${this.formatBytes(totalOptimized)} ` +
            `(${totalSavings.toFixed(1)}% reduction)`);
        return results;
    }
    async createResponsiveVariants(buffer, breakpoints = [375, 768, 1024, 1920]) {
        const variants = [];
        const image = (0, sharp_1.default)(buffer);
        const metadata = await image.metadata();
        for (const width of breakpoints) {
            if (width >= metadata.width) {
                continue;
            }
            const resized = await image
                .resize(width, undefined, {
                withoutEnlargement: true
            })
                .toBuffer();
            const optimized = await this.optimize(resized, {
                resize: false
            });
            variants.push({
                width,
                buffer: optimized.buffer,
                format: optimized.format,
                size: optimized.optimizedSize,
                url: ''
            });
        }
        const original = await this.optimize(buffer);
        variants.push({
            width: metadata.width,
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
    async extractColors(buffer, count = 5) {
        try {
            const { dominant, palette } = await (0, sharp_1.default)(buffer)
                .resize(100, 100)
                .raw()
                .toBuffer({ resolveWithObject: true })
                .then(({ data, info }) => {
                const pixels = new Map();
                for (let i = 0; i < data.length; i += info.channels) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const hex = this.rgbToHex(r, g, b);
                    pixels.set(hex, (pixels.get(hex) || 0) + 1);
                }
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
        }
        catch (error) {
            core.warning(`Color extraction failed: ${error.message}`);
            return {
                dominant: '#000000',
                palette: ['#000000'],
                css: ''
            };
        }
    }
    async createPlaceholder(buffer, type = 'blur') {
        try {
            const image = (0, sharp_1.default)(buffer);
            switch (type) {
                case 'blur':
                    const blurred = await image
                        .resize(40)
                        .blur(5)
                        .jpeg({ quality: 40 })
                        .toBuffer();
                    return `data:image/jpeg;base64,${blurred.toString('base64')}`;
                case 'lqip':
                    const lqip = await image
                        .resize(20)
                        .jpeg({ quality: 20 })
                        .toBuffer();
                    return `data:image/jpeg;base64,${lqip.toString('base64')}`;
                case 'color':
                    const { dominant } = await this.extractColors(buffer, 1);
                    return dominant;
                default:
                    return '';
            }
        }
        catch (error) {
            core.warning(`Placeholder creation failed: ${error.message}`);
            return '';
        }
    }
    async compareImages(buffer1, buffer2) {
        try {
            const size = 64;
            const [img1, img2] = await Promise.all([
                (0, sharp_1.default)(buffer1).resize(size, size).raw().toBuffer(),
                (0, sharp_1.default)(buffer2).resize(size, size).raw().toBuffer()
            ]);
            const hash1 = this.calculatePerceptualHash(img1);
            const hash2 = this.calculatePerceptualHash(img2);
            const distance = this.hammingDistance(hash1, hash2);
            const similarity = 1 - (distance / (size * size));
            return {
                similar: similarity > 0.9,
                similarity,
                hash1,
                hash2,
                distance
            };
        }
        catch (error) {
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
    generateFingerprint(buffer) {
        return crypto_1.default
            .createHash('sha256')
            .update(buffer)
            .digest('hex');
    }
    formatBytes(bytes) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    generateSrcSet(variants) {
        return variants
            .map(v => `${v.url} ${v.width}w`)
            .join(', ');
    }
    rgbToHex(r, g, b) {
        return '#' + [r, g, b]
            .map(x => x.toString(16).padStart(2, '0'))
            .join('');
    }
    generateCSSVariables(palette) {
        return palette
            .map((color, i) => `--yofix-color-${i}: ${color};`)
            .join('\n');
    }
    calculatePerceptualHash(buffer) {
        const size = Math.sqrt(buffer.length / 3);
        const pixels = [];
        for (let i = 0; i < buffer.length; i += 3) {
            const gray = (buffer[i] + buffer[i + 1] + buffer[i + 2]) / 3;
            pixels.push(gray);
        }
        const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
        return pixels
            .map(p => p > avg ? '1' : '0')
            .join('');
    }
    hammingDistance(hash1, hash2) {
        let distance = 0;
        for (let i = 0; i < hash1.length; i++) {
            if (hash1[i] !== hash2[i]) {
                distance++;
            }
        }
        return distance;
    }
}
exports.ImageOptimizer = ImageOptimizer;
