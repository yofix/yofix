/**
 * IncrementalLearner - Auto-update patterns based on fallback cases
 *
 * Monitors LLM fallback usage and automatically suggests pattern updates
 * when the fallback rate exceeds a threshold (default: 10%).
 */

import Anthropic from '@anthropic-ai/sdk';
import { LearnedPattern, PatternUpdate } from './types';
import { PatternStore } from './PatternStore';
import { config } from '../';

export interface FallbackCase {
  route?: string;
  component?: string;
  file?: string;
  reason: string;
  timestamp: Date;
}

export class IncrementalLearner {
  private anthropic: Anthropic;
  private patternStore: PatternStore;
  private fallbackCases: FallbackCase[] = [];
  private updateThreshold: number;
  private minFallbacksForUpdate: number = 5; // Minimum fallbacks before suggesting update

  constructor(
    claudeApiKey: string,
    patternStore: PatternStore,
    updateThreshold?: number
  ) {
    this.anthropic = new Anthropic({ apiKey: claudeApiKey });
    this.patternStore = patternStore;
    this.updateThreshold = updateThreshold ?? config.get('patternLearning.incrementalUpdateThreshold', 0.1);
  }

  /**
   * Record a fallback case (called when confidence is too low)
   */
  recordFallback(context: {
    route?: string;
    component?: string;
    file?: string;
    reason: string;
  }): void {
    this.fallbackCases.push({
      ...context,
      timestamp: new Date()
    });
  }

  /**
   * Check if patterns should be updated based on fallback rate
   */
  shouldUpdate(totalAnalyses: number): boolean {
    if (this.fallbackCases.length < this.minFallbacksForUpdate) {
      return false;
    }

    const fallbackRate = this.fallbackCases.length / totalAnalyses;
    return fallbackRate >= this.updateThreshold;
  }

  /**
   * Analyze fallback cases and suggest pattern updates
   */
  async learn(currentPatterns: LearnedPattern): Promise<LearnedPattern | null> {
    if (this.fallbackCases.length < this.minFallbacksForUpdate) {
      console.log(`📊 Not enough fallback cases for update (${this.fallbackCases.length} < ${this.minFallbacksForUpdate})`);
      return null;
    }

    console.log(`🔄 Analyzing ${this.fallbackCases.length} fallback cases...`);

    try {
      const update = await this.analyzeFallbacks(currentPatterns);

      if (!update || update.confidence < 0.5) {
        console.log('⚠️  Update confidence too low, skipping');
        return null;
      }

      // Apply update
      const updatedPattern = await this.applyUpdate(update, currentPatterns);

      // Save updated patterns
      await this.patternStore.save(updatedPattern);

      // Clear fallback cases
      this.fallbackCases = [];

      console.log(`✅ Patterns updated! New confidence: ${(updatedPattern.confidence * 100).toFixed(1)}%`);

      return updatedPattern;
    } catch (error) {
      console.error('❌ Failed to update patterns:', error);
      return null;
    }
  }

