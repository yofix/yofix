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
exports.BrowserSecuritySandbox = void 0;
const core = __importStar(require("@actions/core"));
class BrowserSecuritySandbox {
    constructor() {
        this.maxScriptLength = 5000;
        this.allowedDomains = new Set([
            'localhost',
            '127.0.0.1',
            'web.app',
            'vercel.app',
            'netlify.app',
            'herokuapp.com',
            'github.io'
        ]);
        this.blockedPatterns = [
            /file:\/\//i,
            /chrome:\/\//i,
            /about:/i,
            /javascript:/i,
            /data:text\/html/i,
            /vbscript:/i
        ];
        this.dangerousJSPatterns = [
            /eval\s*\(/i,
            /new\s+Function\s*\(/i,
            /setTimeout\s*\([^,]+,/i,
            /setInterval\s*\(/i,
            /document\.write/i,
            /innerHTML\s*=/i,
            /outerHTML\s*=/i,
            /window\.location/i,
            /document\.cookie/i,
            /localStorage/i,
            /sessionStorage/i,
            /fetch\s*\(/i,
            /XMLHttpRequest/i,
            /\.submit\(\)/i,
            /form\.submit/i,
            /window\.open/i,
            /alert\s*\(/i,
            /confirm\s*\(/i,
            /prompt\s*\(/i
        ];
    }
    async validateAction(action) {
        try {
            switch (action.type) {
                case 'navigate':
                    return this.validateNavigation(action.parameters?.url || action.params?.url || action.url);
                case 'evaluate':
                    return this.validateScript(action.parameters?.script || action.params?.script || action.script);
                case 'type':
                    return this.validateInput(action.parameters?.text || action.params?.text || action.text);
                case 'upload':
                    return this.validateFileUpload(action.parameters?.files || action.params?.files || [action.filePath]);
                default:
                    return { valid: true, allowed: true };
            }
        }
        catch (error) {
            return {
                valid: false,
                allowed: false,
                error: `Validation error: ${error.message}`,
                reason: `Validation error: ${error.message}`
            };
        }
    }
    validateNavigation(url) {
        for (const pattern of this.blockedPatterns) {
            if (pattern.test(url)) {
                return {
                    valid: false,
                    allowed: false,
                    error: `Blocked URL pattern: ${pattern}`,
                    reason: `Blocked URL pattern: ${pattern}`
                };
            }
        }
        try {
            const parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                return {
                    valid: false,
                    allowed: false,
                    error: `Invalid protocol: ${parsedUrl.protocol}. Only HTTP(S) allowed.`,
                    reason: `Invalid protocol: ${parsedUrl.protocol}. Only HTTP(S) allowed.`
                };
            }
            if (!this.isDomainAllowed(parsedUrl.hostname)) {
                core.warning(`Navigating to unverified domain: ${parsedUrl.hostname}`);
            }
            return { valid: true, allowed: true };
        }
        catch (error) {
            if (url.startsWith('/')) {
                return { valid: true, allowed: true };
            }
            return {
                valid: false,
                allowed: false,
                error: `Invalid URL format: ${url}`,
                reason: `Invalid URL format: ${url}`
            };
        }
    }
    validateScript(script) {
        if (script.length > this.maxScriptLength) {
            return {
                valid: false,
                allowed: false,
                error: `Script too long: ${script.length} chars (max: ${this.maxScriptLength})`,
                reason: `Script too long: ${script.length} chars (max: ${this.maxScriptLength})`
            };
        }
        for (const pattern of this.dangerousJSPatterns) {
            if (pattern.test(script)) {
                return {
                    valid: false,
                    allowed: false,
                    error: `Dangerous pattern detected: ${pattern}`,
                    reason: `Dangerous pattern detected: ${pattern}`
                };
            }
        }
        const sensitivePatterns = [
            /process\.env/i,
            /require\s*\(/i,
            /import\s+/i,
            /__dirname/i,
            /__filename/i
        ];
        for (const pattern of sensitivePatterns) {
            if (pattern.test(script)) {
                return {
                    valid: false,
                    allowed: false,
                    error: `Access to sensitive data blocked: ${pattern}`,
                    reason: `Access to sensitive data blocked: ${pattern}`
                };
            }
        }
        return { valid: true, allowed: true };
    }
    validateInput(text) {
        const scriptPatterns = [
            /<script/i,
            /<\/script>/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /<iframe/i,
            /<object/i,
            /<embed/i
        ];
        for (const pattern of scriptPatterns) {
            if (pattern.test(text)) {
                return {
                    valid: false,
                    allowed: false,
                    error: `Potential script injection detected: ${pattern}`,
                    reason: `Potential script injection detected: ${pattern}`
                };
            }
        }
        if (text.length > 10000) {
            return {
                valid: false,
                allowed: false,
                error: `Input too long: ${text.length} chars (max: 10000)`,
                reason: `Input too long: ${text.length} chars (max: 10000)`
            };
        }
        return { valid: true, allowed: true };
    }
    validateFileUpload(files) {
        const allowedExtensions = [
            '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
            '.pdf', '.txt', '.csv', '.json', '.xml',
            '.doc', '.docx', '.xls', '.xlsx'
        ];
        for (const file of files) {
            const ext = file.toLowerCase().substring(file.lastIndexOf('.'));
            if (!allowedExtensions.includes(ext)) {
                return {
                    valid: false,
                    allowed: false,
                    error: `File type not allowed: ${ext}`,
                    reason: `File type not allowed: ${ext}`
                };
            }
            if (file.includes('..') || file.includes('~')) {
                return {
                    valid: false,
                    allowed: false,
                    error: `Potential path traversal detected in: ${file}`,
                    reason: `Potential path traversal detected in: ${file}`
                };
            }
        }
        return { valid: true, allowed: true };
    }
    isDomainAllowed(hostname) {
        if (this.allowedDomains.has(hostname)) {
            return true;
        }
        for (const domain of this.allowedDomains) {
            if (hostname.endsWith(`.${domain}`)) {
                return true;
            }
        }
        return false;
    }
    sanitizeHtml(html) {
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        html = html.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
        html = html.replace(/javascript:/gi, '');
        return html;
    }
    createSafeContext() {
        return `
      // Safe context for evaluation
      (function() {
        'use strict';
        
        // Block dangerous globals
        const blocked = ['eval', 'Function', 'setTimeout', 'setInterval'];
        blocked.forEach(name => {
          window[name] = () => {
            throw new Error(\`Access to \${name} is blocked\`);
          };
        });
        
        // Limit network access
        const originalFetch = window.fetch;
        window.fetch = async (url, options) => {
          const allowed = ${JSON.stringify(Array.from(this.allowedDomains))};
          const urlObj = new URL(url, window.location.origin);
          
          if (!allowed.some(domain => urlObj.hostname.includes(domain))) {
            throw new Error(\`Network access to \${urlObj.hostname} is blocked\`);
          }
          
          return originalFetch(url, options);
        };
        
        // Your code here
      })();
    `;
    }
    addAllowedDomain(domain) {
        this.allowedDomains.add(domain);
    }
    removeAllowedDomain(domain) {
        this.allowedDomains.delete(domain);
    }
}
exports.BrowserSecuritySandbox = BrowserSecuritySandbox;
