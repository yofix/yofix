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
exports.VisualDiffer = void 0;
const core = __importStar(require("@actions/core"));
const pngjs_1 = require("pngjs");
const pixelmatch_1 = __importDefault(require("pixelmatch"));
class VisualDiffer {
    constructor(options) {
        this.threshold = options?.threshold || 0.1;
        this.includeAA = options?.includeAA ?? true;
        this.alpha = options?.alpha || 0.1;
        this.diffColor = options?.diffColor || [255, 0, 255, 255];
    }
    async compare(baseline, currentBuffer, metadata) {
        try {
            const baselineImage = await this.parsePNG(baseline);
            const currentImage = pngjs_1.PNG.sync.read(currentBuffer);
            const { width, height, resized } = this.ensureSameDimensions(baselineImage, currentImage);
            const diffImage = new pngjs_1.PNG({ width, height });
            const pixelsDiff = (0, pixelmatch_1.default)(resized.baseline.data, resized.current.data, diffImage.data, width, height, {
                threshold: this.threshold,
                includeAA: this.includeAA,
                alpha: this.alpha,
                diffColor: this.diffColor,
                diffColorAlt: [0, 255, 0, 255],
                diffMask: false
            });
            const totalPixels = width * height;
            const diffPercentage = (pixelsDiff / totalPixels) * 100;
            const regions = this.findDiffRegions(resized.baseline, resized.current, diffImage, pixelsDiff > 0);
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
                    diffImage: pixelsDiff > 0 ? pngjs_1.PNG.sync.write(diffImage) : undefined,
                    regions: regions.length > 0 ? regions : undefined
                }
            };
        }
        catch (error) {
            core.error(`Visual diff failed: ${error.message}`);
            throw error;
        }
    }
    async parsePNG(baseline) {
        throw new Error('Baseline image fetching not yet implemented');
    }
    ensureSameDimensions(baseline, current) {
        if (baseline.width === current.width && baseline.height === current.height) {
            return {
                width: baseline.width,
                height: baseline.height,
                resized: { baseline, current }
            };
        }
        const width = Math.max(baseline.width, current.width);
        const height = Math.max(baseline.height, current.height);
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
    resizeImage(source, targetWidth, targetHeight) {
        if (source.width === targetWidth && source.height === targetHeight) {
            return source;
        }
        const resized = new pngjs_1.PNG({ width: targetWidth, height: targetHeight });
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
    findDiffRegions(baseline, current, diff, hasDifferences) {
        if (!hasDifferences)
            return [];
        const regions = [];
        const visited = new Set();
        const width = diff.width;
        const height = diff.height;
        for (let y = 0; y < height; y += 10) {
            for (let x = 0; x < width; x += 10) {
                const key = `${x},${y}`;
                if (visited.has(key))
                    continue;
                const idx = (width * y + x) << 2;
                if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 255) {
                    const region = this.expandRegion(diff, x, y, visited);
                    if (region.width > 10 && region.height > 10) {
                        regions.push({
                            ...region,
                            type: this.determineChangeType(baseline, current, region),
                            confidence: 0.9
                        });
                    }
                }
            }
        }
        return this.mergeRegions(regions);
    }
    expandRegion(diff, startX, startY, visited) {
        let minX = startX, maxX = startX;
        let minY = startY, maxY = startY;
        const width = diff.width;
        const height = diff.height;
        const queue = [[startX, startY]];
        while (queue.length > 0) {
            const [x, y] = queue.shift();
            const key = `${x},${y}`;
            if (visited.has(key) || x < 0 || x >= width || y < 0 || y >= height) {
                continue;
            }
            visited.add(key);
            const idx = (width * y + x) << 2;
            if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 255) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
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
    determineChangeType(baseline, current, region) {
        const samples = 10;
        let baselineEmpty = 0;
        let currentEmpty = 0;
        for (let i = 0; i < samples; i++) {
            const x = region.x + Math.floor(Math.random() * region.width);
            const y = region.y + Math.floor(Math.random() * region.height);
            const idx = (baseline.width * y + x) << 2;
            if (baseline.data[idx + 3] === 0 ||
                (baseline.data[idx] > 250 && baseline.data[idx + 1] > 250 && baseline.data[idx + 2] > 250)) {
                baselineEmpty++;
            }
            if (current.data[idx + 3] === 0 ||
                (current.data[idx] > 250 && current.data[idx + 1] > 250 && current.data[idx + 2] > 250)) {
                currentEmpty++;
            }
        }
        if (baselineEmpty > samples * 0.7 && currentEmpty < samples * 0.3) {
            return 'added';
        }
        else if (baselineEmpty < samples * 0.3 && currentEmpty > samples * 0.7) {
            return 'removed';
        }
        else {
            return 'changed';
        }
    }
    mergeRegions(regions) {
        if (regions.length <= 1)
            return regions;
        const merged = [];
        const used = new Set();
        for (let i = 0; i < regions.length; i++) {
            if (used.has(i))
                continue;
            let current = { ...regions[i] };
            let didMerge = true;
            while (didMerge) {
                didMerge = false;
                for (let j = i + 1; j < regions.length; j++) {
                    if (used.has(j))
                        continue;
                    const other = regions[j];
                    if (this.regionsOverlap(current, other)) {
                        const minX = Math.min(current.x, other.x);
                        const minY = Math.min(current.y, other.y);
                        const maxX = Math.max(current.x + current.width, other.x + other.width);
                        const maxY = Math.max(current.y + current.height, other.y + other.height);
                        current = {
                            x: minX,
                            y: minY,
                            width: maxX - minX,
                            height: maxY - minY,
                            type: current.type,
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
    regionsOverlap(a, b) {
        const margin = 20;
        return !(a.x + a.width + margin < b.x ||
            b.x + b.width + margin < a.x ||
            a.y + a.height + margin < b.y ||
            b.y + b.height + margin < a.y);
    }
}
exports.VisualDiffer = VisualDiffer;
