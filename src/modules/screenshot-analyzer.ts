#!/usr/bin/env node

/**
 * Screenshot Analyzer Module
 * Analyzes screenshots using AI (Claude)
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

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

async function analyzeScreenshots(): Promise<void> {
  const screenshotsJson = process.env.INPUT_SCREENSHOTS || '[]';
  const apiKey = process.env.INPUT_CLAUDE_API_KEY;
  const debug = process.env.INPUT_DEBUG === 'true';

  if (!apiKey) {
    console.log('⚠️ Claude API key not provided, skipping AI analysis');
    // Still output empty results for consistency
    outputResults([]);
    return;
  }

  console.log('🤖 Analyzing screenshots with AI...');

  let screenshots: string[] = [];
  try {
    screenshots = JSON.parse(screenshotsJson);
  } catch {
    console.error('❌ Invalid screenshots input');
    process.exit(1);
  }

  if (screenshots.length === 0) {
    console.log('⚠️ No screenshots to analyze');
    outputResults([]);
    return;
  }

  const anthropic = new Anthropic({ apiKey });
  const results: AnalysisResult[] = [];

  for (const screenshotPath of screenshots) {
    if (!fs.existsSync(screenshotPath)) {
      console.log(`⚠️ Screenshot not found: ${screenshotPath}`);
      continue;
    }

    console.log(`\n📸 Analyzing: ${path.basename(screenshotPath)}`);

    try {
      // Read screenshot as base64
      const imageBuffer = fs.readFileSync(screenshotPath);
      const base64Image = imageBuffer.toString('base64');

      // Analyze with Claude
      const response = await anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1024,
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
        console.log('Analysis result:', JSON.stringify(analysis, null, 2));
      }

      // Summary
      const issueCount = (analysis.issues || []).length;
      console.log(`  ✅ Analysis complete: ${issueCount} issues found`);

    } catch (error: any) {
      console.error(`  ❌ Analysis failed: ${error.message}`);
      
      // Check if it's an API key issue
      if (error.message?.includes('authentication')) {
        console.error('⚠️ Claude API authentication failed. Please check your API key.');
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

  console.log(`\n✅ Analysis completed: ${summary.summary.total_issues} total issues found`);
}

// Run if called directly
if (require.main === module) {
  analyzeScreenshots().catch(console.error);
}