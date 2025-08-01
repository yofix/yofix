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
exports.SmartFixGenerator = void 0;
const core = __importStar(require("@actions/core"));
const sdk_1 = require("@anthropic-ai/sdk");
const PatternMatcher_1 = require("./PatternMatcher");
const FixValidator_1 = require("./FixValidator");
const FixTemplates_1 = require("./FixTemplates");
const CacheManager_1 = require("../../optimization/CacheManager");
const config_1 = __importDefault(require("../../config"));
class SmartFixGenerator {
    constructor(claudeApiKey, context, cache) {
        this.context = context;
        this.claude = new sdk_1.Anthropic({ apiKey: claudeApiKey });
        this.patternMatcher = new PatternMatcher_1.PatternMatcher();
        this.validator = new FixValidator_1.FixValidator();
        this.templates = new FixTemplates_1.FixTemplates();
        this.cache = cache || new CacheManager_1.CacheManager();
    }
    async generateFix(issue) {
        try {
            const template = this.templates.getTemplate(issue.type);
            const patterns = this.context ?
                await this.patternMatcher.findSimilarPatterns(issue, this.context) :
                [];
            const prompt = this.buildContextualPrompt(issue, patterns, template);
            const cacheKey = this.cache.createAIResponseKey({
                model: config_1.default.get('ai.claude.models.fixing'),
                prompt,
                temperature: config_1.default.get('ai.claude.temperature', 0.3),
                maxTokens: 2048
            });
            const fixData = await this.cache.wrap(cacheKey, () => this.generateWithClaude(prompt, issue), { ttl: 7200 });
            if (!fixData) {
                return null;
            }
            const validated = await this.validator.validate(fixData, issue);
            if (!validated.isValid) {
                core.warning(`Fix validation failed: ${validated.reason}`);
                return null;
            }
            return {
                id: Date.now(),
                issueId: issue.id,
                description: fixData.description,
                confidence: fixData.confidence,
                files: fixData.files
            };
        }
        catch (error) {
            core.error(`Failed to generate fix: ${error.message}`);
            return null;
        }
    }
    buildContextualPrompt(issue, patterns, template) {
        let prompt = `Generate a code fix for this visual issue:

Issue Type: ${issue.type}
Severity: ${issue.severity}
Description: ${issue.description}
Affected Viewports: ${issue.affectedViewports.join(', ')}
Location: ${issue.location.route}
${issue.location.selector ? `CSS Selector: ${issue.location.selector}` : ''}
${issue.location.file ? `File: ${issue.location.file}` : ''}

Requirements:
1. The fix MUST resolve the visual issue
2. Use minimal changes - don't refactor unnecessarily
3. Maintain existing functionality
4. Follow responsive design best practices
5. Ensure cross-browser compatibility`;
        if (template) {
            prompt += `\n\nRecommended approach for ${issue.type}:
${template.description}
Common solutions:
${template.solutions.map((s) => `- ${s}`).join('\n')}`;
        }
        if (patterns.length > 0) {
            prompt += `\n\nSimilar patterns found in codebase:
${patterns.map(p => `- ${p.description}: ${p.code}`).join('\n')}
Follow these existing patterns where applicable.`;
        }
        if (this.context?.framework) {
            prompt += `\n\nFramework: ${this.context.framework}
Style System: ${this.context.styleSystem || 'CSS'}`;
        }
        prompt += `\n\nReturn the fix in this exact JSON format:
{
  "description": "Brief description of what the fix does",
  "confidence": 0.85,
  "reasoning": "Why this fix works",
  "files": [
    {
      "path": "path/to/file.css",
      "language": "css",
      "changes": [
        {
          "type": "add|replace|remove",
          "line": 10,
          "original": "original code if type is replace",
          "content": "new code to add or replace"
        }
      ]
    }
  ]
}`;
        return prompt;
    }
    async generateWithClaude(prompt, issue) {
        try {
            const response = await this.claude.messages.create({
                model: config_1.default.get('ai.claude.models.fixing'),
                max_tokens: config_1.default.get('ai.claude.maxTokens.fixing'),
                temperature: config_1.default.get('ai.claude.temperature', 0.3),
                messages: [{
                        role: 'user',
                        content: prompt
                    }]
            });
            const responseText = response.content[0].type === 'text' ?
                response.content[0].text : '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No valid JSON found in response');
            }
            const fixData = JSON.parse(jsonMatch[0]);
            if (!fixData.files || !Array.isArray(fixData.files)) {
                throw new Error('Invalid fix format: missing files array');
            }
            if (!fixData.confidence) {
                fixData.confidence = this.calculateConfidence(issue, fixData);
            }
            return fixData;
        }
        catch (error) {
            core.error(`Claude API error: ${error.message}`);
            const template = this.templates.getTemplate(issue.type);
            if (template && template.defaultFix) {
                return this.applyTemplateFix(issue, template);
            }
            return null;
        }
    }
    calculateConfidence(issue, fixData) {
        let confidence = 0.7;
        const highConfidenceTypes = ['text-overflow', 'button-overlap', 'responsive-breakage'];
        const lowConfidenceTypes = ['layout-shift', 'complex-alignment'];
        if (highConfidenceTypes.includes(issue.type)) {
            confidence += 0.15;
        }
        else if (lowConfidenceTypes.includes(issue.type)) {
            confidence -= 0.15;
        }
        const totalChanges = fixData.files.reduce((sum, file) => sum + (file.changes?.length || 0), 0);
        if (totalChanges <= 3) {
            confidence += 0.1;
        }
        else if (totalChanges > 10) {
            confidence -= 0.1;
        }
        if (issue.affectedViewports.length === 1) {
            confidence += 0.05;
        }
        return Math.max(0.3, Math.min(0.95, confidence));
    }
    applyTemplateFix(issue, template) {
        const defaultFix = template.defaultFix;
        const customized = {
            ...defaultFix,
            description: `Fix ${issue.type} on ${issue.affectedViewports.join(', ')} viewport(s)`,
            confidence: 0.6,
            files: defaultFix.files.map((file) => ({
                ...file,
                path: issue.location.file || file.path,
                changes: file.changes.map((change) => ({
                    ...change,
                    content: change.content
                        .replace('{{selector}}', issue.location.selector || '.element')
                        .replace('{{viewport}}', issue.affectedViewports[0] || 'mobile')
                }))
            }))
        };
        return customized;
    }
    updateContext(context) {
        this.context = context;
        this.patternMatcher.updateContext(context);
    }
}
exports.SmartFixGenerator = SmartFixGenerator;
