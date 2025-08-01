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
exports.BaselineManager = void 0;
const core = __importStar(require("@actions/core"));
const BaselineStorage_1 = require("../baseline/BaselineStorage");
const BaselineStrategies_1 = require("../baseline/BaselineStrategies");
const VisualDiffer_1 = require("../baseline/VisualDiffer");
const github = __importStar(require("@actions/github"));
class BaselineManager {
    constructor(firebaseConfig, options) {
        this.storage = new BaselineStorage_1.BaselineStorage(firebaseConfig);
        this.differ = new VisualDiffer_1.VisualDiffer({
            threshold: options?.diffThreshold || 0.1
        });
        this.strategy = options?.strategy || 'smart';
    }
    async initialize() {
        await this.storage.initialize();
    }
    async updateBaseline(request) {
        core.info(`Updating baseline for PR #${request.prNumber}`);
        const repository = BaselineStorage_1.BaselineStorage.getCurrentRepository();
        const commit = github.context.sha;
        const author = github.context.actor;
        for (const screenshot of request.screenshots) {
            try {
                const fingerprint = this.calculateFingerprint(screenshot.buffer);
                const imagePath = await this.storage.saveImage(screenshot.buffer, {
                    route: screenshot.route,
                    viewport: screenshot.viewport,
                    prNumber: request.prNumber,
                    ...screenshot.metadata
                });
                const baseline = await this.storage.save({
                    repository,
                    route: screenshot.route,
                    viewport: screenshot.viewport,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    metadata: {
                        commit,
                        author,
                        prNumber: request.prNumber,
                        tags: ['pr-update'],
                        ...screenshot.metadata
                    },
                    fingerprint,
                    dimensions: this.getImageDimensions(screenshot.buffer)
                });
                core.info(`✅ Updated baseline for ${screenshot.route} at ${screenshot.viewport}`);
            }
            catch (error) {
                core.error(`Failed to update baseline for ${screenshot.route}: ${error.message}`);
            }
        }
    }
    async getBaseline(route, viewport, options) {
        const query = {
            repository: BaselineStorage_1.BaselineStorage.getCurrentRepository(),
            route,
            viewport,
            limit: 50
        };
        const candidates = await this.storage.find(query);
        if (candidates.length === 0) {
            core.warning(`No baseline found for ${route} at ${viewport}`);
            return null;
        }
        const strategyName = options?.strategy || this.strategy;
        const strategy = BaselineStrategies_1.BaselineStrategyFactory.create(strategyName, {
            prNumber: options?.prNumber,
            baseBranch: options?.branch || 'main',
            currentBranch: github.context.ref?.replace('refs/heads/', '')
        });
        const selected = strategy.selectBaseline(query, candidates);
        if (selected) {
            core.info(`Selected baseline: ${selected.id} (${strategy.name} strategy)`);
        }
        return selected;
    }
    async compare(current, baseline, metadata) {
        return await this.differ.compare(baseline, current, metadata);
    }
    async tagBaseline(baselineId, tags) {
        const baseline = await this.storage.get(baselineId);
        if (!baseline) {
            throw new Error(`Baseline ${baselineId} not found`);
        }
        baseline.metadata.tags = [...(baseline.metadata.tags || []), ...tags];
        baseline.updatedAt = Date.now();
        await this.storage.save(baseline);
        core.info(`Tagged baseline ${baselineId} with: ${tags.join(', ')}`);
    }
    async promoteToStable(route, viewport, commit) {
        const query = {
            repository: BaselineStorage_1.BaselineStorage.getCurrentRepository(),
            route,
            viewport,
            commit
        };
        const candidates = await this.storage.find(query);
        if (candidates.length === 0) {
            throw new Error(`No baseline found for ${route} at ${viewport}`);
        }
        const baseline = candidates[0];
        await this.tagBaseline(baseline.id, ['stable']);
        core.info(`Promoted baseline ${baseline.id} to stable`);
    }
    async cleanup(options) {
        const keepDays = options?.keepDays || 30;
        const keepCount = options?.keepCount || 10;
        const keepTags = options?.keepTags || ['stable', 'release'];
        const cutoffTime = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
        const all = await this.storage.find({
            repository: BaselineStorage_1.BaselineStorage.getCurrentRepository(),
            limit: 1000
        });
        const grouped = new Map();
        for (const baseline of all) {
            const key = `${baseline.route}-${baseline.viewport}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(baseline);
        }
        let deleted = 0;
        for (const [key, baselines] of grouped) {
            baselines.sort((a, b) => b.updatedAt - a.updatedAt);
            let kept = 0;
            for (let i = 0; i < baselines.length; i++) {
                const baseline = baselines[i];
                const hasKeepTag = baseline.metadata.tags?.some(tag => keepTags.includes(tag));
                if (kept < keepCount ||
                    baseline.updatedAt > cutoffTime ||
                    hasKeepTag) {
                    kept++;
                }
                else {
                    await this.storage.delete(baseline.id);
                    deleted++;
                    core.info(`Deleted old baseline: ${baseline.id}`);
                }
            }
        }
        core.info(`Cleanup complete: deleted ${deleted} old baselines`);
        return deleted;
    }
    calculateFingerprint(buffer) {
        const crypto = require('crypto');
        return crypto
            .createHash('sha256')
            .update(buffer)
            .digest('hex');
    }
    getImageDimensions(buffer) {
        if (buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            const width = buffer.readUInt32BE(16);
            const height = buffer.readUInt32BE(20);
            return { width, height };
        }
        return { width: 1920, height: 1080 };
    }
}
exports.BaselineManager = BaselineManager;
