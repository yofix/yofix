"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixGenerator = void 0;
const SmartFixGenerator_1 = require("./SmartFixGenerator");
class FixGenerator {
    constructor(claudeApiKey, context) {
        this.smartGenerator = new SmartFixGenerator_1.SmartFixGenerator(claudeApiKey, context);
    }
    async generateFixes(issues) {
        const fixes = [];
        const errors = [];
        for (const issue of issues) {
            try {
                const fix = await this.generateFixForIssue(issue);
                if (fix) {
                    fixes.push(fix);
                }
            }
            catch (error) {
                errors.push(`Failed to generate fix for issue #${issue.id}: ${error.message}`);
            }
        }
        return {
            generated: fixes.length,
            applied: 0,
            fixes,
            errors
        };
    }
    async generateFixForIssue(issue) {
        return await this.smartGenerator.generateFix(issue);
    }
    updateContext(context) {
        this.smartGenerator.updateContext(context);
    }
    async validateFix(fix) {
        return true;
    }
    async applyFixes(fixes) {
        throw new Error('Apply fixes not yet implemented');
    }
}
exports.FixGenerator = FixGenerator;
