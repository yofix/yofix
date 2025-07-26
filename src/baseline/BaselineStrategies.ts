import { BaselineStrategy, Baseline, BaselineQuery } from './types';

/**
 * Latest baseline strategy - uses the most recent baseline
 */
export class LatestBaselineStrategy implements BaselineStrategy {
  name = 'latest';
  description = 'Uses the most recent baseline for comparison';

  selectBaseline(query: BaselineQuery, candidates: Baseline[]): Baseline | null {
    if (candidates.length === 0) return null;
    
    // Sort by updatedAt descending and return the first
    return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
}

/**
 * Branch baseline strategy - prefers baselines from the same branch
 */
export class BranchBaselineStrategy implements BaselineStrategy {
  name = 'branch';
  description = 'Prefers baselines from the same branch, falls back to main/master';

  selectBaseline(query: BaselineQuery, candidates: Baseline[]): Baseline | null {
    if (candidates.length === 0) return null;
    
    const currentBranch = query.repository?.branch;
    
    // First, try to find baseline from same branch
    if (currentBranch) {
      const sameBranch = candidates.filter(b => b.repository.branch === currentBranch);
      if (sameBranch.length > 0) {
        return sameBranch.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      }
    }
    
    // Fall back to main/master branch
    const mainBranch = candidates.filter(b => 
      b.repository.branch === 'main' || b.repository.branch === 'master'
    );
    if (mainBranch.length > 0) {
      return mainBranch.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
    
    // Fall back to any baseline
    return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
}

/**
 * Tagged baseline strategy - uses baselines with specific tags
 */
export class TaggedBaselineStrategy implements BaselineStrategy {
  name = 'tagged';
  description = 'Uses baselines with specific tags (e.g., "stable", "release")';

  constructor(private requiredTags: string[] = ['stable']) {}

  selectBaseline(query: BaselineQuery, candidates: Baseline[]): Baseline | null {
    if (candidates.length === 0) return null;
    
    // Filter by required tags
    const tagged = candidates.filter(b => 
      b.metadata.tags && 
      this.requiredTags.every(tag => b.metadata.tags!.includes(tag))
    );
    
    if (tagged.length === 0) return null;
    
    return tagged.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
}

/**
 * Commit baseline strategy - uses baseline from a specific commit
 */
export class CommitBaselineStrategy implements BaselineStrategy {
  name = 'commit';
  description = 'Uses baseline from a specific commit';

  constructor(private targetCommit: string) {}

  selectBaseline(query: BaselineQuery, candidates: Baseline[]): Baseline | null {
    return candidates.find(b => b.metadata.commit === this.targetCommit) || null;
  }
}

/**
 * PR baseline strategy - uses baseline from when PR was created
 */
export class PRBaselineStrategy implements BaselineStrategy {
  name = 'pr';
  description = 'Uses baseline from when the PR was created';

  constructor(private baseBranch: string) {}

  selectBaseline(query: BaselineQuery, candidates: Baseline[]): Baseline | null {
    if (candidates.length === 0) return null;
    
    // Find baselines from base branch
    const baseBranchBaselines = candidates.filter(b => 
      b.repository.branch === this.baseBranch
    );
    
    if (baseBranchBaselines.length === 0) {
      // Fall back to any baseline
      return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    }
    
    // Return most recent from base branch
    return baseBranchBaselines.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
}

/**
 * Smart baseline strategy - combines multiple strategies with fallbacks
 */
export class SmartBaselineStrategy implements BaselineStrategy {
  name = 'smart';
  description = 'Intelligently selects best baseline using multiple strategies';

  private strategies: BaselineStrategy[];

  constructor(
    private prNumber?: number,
    private baseBranch?: string,
    private currentBranch?: string
  ) {
    this.strategies = [
      // First try tagged stable baselines
      new TaggedBaselineStrategy(['stable']),
      // Then try PR base branch
      ...(baseBranch ? [new PRBaselineStrategy(baseBranch)] : []),
      // Then try current branch
      ...(currentBranch ? [new BranchBaselineStrategy()] : []),
      // Finally fall back to latest
      new LatestBaselineStrategy()
    ];
  }

  selectBaseline(query: BaselineQuery, candidates: Baseline[]): Baseline | null {
    if (candidates.length === 0) return null;
    
    // Try each strategy in order
    for (const strategy of this.strategies) {
      const baseline = strategy.selectBaseline(query, candidates);
      if (baseline) {
        return baseline;
      }
    }
    
    // Should never reach here, but fall back to latest
    return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
}

/**
 * Factory for creating baseline strategies
 */
export class BaselineStrategyFactory {
  static create(name: string, options?: any): BaselineStrategy {
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
        return new SmartBaselineStrategy(
          options?.prNumber,
          options?.baseBranch,
          options?.currentBranch
        );
    }
  }
}