import * as core from '@actions/core';
import { Anthropic } from '@anthropic-ai/sdk';
import { Page } from 'playwright';
import { VisualIssue, ScanResult } from '../bot/types';
import { promises as fs } from 'fs';
import path from 'path';
import { VisualRunner } from '../visual-runner';
import { TestGenerator } from '../test-generator';
import { FirebaseConfig } from '../types';
import * as github from '@actions/github';
import { ClaudeRouteAnalyzer } from '../claude-route-analyzer';
import { CodebaseContext } from '../context/types';
import { CacheManager } from '../cache/CacheManager';
import { ImageOptimizer } from '../optimization/ImageOptimizer';
import crypto from 'crypto';

/**
 * Visual analysis engine using Claude AI
 */
export class VisualAnalyzer {
  private claude: Anthropic;
  private claudeApiKey: string;
  private githubToken: string;
  private codebaseContext: CodebaseContext | null = null;
  private cache: CacheManager;
  private imageOptimizer: ImageOptimizer;

  constructor(claudeApiKey: string, githubToken: string = '', cache?: CacheManager) {
    this.claude = new Anthropic({ apiKey: claudeApiKey });
    this.claudeApiKey = claudeApiKey;
    this.githubToken = githubToken;
    this.cache = cache || new CacheManager();
    this.imageOptimizer = new ImageOptimizer();
  }

  /**
   * Scan for visual issues
   */
  async scan(options: {
    prNumber: number;
    routes: string[] | 'auto';
    viewports: string[];
    options: any;
  }): Promise<ScanResult> {
    const startTime = Date.now();
    const issues: VisualIssue[] = [];
    
    core.info(`🔍 Scanning PR #${options.prNumber} for visual issues...`);
    
    try {
      // Get routes to scan
      let routesToScan: string[] = [];
      
      if (options.routes === 'auto') {
        // Use Claude to analyze PR and determine routes
        const routeAnalyzer = new ClaudeRouteAnalyzer(this.claudeApiKey, this.githubToken);
        const analysis = await routeAnalyzer.analyzeRoutes(options.prNumber);
        routesToScan = analysis.routes;
        
        // Store codebase context for later use
        this.codebaseContext = routeAnalyzer.getCodebaseContext();
        
        core.info(`Claude identified ${routesToScan.length} routes to scan`);
      } else {
        routesToScan = options.routes;
      }
      
      // Limit routes based on configuration
      const maxRoutes = options.options?.maxRoutes || 10;
      if (routesToScan.length > maxRoutes) {
        core.warning(`Limiting scan to ${maxRoutes} routes (found ${routesToScan.length})`);
        routesToScan = routesToScan.slice(0, maxRoutes);
      }
      
      // Get preview URL from context
      const previewUrl = options.options?.previewUrl || process.env.PREVIEW_URL;
      if (!previewUrl) {
        throw new Error('Preview URL not found. Please provide preview-url input.');
      }
      
      // Analyze each route and viewport combination
      for (const route of routesToScan) {
        for (const viewport of options.viewports) {
          try {
            const routeIssues = await this.analyzeRoute(
              previewUrl,
              route,
              viewport,
              options.prNumber
            );
            issues.push(...routeIssues);
          } catch (error) {
            core.warning(`Failed to analyze ${route} at ${viewport}: ${error.message}`);
          }
        }
      }
      
      // Assign unique IDs to issues
      issues.forEach((issue, index) => {
        issue.id = index + 1;
      });
      
      // Calculate summary
      const summary = this.calculateSummary(issues);
      
      return {
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        routes: routesToScan,
        issues,
        summary
      };
      
    } catch (error) {
      core.error(`Scan failed: ${error.message}`);
      return {
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        routes: [],
        issues: [],
        summary: {
          total: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
          byType: {}
        }
      };
    }
  }