  /**
   * Analyze fallback cases using LLM
   */
  private async analyzeFallbacks(currentPatterns: LearnedPattern): Promise<PatternUpdate | null> {
    const prompt = this.buildAnalysisPrompt(currentPatterns, this.fallbackCases);

    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return null;
    }

    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  }

  /**
   * Build prompt for analyzing fallback cases
   */
  private buildAnalysisPrompt(currentPatterns: LearnedPattern, fallbacks: FallbackCase[]): string {
    return `You are analyzing fallback cases to improve routing pattern detection.

## Current Patterns
\`\`\`json
${JSON.stringify(currentPatterns.patterns, null, 2)}
\`\`\`

## Fallback Cases
These are routes/components that couldn't be detected with high confidence:
${fallbacks.map((fb, i) => `
${i + 1}. ${fb.route || fb.component || fb.file}
   Reason: ${fb.reason}
`).join('\n')}

## Task
Analyze these fallback cases and suggest pattern updates to improve detection.

Return a JSON object with this structure:
\`\`\`json
{
  "reason": "Brief explanation of what patterns are missing",
  "additions": {
    "routeDefinitions": {
      "locations": ["new/location/"],
      "filePatterns": ["*.new.tsx"],
      // ... only include fields that need updates
    },
    // ... other pattern sections with updates
  },
  "confidence": 0.8,
  "examples": [
    {
      "file": "path/to/file",
      "route": "/route",
      "component": "Component",
      "issue": "What was wrong"
    }
  ]
}
\`\`\`

Only suggest additions if you're confident they'll improve detection. Return null if no clear pattern emerges.`;
  }

  /**
   * Apply pattern update to current patterns
   */
  private async applyUpdate(update: PatternUpdate, currentPatterns: LearnedPattern): Promise<LearnedPattern> {
    const updatedPatterns = { ...currentPatterns };

    // Merge additions into existing patterns
    if (update.additions.routeDefinitions) {
      const current = updatedPatterns.patterns.routeDefinitions;
      const additions = update.additions.routeDefinitions;

      if (additions.locations) {
        current.locations = [...new Set([...current.locations, ...additions.locations])];
      }
      if (additions.filePatterns) {
        current.filePatterns = [...new Set([...current.filePatterns, ...additions.filePatterns])];
      }
      if (additions.astPatterns?.identifiers) {
        current.astPatterns.identifiers = [
          ...new Set([...current.astPatterns.identifiers, ...additions.astPatterns.identifiers])
        ];
      }
      if (additions.astPatterns?.examples) {
        current.astPatterns.examples = [
          ...new Set([...current.astPatterns.examples, ...additions.astPatterns.examples])
        ];
      }
    }

    if (update.additions.componentPaths) {
      const current = updatedPatterns.patterns.componentPaths;
      const additions = update.additions.componentPaths;

      if (additions.directories) {
        current.directories = [...new Set([...current.directories, ...additions.directories])];
      }
      if (additions.fileNamingPatterns) {
        current.fileNamingPatterns = [
          ...new Set([...current.fileNamingPatterns, ...additions.fileNamingPatterns])
        ];
      }
    }

    if (update.additions.importAliases?.aliases) {
      updatedPatterns.patterns.importAliases.aliases = {
        ...updatedPatterns.patterns.importAliases.aliases,
        ...update.additions.importAliases.aliases
      };
    }

    if (update.additions.routeStructure) {
      const current = updatedPatterns.patterns.routeStructure;
      const additions = update.additions.routeStructure;

      if (additions.commonPaths) {
        current.commonPaths = [...new Set([...current.commonPaths, ...additions.commonPaths])];
      }
      if (additions.dynamicSegments) {
        current.dynamicSegments = [...new Set([...current.dynamicSegments, ...additions.dynamicSegments])];
      }
    }

    if (update.additions.lazyLoading) {
      const current = updatedPatterns.patterns.lazyLoading;
      const additions = update.additions.lazyLoading;

      if (additions.patterns) {
        current.patterns = [...new Set([...current.patterns, ...additions.patterns])];
      }
      if (additions.loaderFunctions) {
        current.loaderFunctions = [...new Set([...current.loaderFunctions, ...additions.loaderFunctions])];
      }
    }

    // Update metadata
    updatedPatterns.learnedAt = new Date().toISOString();
    updatedPatterns.confidence = Math.min(
      (updatedPatterns.confidence + update.confidence) / 2,
      1.0
    );

    if (updatedPatterns.metadata) {
      updatedPatterns.metadata.filesAnalyzed += this.fallbackCases.length;
    }

    return updatedPatterns;
  }

  /**
   * Get current fallback statistics
   */
  getStatistics(): {
    totalFallbacks: number;
    uniqueRoutes: number;
    uniqueComponents: number;
    recentFallbacks: FallbackCase[];
  } {
    const uniqueRoutes = new Set(this.fallbackCases.filter(fb => fb.route).map(fb => fb.route));
    const uniqueComponents = new Set(this.fallbackCases.filter(fb => fb.component).map(fb => fb.component));

    // Get fallbacks from last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const recentFallbacks = this.fallbackCases.filter(fb => fb.timestamp > oneDayAgo);

    return {
      totalFallbacks: this.fallbackCases.length,
      uniqueRoutes: uniqueRoutes.size,
      uniqueComponents: uniqueComponents.size,
      recentFallbacks
    };
  }

  /**
   * Reset fallback cases (useful for testing or forcing fresh analysis)
   */
  reset(): void {
    this.fallbackCases = [];
  }
}
