#!/usr/bin/env node
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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const config_1 = __importDefault(require("../config"));
const core_1 = require("../core");
const logger = (0, core_1.createModuleLogger)({
    module: 'ScreenshotAnalyzer',
    defaultCategory: core_1.ErrorCategory.AI
});
async function analyzeScreenshots() {
    const screenshotsJson = core_1.config.get('screenshots', { defaultValue: '[]' });
    const apiKey = core_1.config.getSecret('claude-api-key');
    const debug = (0, core_1.getBooleanConfig)('debug');
    if (!apiKey) {
        logger.warn('⚠️ Claude API key not provided, skipping AI analysis');
        outputResults([]);
        return;
    }
    logger.info('🤖 Analyzing screenshots with AI...');
    const parseResult = (0, core_1.safeJSONParse)(screenshotsJson, { defaultValue: [] });
    if (!parseResult.success) {
        await logger.error(new Error(parseResult.error), {
            userAction: 'Parse screenshots input',
            severity: core_1.ErrorSeverity.CRITICAL,
            metadata: { screenshotsJson }
        });
        process.exit(1);
    }
    const screenshots = parseResult.data;
    if (screenshots.length === 0) {
        logger.warn('⚠️ No screenshots to analyze');
        outputResults([]);
        return;
    }
    const anthropic = new sdk_1.default({ apiKey });
    const results = [];
    for (const screenshotPath of screenshots) {
        if (!await (0, core_1.exists)(screenshotPath)) {
            logger.warn(`⚠️ Screenshot not found: ${screenshotPath}`);
            continue;
        }
        logger.info(`\n📸 Analyzing: ${path.basename(screenshotPath)}`);
        try {
            const imageContent = await (0, core_1.read)(screenshotPath, { encoding: 'base64' });
            if (!imageContent) {
                logger.warn(`Failed to read screenshot: ${screenshotPath}`);
                continue;
            }
            const base64Image = imageContent;
            const response = await anthropic.messages.create({
                model: config_1.default.get('ai.claude.models.screenshot'),
                max_tokens: config_1.default.get('ai.claude.maxTokens.default'),
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
            const analysisText = response.content[0].type === 'text' ? response.content[0].text : '';
            let analysis = {};
            try {
                const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    analysis = JSON.parse(jsonMatch[0]);
                }
            }
            catch {
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
            const issueCount = (analysis.issues || []).length;
            logger.info(`  ✅ Analysis complete: ${issueCount} issues found`);
        }
        catch (error) {
            await logger.error(error, {
                userAction: 'Analyze screenshot',
                severity: error.message?.includes('authentication') ? core_1.ErrorSeverity.CRITICAL : core_1.ErrorSeverity.HIGH,
                metadata: { screenshot: screenshotPath }
            });
            if (error.message?.includes('authentication')) {
                logger.warn('⚠️ Claude API authentication failed. Please check your API key.');
                break;
            }
        }
    }
    outputResults(results);
}
function outputResults(results) {
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
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
        fs.appendFileSync(githubOutput, `results=${JSON.stringify(results)}\n`);
        fs.appendFileSync(githubOutput, `total-issues=${summary.summary.total_issues}\n`);
        fs.appendFileSync(githubOutput, `high-severity-issues=${summary.summary.high_severity}\n`);
    }
    logger.info(`\n✅ Analysis completed: ${summary.summary.total_issues} total issues found`);
}
if (require.main === module) {
    analyzeScreenshots().catch(async (error) => {
        await logger.error(error, {
            userAction: 'Run screenshot analyzer',
            severity: core_1.ErrorSeverity.CRITICAL
        });
        process.exit(1);
    });
}
