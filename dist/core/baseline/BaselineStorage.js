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
exports.BaselineStorage = void 0;
const core = __importStar(require("@actions/core"));
const crypto = __importStar(require("crypto"));
const FirebaseStorage_1 = require("../../providers/storage/FirebaseStorage");
const github = __importStar(require("@actions/github"));
class BaselineStorage {
    constructor(firebaseConfig) {
        this.baselines = new Map();
        this.baselineIndexPath = 'baselines/index.json';
        this.firebaseStorage = new FirebaseStorage_1.FirebaseStorage(firebaseConfig);
    }
    async initialize() {
        try {
            await this.firebaseStorage.initialize();
            await this.loadBaselineIndex();
        }
        catch (error) {
            core.warning(`Failed to initialize baseline storage: ${error.message}`);
        }
    }
    async save(baselineData) {
        const id = this.generateId(baselineData);
        const baseline = {
            id,
            ...baselineData,
            storage: {
                provider: 'firebase',
                path: `baselines/${id}/screenshot.png`
            }
        };
        this.baselines.set(id, baseline);
        await this.saveBaselineIndex();
        return baseline;
    }
    async get(id) {
        return this.baselines.get(id) || null;
    }
    async find(query) {
        let results = Array.from(this.baselines.values());
        if (query.repository) {
            if (query.repository.owner) {
                results = results.filter(b => b.repository.owner === query.repository.owner);
            }
            if (query.repository.name) {
                results = results.filter(b => b.repository.name === query.repository.name);
            }
            if (query.repository.branch) {
                results = results.filter(b => b.repository.branch === query.repository.branch);
            }
        }
        if (query.route) {
            results = results.filter(b => b.route === query.route);
        }
        if (query.viewport) {
            results = results.filter(b => b.viewport === query.viewport);
        }
        if (query.commit) {
            results = results.filter(b => b.metadata.commit === query.commit);
        }
        if (query.prNumber !== undefined) {
            results = results.filter(b => b.metadata.prNumber === query.prNumber);
        }
        if (query.tags && query.tags.length > 0) {
            results = results.filter(b => b.metadata.tags &&
                query.tags.some(tag => b.metadata.tags.includes(tag)));
        }
        results.sort((a, b) => b.updatedAt - a.updatedAt);
        const offset = query.offset || 0;
        const limit = query.limit || 10;
        return results.slice(offset, offset + limit);
    }
    async delete(id) {
        const baseline = this.baselines.get(id);
        if (!baseline) {
            return false;
        }
        try {
            await this.firebaseStorage.deleteFile(baseline.storage.path);
        }
        catch (error) {
            core.warning(`Failed to delete baseline image: ${error.message}`);
        }
        this.baselines.delete(id);
        await this.saveBaselineIndex();
        return true;
    }
    async getImage(baseline) {
        const url = await this.firebaseStorage.getSignedUrl(baseline.storage.path);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch baseline image: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    async saveImage(buffer, metadata) {
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
    async loadBaselineIndex() {
        try {
            const url = await this.firebaseStorage.getSignedUrl(this.baselineIndexPath);
            const response = await fetch(url);
            if (response.ok) {
                const index = await response.json();
                for (const baseline of index.baselines) {
                    this.baselines.set(baseline.id, baseline);
                }
                core.info(`Loaded ${this.baselines.size} baselines from storage`);
            }
        }
        catch (error) {
            core.warning(`No existing baseline index found: ${error.message}`);
        }
    }
    async saveBaselineIndex() {
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
    generateId(baseline) {
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
    calculateFingerprint(buffer) {
        return crypto
            .createHash('sha256')
            .update(buffer)
            .digest('hex');
    }
    static getCurrentRepository() {
        const context = github.context;
        return {
            owner: context.repo.owner,
            name: context.repo.repo,
            branch: context.ref?.replace('refs/heads/', '') || 'main'
        };
    }
}
exports.BaselineStorage = BaselineStorage;
