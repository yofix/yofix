import * as core from '@actions/core';
import { BrowserAction } from '../../browser-agent/types';

/**
 * Security sandbox for browser automation
 * Validates and sanitizes commands before execution
 */
export class BrowserSecuritySandbox {
  private allowedDomains: Set<string>;
  private blockedPatterns: RegExp[];
  private maxScriptLength: number = 5000;
  private dangerousJSPatterns: RegExp[];

  constructor() {
    // Initialize allowed domains (can be configured)
    this.allowedDomains = new Set([
      'localhost',
      '127.0.0.1',
      'web.app', // Firebase hosting
      'vercel.app',
      'netlify.app',
      'herokuapp.com',
      'github.io'
    ]);

    // Patterns that should be blocked
    this.blockedPatterns = [
      /file:\/\//i,
      /chrome:\/\//i,
      /about:/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i
    ];

    // Dangerous JavaScript patterns
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

  /**
   * Validate a browser action before execution
   */
  async validateAction(action: BrowserAction): Promise<ValidationResult> {
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
          // Most actions are safe by default
          return { valid: true, allowed: true };
      }
    } catch (error) {
      return {
        valid: false,
        allowed: false,
        error: `Validation error: ${error.message}`,
        reason: `Validation error: ${error.message}`
      };
    }
  }

  /**
   * Validate navigation URL
   */
  private validateNavigation(url: string): ValidationResult {
    // Check for blocked patterns
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

    // Validate URL format
    try {
      const parsedUrl = new URL(url);
      
      // Check protocol
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
          valid: false,
          allowed: false,
          error: `Invalid protocol: ${parsedUrl.protocol}. Only HTTP(S) allowed.`,
          reason: `Invalid protocol: ${parsedUrl.protocol}. Only HTTP(S) allowed.`
        };
      }

      // Check if domain is allowed (for non-preview URLs)
      if (!this.isDomainAllowed(parsedUrl.hostname)) {
        core.warning(`Navigating to unverified domain: ${parsedUrl.hostname}`);
      }

      return { valid: true, allowed: true };
    } catch (error) {
      // Might be a relative URL, which is fine
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

  /**
   * Validate JavaScript code
   */
  public validateScript(script: string): ValidationResult {
    // Check script length
    if (script.length > this.maxScriptLength) {
      return {
        valid: false,
        allowed: false,
        error: `Script too long: ${script.length} chars (max: ${this.maxScriptLength})`,
        reason: `Script too long: ${script.length} chars (max: ${this.maxScriptLength})`
      };
    }

    // Check for dangerous patterns
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

    // Check for attempts to access sensitive data
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

  /**
   * Validate user input
   */
  private validateInput(text: string): ValidationResult {
    // Check for script injection attempts
    const scriptPatterns = [
      /<script/i,
      /<\/script>/i,
      /javascript:/i,
      /on\w+\s*=/i, // Event handlers
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

    // Check length
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

  /**
   * Validate file upload
   */
  private validateFileUpload(files: string[]): ValidationResult {
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

      // Check for path traversal
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

  /**
   * Check if domain is allowed
   */
  private isDomainAllowed(hostname: string): boolean {
    // Check exact match
    if (this.allowedDomains.has(hostname)) {
      return true;
    }

    // Check subdomain patterns
    for (const domain of this.allowedDomains) {
      if (hostname.endsWith(`.${domain}`)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Sanitize HTML content
   */
  sanitizeHtml(html: string): string {
    // Remove script tags
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove event handlers
    html = html.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
    
    // Remove javascript: URLs
    html = html.replace(/javascript:/gi, '');
    
    return html;
  }

  /**
   * Create safe evaluation context
   */
  createSafeContext(): string {
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

  /**
   * Add allowed domain
   */
  addAllowedDomain(domain: string): void {
    this.allowedDomains.add(domain);
  }

  /**
   * Remove allowed domain
   */
  removeAllowedDomain(domain: string): void {
    this.allowedDomains.delete(domain);
  }
}

// Types
export interface ValidationResult {
  valid: boolean;
  allowed: boolean; // Add allowed property for backward compatibility
  error?: string;
  reason?: string; // Add reason property for backward compatibility  
  sanitized?: any;
}