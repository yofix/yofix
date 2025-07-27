import { VisualIssue } from '../../bot/types';
import * as core from '@actions/core';

interface ValidationResult {
  isValid: boolean;
  reason?: string;
  warnings?: string[];
}

/**
 * Validates generated fixes to ensure they won't break existing code
 */
export class FixValidator {
  /**
   * Validate a generated fix
   */
  async validate(fixData: any, issue: VisualIssue): Promise<ValidationResult> {
    const warnings: string[] = [];
    
    try {
      // 1. Validate structure
      if (!this.validateStructure(fixData)) {
        return { 
          isValid: false, 
          reason: 'Invalid fix structure' 
        };
      }

      // 2. Validate CSS syntax
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

      // 3. Check for dangerous patterns
      const dangerousCheck = this.checkDangerousPatterns(fixData);
      if (!dangerousCheck.isValid) {
        return dangerousCheck;
      }

      // 4. Validate viewport-specific fixes
      if (issue.affectedViewports.length > 0) {
        const viewportCheck = this.validateViewportFix(fixData, issue.affectedViewports);
        if (!viewportCheck.isValid) {
          return viewportCheck;
        }
      }

      // 5. Check complexity
      const complexityCheck = this.checkComplexity(fixData);
      if (complexityCheck.warnings) {
        warnings.push(...complexityCheck.warnings);
      }

      return {
        isValid: true,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      return {
        isValid: false,
        reason: `Validation error: ${error.message}`
      };
    }
  }

  /**
   * Validate fix structure
   */
  private validateStructure(fixData: any): boolean {
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

  /**
   * Validate CSS syntax
   */
  private validateCSS(changes: any[]): ValidationResult {
    const warnings: string[] = [];

    for (const change of changes) {
      const css = change.content;

      // Basic CSS validation
      if (!this.isValidCSS(css)) {
        return {
          isValid: false,
          reason: `Invalid CSS syntax: ${css.substring(0, 50)}...`
        };
      }

      // Check for common CSS issues
      if (css.includes('!important')) {
        warnings.push('Fix uses !important - consider more specific selectors');
      }

      if (css.match(/z-index:\s*(\d+)/)) {
        const zIndex = parseInt(RegExp.$1);
        if (zIndex > 9999) {
          warnings.push(`Very high z-index (${zIndex}) detected`);
        }
      }

      // Check for vendor prefixes
      if (css.match(/-webkit-|-moz-|-ms-|-o-/)) {
        warnings.push('Vendor prefixes detected - consider using autoprefixer');
      }
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Basic CSS syntax validation
   */
  private isValidCSS(css: string): boolean {
    // Remove comments
    const cleanCSS = css.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Check for basic syntax errors
    const openBraces = (cleanCSS.match(/{/g) || []).length;
    const closeBraces = (cleanCSS.match(/}/g) || []).length;
    
    if (openBraces !== closeBraces) {
      return false;
    }

    // Check for unclosed strings
    const quotes = cleanCSS.match(/["']/g) || [];
    if (quotes.length % 2 !== 0) {
      return false;
    }

    // Check for basic property:value structure
    if (cleanCSS.includes(':') && !cleanCSS.includes(';') && !cleanCSS.includes('}')) {
      return false;
    }

    return true;
  }

  /**
   * Check for dangerous patterns
   */
  private checkDangerousPatterns(fixData: any): ValidationResult {
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

  /**
   * Validate viewport-specific fixes
   */
  private validateViewportFix(fixData: any, affectedViewports: string[]): ValidationResult {
    let hasViewportFix = false;

    for (const file of fixData.files) {
      for (const change of file.changes) {
        const content = change.content;
        
        // Check for media queries
        if (content.includes('@media')) {
          hasViewportFix = true;
          
          // Validate media query syntax
          if (!content.match(/@media\s*\([^)]+\)\s*{/)) {
            return {
              isValid: false,
              reason: 'Invalid media query syntax'
            };
          }
        }
        
        // Check for responsive units
        if (content.match(/\d+(vw|vh|vmin|vmax|%)/)) {
          hasViewportFix = true;
        }
      }
    }

    // If issue affects specific viewports, ensure fix addresses them
    if (affectedViewports.includes('mobile') && !hasViewportFix) {
      core.warning('Mobile issue but no responsive fix detected');
    }

    return { isValid: true };
  }

  /**
   * Check fix complexity
   */
  private checkComplexity(fixData: any): { warnings?: string[] } {
    const warnings: string[] = [];
    
    // Count total changes
    const totalChanges = fixData.files.reduce((sum: number, file: any) => 
      sum + file.changes.length, 0
    );

    if (totalChanges > 20) {
      warnings.push(`Fix is complex with ${totalChanges} changes - consider breaking it down`);
    }

    // Check for multiple file changes
    if (fixData.files.length > 5) {
      warnings.push(`Fix modifies ${fixData.files.length} files - ensure all changes are necessary`);
    }

    return warnings.length > 0 ? { warnings } : {};
  }
}