  /**
   * Explain a specific issue in detail
   */
  async explainIssue(issue: VisualIssue): Promise<string> {
    const prompt = `Analyze this visual issue and provide a detailed explanation:

Issue Type: ${issue.type}
Severity: ${issue.severity}
Description: ${issue.description}
Affected Viewports: ${issue.affectedViewports.join(', ')}
Location: ${issue.location.route} - ${issue.location.selector}

Please provide:
1. A detailed explanation of what's happening
2. Root cause analysis
3. Impact on user experience
4. Potential browser compatibility concerns
5. Recommended fix approach

Format the response in markdown.`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return response.content[0].type === 'text' ? response.content[0].text : issue.description;
    } catch (error) {
      core.warning(`Failed to get detailed explanation: ${error.message}`);
      return `**${issue.type}**

${issue.description}

This issue affects ${issue.affectedViewports.join(', ')} viewports at ${issue.location.route}.`;
    }
  }

  /**
   * Capture screenshot with AI analysis
   */
  async captureAndAnalyze(page: Page, route: string): Promise<{
    screenshot: Buffer;
    analysis: string;
    issues: VisualIssue[];
  }> {
    // Take screenshot
    const screenshot = await page.screenshot({ fullPage: true });
    
    // Optimize screenshot first
    const optimized = await this.imageOptimizer.optimize(screenshot, {
      format: 'webp',
      quality: 90
    });
    
    // Generate image hash for caching
    const imageHash = crypto
      .createHash('sha256')
      .update(optimized.buffer)
      .digest('hex');
    
    // Convert to base64 for Claude Vision API
    const base64Image = optimized.buffer.toString('base64');
    
    // Create cache key
    const cacheKey = this.cache.createVisualAnalysisKey({
      imageHash,
      analysisType: 'visual-issues',
      options: { route }
    });
    
    // Analyze with Claude Vision (with caching)
    const response = await this.cache.wrap(
      cacheKey,
      () => this.claude.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this screenshot for visual issues. Focus on:
- Layout problems (overlapping elements, misalignment, broken grids)
- Responsive issues (content overflow, improper scaling)
- Text readability (contrast, truncation, font size)
- Spacing inconsistencies
- Color and styling issues
- Accessibility concerns

For each issue found, provide:
1. Issue type
2. Severity (critical/high/medium/low)
3. Description
4. Affected elements (CSS selectors if identifiable)
5. Suggested fix approach

Format your response as JSON.`
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image
            }
          }
        ]
      }]
    }),
      { ttl: 3600 } // Cache for 1 hour
    );
    
    // Parse Claude's response
    let issues: VisualIssue[] = [];
    try {
      const analysisText = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        if (analysis.issues && Array.isArray(analysis.issues)) {
          issues = analysis.issues.map((issue: any) => ({
            severity: issue.severity || 'medium',
            type: issue.type || 'Visual Issue',
            description: issue.description || 'Unspecified visual issue',
            affectedViewports: [], // Will be filled by caller
            location: {
              route,
              selector: issue.selector || ''
            }
          }));
        }
      }
    } catch (error) {
      core.warning(`Failed to parse Claude Vision response: ${error.message}`);
    }
    
    return {
      screenshot,
      analysis: response.content[0].type === 'text' ? response.content[0].text : '',
      issues
    };
  }

  /**
   * Compare with baseline
   */
  async compareWithBaseline(
    current: Buffer,
    baseline: Buffer
  ): Promise<{
    hasDifferences: boolean;
    diffPercentage: number;
    issues: VisualIssue[];
  }> {
    // Convert both images to base64
    const currentBase64 = current.toString('base64');
    const baselineBase64 = baseline.toString('base64');
    
    // Use Claude to compare
    const response = await this.claude.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Compare these two screenshots and identify visual differences. Focus on layout changes, styling differences, and content modifications. Provide a difference percentage (0-100) and list specific issues. Format as JSON.'
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: baselineBase64
            }
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: currentBase64
            }
          }
        ]
      }]
    });
    
    // Parse response
    let result = {
      hasDifferences: false,
      diffPercentage: 0,
      issues: [] as VisualIssue[]
    };
    
    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        result.hasDifferences = analysis.hasDifferences || false;
        result.diffPercentage = analysis.diffPercentage || 0;
        result.issues = (analysis.issues || []).map((issue: any) => ({
          severity: issue.severity || 'medium',
          type: 'Visual Regression',
          description: issue.description || 'Visual difference detected',
          affectedViewports: [],
          location: {
            route: '',
            selector: issue.selector || ''
          }
        }));
      }
    } catch (error) {
      core.warning(`Failed to parse baseline comparison: ${error.message}`);
    }
    
    return result;
  }

  /**
   * Analyze a specific route for issues
   */
  private async analyzeRoute(
    previewUrl: string,
    route: string,
    viewport: string,
    prNumber: number
  ): Promise<VisualIssue[]> {
    const url = new URL(route, previewUrl).toString();
    core.info(`Analyzing ${url} at ${viewport} viewport`);
    
    // Parse viewport dimensions
    const [width, height] = viewport.split('x').map(v => parseInt(v));
    
    // Create a temporary runner for this analysis
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width, height },
      userAgent: 'YoFix/1.0 Visual Analysis Bot'
    });
    const page = await context.newPage();
    
    try {
      // Navigate to the page
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // Wait for any animations to complete
      await page.waitForTimeout(2000);
      
      // Capture and analyze
      const { issues } = await this.captureAndAnalyze(page, route);
      
      // Add viewport information to issues
      issues.forEach(issue => {
        issue.affectedViewports = [this.getViewportName(viewport)];
      });
      
      return issues;
      
    } finally {
      await browser.close();
    }
  }

  /**
   * Get viewport name from dimensions
   */
  private getViewportName(viewport: string): string {
    const [width] = viewport.split('x').map(v => parseInt(v));
    if (width <= 480) return 'mobile';
    if (width <= 768) return 'tablet';
    return 'desktop';
  }

  /**
   * Calculate issue summary
   */
  private calculateSummary(issues: VisualIssue[]): ScanResult['summary'] {
    const summary: ScanResult['summary'] = {
      total: issues.length,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      byType: {}
    };
    
    issues.forEach(issue => {
      // Count by severity
      summary.bySeverity[issue.severity]++;
      
      // Count by type
      if (!summary.byType[issue.type]) {
        summary.byType[issue.type] = 0;
      }
      summary.byType[issue.type]++;
    });
    
    return summary;
  }
}