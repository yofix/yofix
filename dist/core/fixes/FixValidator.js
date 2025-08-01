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
exports.FixValidator = void 0;
const core = __importStar(require("@actions/core"));
class FixValidator {
    async validate(fixData, issue) {
        const warnings = [];
        try {
            if (!this.validateStructure(fixData)) {
                return {
                    isValid: false,
                    reason: 'Invalid fix structure'
                };
            }
            for (const file of fixData.files) {
                if (file.language === 'css' || file.path.endsWith('.css')) {
                    const cssValidation = this.validateCSS(file.changes);
                    if (!cssValidation.isValid) {
                        return cssValidation;
                    }
                    if (cssValidation.warnings) {
                        warnings.push(...cssValidation.warnings);
                    }
                }
            }
            const dangerousCheck = this.checkDangerousPatterns(fixData);
            if (!dangerousCheck.isValid) {
                return dangerousCheck;
            }
            if (issue.affectedViewports.length > 0) {
                const viewportCheck = this.validateViewportFix(fixData, issue.affectedViewports);
                if (!viewportCheck.isValid) {
                    return viewportCheck;
                }
            }
            const complexityCheck = this.checkComplexity(fixData);
            if (complexityCheck.warnings) {
                warnings.push(...complexityCheck.warnings);
            }
            return {
                isValid: true,
                warnings: warnings.length > 0 ? warnings : undefined
            };
        }
        catch (error) {
            return {
                isValid: false,
                reason: `Validation error: ${error.message}`
            };
        }
    }
    validateStructure(fixData) {
        if (!fixData.files || !Array.isArray(fixData.files)) {
            return false;
        }
        for (const file of fixData.files) {
            if (!file.path || !file.changes || !Array.isArray(file.changes)) {
                return false;
            }
            for (const change of file.changes) {
                if (!change.type || !change.content) {
                    return false;
                }
                if (change.type === 'replace' && !change.original) {
                    return false;
                }
            }
        }
        return true;
    }
    validateCSS(changes) {
        const warnings = [];
        for (const change of changes) {
            const css = change.content;
            if (!this.isValidCSS(css)) {
                return {
                    isValid: false,
                    reason: `Invalid CSS syntax: ${css.substring(0, 50)}...`
                };
            }
            if (css.includes('!important')) {
                warnings.push('Fix uses !important - consider more specific selectors');
            }
            if (css.match(/z-index:\s*(\d+)/)) {
                const zIndex = parseInt(RegExp.$1);
                if (zIndex > 9999) {
                    warnings.push(`Very high z-index (${zIndex}) detected`);
                }
            }
            if (css.match(/-webkit-|-moz-|-ms-|-o-/)) {
                warnings.push('Vendor prefixes detected - consider using autoprefixer');
            }
        }
        return {
            isValid: true,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
    isValidCSS(css) {
        const cleanCSS = css.replace(/\/\*[\s\S]*?\*\//g, '');
        const openBraces = (cleanCSS.match(/{/g) || []).length;
        const closeBraces = (cleanCSS.match(/}/g) || []).length;
        if (openBraces !== closeBraces) {
            return false;
        }
        const quotes = cleanCSS.match(/["']/g) || [];
        if (quotes.length % 2 !== 0) {
            return false;
        }
        if (cleanCSS.includes(':') && !cleanCSS.includes(';') && !cleanCSS.includes('}')) {
            return false;
        }
        return true;
    }
    checkDangerousPatterns(fixData) {
        const dangerous = [
            { pattern: /position:\s*fixed.*width:\s*100%.*height:\s*100%/s, reason: 'Full-screen overlay might block entire UI' },
            { pattern: /display:\s*none.*\*|body|html/s, reason: 'Hiding critical elements' },
            { pattern: /opacity:\s*0.*pointer-events:\s*none/s, reason: 'Making elements invisible but interactive' },
            { pattern: /transform:.*scale\(0\)/s, reason: 'Scaling elements to zero' },
            { pattern: /margin:.*-9999px/s, reason: 'Extreme negative margins' }
        ];
        for (const file of fixData.files) {
            for (const change of file.changes) {
                const content = change.content.toLowerCase();
                for (const { pattern, reason } of dangerous) {
                    if (pattern.test(content)) {
                        return {
                            isValid: false,
                            reason: `Dangerous pattern detected: ${reason}`
                        };
                    }
                }
            }
        }
        return { isValid: true };
    }
    validateViewportFix(fixData, affectedViewports) {
        let hasViewportFix = false;
        for (const file of fixData.files) {
            for (const change of file.changes) {
                const content = change.content;
                if (content.includes('@media')) {
                    hasViewportFix = true;
                    if (!content.match(/@media\s*\([^)]+\)\s*{/)) {
                        return {
                            isValid: false,
                            reason: 'Invalid media query syntax'
                        };
                    }
                }
                if (content.match(/\d+(vw|vh|vmin|vmax|%)/)) {
                    hasViewportFix = true;
                }
            }
        }
        if (affectedViewports.includes('mobile') && !hasViewportFix) {
            core.warning('Mobile issue but no responsive fix detected');
        }
        return { isValid: true };
    }
    checkComplexity(fixData) {
        const warnings = [];
        const totalChanges = fixData.files.reduce((sum, file) => sum + file.changes.length, 0);
        if (totalChanges > 20) {
            warnings.push(`Fix is complex with ${totalChanges} changes - consider breaking it down`);
        }
        if (fixData.files.length > 5) {
            warnings.push(`Fix modifies ${fixData.files.length} files - ensure all changes are necessary`);
        }
        return warnings.length > 0 ? { warnings } : {};
    }
}
exports.FixValidator = FixValidator;
