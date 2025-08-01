#!/usr/bin/env node

/**
 * Screenshot Analyzer Module
 * Analyzes screenshots using AI (Claude)
 */

import * as path from 'path';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import appConfig from '../config';
import { 
  createModuleLogger, 
  ErrorCategory, 
  ErrorSeverity, 
  executeOperation,
  config,
  getBooleanConfig,
  safeJSONParse,
  read,
  write,
  exists
} from '../core';

interface AnalysisResult {
  screenshot: string;
  issues: Issue[];
  suggestions: string[];
  accessibility: AccessibilityCheck[];
}

interface Issue {
  type: 'layout' | 'design' | 'content' | 'functionality';
  severity: 'high' | 'medium' | 'low';
  description: string;
  element?: string;
}

interface AccessibilityCheck {
  check: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
}

const logger = createModuleLogger({
  module: 'ScreenshotAnalyzer',
  defaultCategory: ErrorCategory.AI
});

async function analyzeScreenshots(): Promise<void> {
  const screenshotsJson = config.get('screenshots', { defaultValue: '[]' });
  const apiKey = config.getSecret('claude-api-key');
  const debug = getBooleanConfig('debug');

  if (!apiKey) {
    logger.warn('⚠️ Claude API key not provided, skipping AI analysis');
    // Still output empty results for consistency
    outputResults([]);
    return;
  }

  logger.info('🤖 Analyzing screenshots with AI...');

  const parseResult = safeJSONParse<string[]>(screenshotsJson, { defaultValue: [] });
  if (!parseResult.success) {
    await logger.error(new Error(parseResult.error!), {
      userAction: 'Parse screenshots input',
      severity: ErrorSeverity.CRITICAL,
      metadata: { screenshotsJson }
    });
    process.exit(1);
  }
  const screenshots = parseResult.data!;

  if (screenshots.length === 0) {
    logger.warn('⚠️ No screenshots to analyze');
    outputResults([]);
    return;
  }

  const anthropic = new Anthropic({ apiKey });
  const results: AnalysisResult[] = [];

  for (const screenshotPath of screenshots) {
    if (!await exists(screenshotPath)) {
      logger.warn(`⚠️ Screenshot not found: ${screenshotPath}`);
      continue;
    }

    logger.info(`\n📸 Analyzing: ${path.basename(screenshotPath)}`);

    try {
      // Read screenshot as base64
      const imageContent = await read(screenshotPath, { encoding: 'base64' as any });
      if (!imageContent) {
        logger.warn(`Failed to read screenshot: ${screenshotPath}`);
        continue;
      }
      const base64Image = imageContent;

      // Analyze with Claude
      const response = await anthropic.messages.create({
        model: appConfig.get('ai.claude.models.screenshot'),
        max_tokens: appConfig.get('ai.claude.maxTokens.default'),
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this screenshot for visual issues, UX problems, and accessibility concerns. 
                     Provide a JSON response with:
                     - issues: array of {type, severity, description, element}
                     - suggestions: array of improvement suggestions
                     - accessibility: array of {check, status, message}
                     
                     Focus on:
                     1. Layout issues (alignment, spacing, overflow)
                     2. Design consistency (colors, fonts, styling)
                     3. Content issues (missing text, broken images)
                     4. Functionality indicators (broken buttons, forms)
                     5. Accessibility (contrast, text size, alt text indicators)`
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
      });

      // Parse the response
      const analysisText = response.content[0].type === 'text' ? response.content[0].text : '';
      let analysis: any = {};

      try {
        // Extract JSON from the response
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Fallback to simple text analysis
        analysis = {
          issues: [{
            type: 'content',
            severity: 'low',
            description: 'AI analysis completed but could not parse structured results'
          }],
          suggestions: [analysisText],
          accessibility: []
        };
      }

      results.push({
        screenshot: screenshotPath,
        issues: analysis.issues || [],
        suggestions: analysis.suggestions || [],
        accessibility: analysis.accessibility || []
      });

      if (debug) {
        logger.debug('Analysis result:', JSON.stringify(analysis, null, 2));
      }

      // Summary
      const issueCount = (analysis.issues || []).length;
      logger.info(`  ✅ Analysis complete: ${issueCount} issues found`);

    } catch (error: any) {
      await logger.error(error, {
        userAction: 'Analyze screenshot',
        severity: error.message?.includes('authentication') ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH,
        metadata: { screenshot: screenshotPath }
      });
      
      // Check if it's an API key issue
      if (error.message?.includes('authentication')) {
        logger.warn('⚠️ Claude API authentication failed. Please check your API key.');
        break; // Stop trying other screenshots
      }
    }
  }

  outputResults(results);
}

function outputResults(results: AnalysisResult[]): void {
  // Output results
  const outputPath = path.join(process.cwd(), 'analysis-results.json');
  const summary = {
    results,
    summary: {
      total_screenshots: results.length,
      total_issues: results.reduce((sum, r) => sum + r.issues.length, 0),
      high_severity: results.reduce((sum, r) => sum + r.issues.filter(i => i.severity === 'high').length, 0),
      accessibility_failures: results.reduce((sum, r) => sum + r.accessibility.filter(a => a.status === 'failed').length, 0)
    }
  };

  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

  // Set GitHub Action output
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    fs.appendFileSync(githubOutput, `results=${JSON.stringify(results)}\n`);
    fs.appendFileSync(githubOutput, `total-issues=${summary.summary.total_issues}\n`);
    fs.appendFileSync(githubOutput, `high-severity-issues=${summary.summary.high_severity}\n`);
  }

  logger.info(`\n✅ Analysis completed: ${summary.summary.total_issues} total issues found`);
}

// Run if called directly
if (require.main === module) {
  analyzeScreenshots().catch(async (error) => {
    await logger.error(error, {
      userAction: 'Run screenshot analyzer',
      severity: ErrorSeverity.CRITICAL
    });
    process.exit(1);
  });
}