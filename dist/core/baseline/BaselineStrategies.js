"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaselineStrategyFactory = exports.SmartBaselineStrategy = exports.PRBaselineStrategy = exports.CommitBaselineStrategy = exports.TaggedBaselineStrategy = exports.BranchBaselineStrategy = exports.LatestBaselineStrategy = void 0;
class LatestBaselineStrategy {
    constructor() {
        this.name = 'latest';
        this.description = 'Uses the most recent baseline for comparison';
    }
    selectBaseline(query, candidates) {
        if (candidates.length === 0)
            return null;
        return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
}
exports.LatestBaselineStrategy = LatestBaselineStrategy;
class BranchBaselineStrategy {
    constructor() {
        this.name = 'branch';
        this.description = 'Prefers baselines from the same branch, falls back to main/master';
    }
    selectBaseline(query, candidates) {
        if (candidates.length === 0)
            return null;
        const currentBranch = query.repository?.branch;
        if (currentBranch) {
            const sameBranch = candidates.filter(b => b.repository.branch === currentBranch);
            if (sameBranch.length > 0) {
                return sameBranch.sort((a, b) => b.updatedAt - a.updatedAt)[0];
            }
        }
        const mainBranch = candidates.filter(b => b.repository.branch === 'main' || b.repository.branch === 'master');
        if (mainBranch.length > 0) {
            return mainBranch.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        }
        return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
}
exports.BranchBaselineStrategy = BranchBaselineStrategy;
class TaggedBaselineStrategy {
    constructor(requiredTags = ['stable']) {
        this.requiredTags = requiredTags;
        this.name = 'tagged';
        this.description = 'Uses baselines with specific tags (e.g., "stable", "release")';
    }
    selectBaseline(query, candidates) {
        if (candidates.length === 0)
            return null;
        const tagged = candidates.filter(b => b.metadata.tags &&
            this.requiredTags.every(tag => b.metadata.tags.includes(tag)));
        if (tagged.length === 0)
            return null;
        return tagged.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
}
exports.TaggedBaselineStrategy = TaggedBaselineStrategy;
class CommitBaselineStrategy {
    constructor(targetCommit) {
        this.targetCommit = targetCommit;
        this.name = 'commit';
        this.description = 'Uses baseline from a specific commit';
    }
    selectBaseline(query, candidates) {
        return candidates.find(b => b.metadata.commit === this.targetCommit) || null;
    }
}
exports.CommitBaselineStrategy = CommitBaselineStrategy;
class PRBaselineStrategy {
    constructor(baseBranch) {
        this.baseBranch = baseBranch;
        this.name = 'pr';
        this.description = 'Uses baseline from when the PR was created';
    }
    selectBaseline(query, candidates) {
        if (candidates.length === 0)
            return null;
        const baseBranchBaselines = candidates.filter(b => b.repository.branch === this.baseBranch);
        if (baseBranchBaselines.length === 0) {
            return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        }
        return baseBranchBaselines.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
}
exports.PRBaselineStrategy = PRBaselineStrategy;
class SmartBaselineStrategy {
    constructor(prNumber, baseBranch, currentBranch) {
        this.prNumber = prNumber;
        this.baseBranch = baseBranch;
        this.currentBranch = currentBranch;
        this.name = 'smart';
        this.description = 'Intelligently selects best baseline using multiple strategies';
        this.strategies = [
            new TaggedBaselineStrategy(['stable']),
            ...(baseBranch ? [new PRBaselineStrategy(baseBranch)] : []),
            ...(currentBranch ? [new BranchBaselineStrategy()] : []),
            new LatestBaselineStrategy()
        ];
    }
    selectBaseline(query, candidates) {
        if (candidates.length === 0)
            return null;
        for (const strategy of this.strategies) {
            const baseline = strategy.selectBaseline(query, candidates);
            if (baseline) {
                return baseline;
            }
        }
        return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
}
exports.SmartBaselineStrategy = SmartBaselineStrategy;
class BaselineStrategyFactory {
    static create(name, options) {
        switch (name) {
            case 'latest':
                return new LatestBaselineStrategy();
            case 'branch':
                return new BranchBaselineStrategy();
            case 'tagged':
                return new TaggedBaselineStrategy(options?.tags || ['stable']);
            case 'commit':
                if (!options?.commit) {
                    throw new Error('Commit strategy requires a target commit');
                }
                return new CommitBaselineStrategy(options.commit);
            case 'pr':
                if (!options?.baseBranch) {
                    throw new Error('PR strategy requires a base branch');
                }
                return new PRBaselineStrategy(options.baseBranch);
            case 'smart':
            default:
                return new SmartBaselineStrategy(options?.prNumber, options?.baseBranch, options?.currentBranch);
        }
    }
}
exports.BaselineStrategyFactory = BaselineStrategyFactory;
