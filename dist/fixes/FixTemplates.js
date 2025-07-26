"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixTemplates = void 0;
class FixTemplates {
    constructor() {
        this.templates = new Map();
        this.initializeTemplates();
    }
    getTemplate(issueType) {
        return this.templates.get(issueType);
    }
    initializeTemplates() {
        this.templates.set('layout-shift', {
            description: 'Fix layout shifts by establishing proper positioning context',
            solutions: [
                'Use position: relative on parent container',
                'Apply position: absolute with proper containing block',
                'Use CSS Grid or Flexbox for stable layouts',
                'Set explicit dimensions to prevent reflow'
            ],
            defaultFix: {
                description: 'Stabilize layout with proper positioning',
                confidence: 0.75,
                files: [{
                        path: 'styles.css',
                        language: 'css',
                        changes: [{
                                type: 'add',
                                line: 1,
                                content: `{{selector}} {
  position: relative;
  z-index: 10;
}

@media (max-width: 768px) {
  {{selector}} {
    position: static;
  }
}`
                            }]
                    }]
            }
        });
        this.templates.set('element-overlap', {
            description: 'Fix overlapping elements with z-index and positioning',
            solutions: [
                'Manage z-index values systematically',
                'Create stacking contexts properly',
                'Use isolation: isolate for complex layouts',
                'Check position values on parent elements'
            ],
            defaultFix: {
                description: 'Fix element overlap with z-index management',
                confidence: 0.8,
                files: [{
                        path: 'styles.css',
                        language: 'css',
                        changes: [{
                                type: 'add',
                                line: 1,
                                content: `{{selector}} {
  position: relative;
  z-index: 100;
  isolation: isolate;
}`
                            }]
                    }]
            }
        });
        this.templates.set('responsive-breakage', {
            description: 'Fix responsive issues with proper media queries',
            solutions: [
                'Use mobile-first media queries',
                'Apply flexible units (rem, %, vw)',
                'Implement container queries where supported',
                'Use CSS Grid auto-fit/auto-fill'
            ],
            defaultFix: {
                description: 'Fix responsive layout for {{viewport}} viewport',
                confidence: 0.7,
                files: [{
                        path: 'styles.css',
                        language: 'css',
                        changes: [{
                                type: 'add',
                                line: 1,
                                content: `@media (max-width: 768px) {
  {{selector}} {
    width: 100%;
    max-width: 100%;
    padding: 1rem;
    box-sizing: border-box;
  }
}

@media (max-width: 480px) {
  {{selector}} {
    font-size: 0.875rem;
    padding: 0.75rem;
  }
}`
                            }]
                    }]
            }
        });
        this.templates.set('text-overflow', {
            description: 'Handle text overflow gracefully',
            solutions: [
                'Use text-overflow: ellipsis for truncation',
                'Apply word-break for long words',
                'Use clamp() for responsive typography',
                'Consider line-clamp for multi-line truncation'
            ],
            defaultFix: {
                description: 'Fix text overflow with proper truncation',
                confidence: 0.85,
                files: [{
                        path: 'styles.css',
                        language: 'css',
                        changes: [{
                                type: 'add',
                                line: 1,
                                content: `{{selector}} {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* For multi-line truncation */
{{selector}}.multiline {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
}`
                            }]
                    }]
            }
        });
        this.templates.set('button-overflow', {
            description: 'Fix button text overflow and sizing',
            solutions: [
                'Use min-width with padding for consistent sizing',
                'Apply responsive font sizes',
                'Consider icon + tooltip for long labels',
                'Use flexible button widths'
            ],
            defaultFix: {
                description: 'Fix button overflow with flexible sizing',
                confidence: 0.8,
                files: [{
                        path: 'styles.css',
                        language: 'css',
                        changes: [{
                                type: 'add',
                                line: 1,
                                content: `{{selector}} {
  min-width: 120px;
  padding: 0.5rem 1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: clamp(0.875rem, 2vw, 1rem);
}

@media (max-width: 480px) {
  {{selector}} {
    min-width: 80px;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
  }
}`
                            }]
                    }]
            }
        });
        this.templates.set('color-contrast', {
            description: 'Fix color contrast for accessibility',
            solutions: [
                'Ensure WCAG AA compliance (4.5:1 for normal text)',
                'Use WCAG AAA for important text (7:1)',
                'Consider color blind friendly palettes',
                'Add text shadows or outlines for better readability'
            ],
            defaultFix: {
                description: 'Improve color contrast for accessibility',
                confidence: 0.9,
                files: [{
                        path: 'styles.css',
                        language: 'css',
                        changes: [{
                                type: 'add',
                                line: 1,
                                content: `{{selector}} {
  color: #1a1a1a; /* WCAG AAA compliant on white */
  background-color: #ffffff;
}

/* For dark backgrounds */
{{selector}}.dark {
  color: #ffffff;
  background-color: #1a1a1a;
}

/* Improve focus visibility */
{{selector}}:focus {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}`
                            }]
                    }]
            }
        });
        this.templates.set('missing-hover-states', {
            description: 'Add interactive hover states',
            solutions: [
                'Add hover effects for interactive elements',
                'Ensure keyboard focus states match hover',
                'Use transitions for smooth interactions',
                'Consider touch device alternatives'
            ],
            defaultFix: {
                description: 'Add hover and focus states',
                confidence: 0.85,
                files: [{
                        path: 'styles.css',
                        language: 'css',
                        changes: [{
                                type: 'add',
                                line: 1,
                                content: `{{selector}} {
  transition: all 0.2s ease-in-out;
  cursor: pointer;
}

{{selector}}:hover {
  background-color: rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

{{selector}}:focus {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

{{selector}}:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* Touch device support */
@media (hover: none) {
  {{selector}}:active {
    background-color: rgba(0, 0, 0, 0.1);
  }
}`
                            }]
                    }]
            }
        });
        this.templates.set('inconsistent-spacing', {
            description: 'Fix spacing inconsistencies',
            solutions: [
                'Use consistent spacing scale (8px base)',
                'Apply CSS custom properties for spacing',
                'Use CSS Grid gap for consistent gutters',
                'Consider using spacing utilities'
            ],
            defaultFix: {
                description: 'Standardize spacing with consistent values',
                confidence: 0.75,
                files: [{
                        path: 'styles.css',
                        language: 'css',
                        changes: [{
                                type: 'add',
                                line: 1,
                                content: `:root {
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
}

{{selector}} {
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

{{selector}} > * + * {
  margin-top: var(--spacing-md);
}`
                            }]
                    }]
            }
        });
        this.templates.set('broken-alignment', {
            description: 'Fix alignment issues',
            solutions: [
                'Use Flexbox for horizontal/vertical alignment',
                'Apply CSS Grid for complex layouts',
                'Use logical properties for RTL support',
                'Consider baseline alignment for text'
            ],
            defaultFix: {
                description: 'Fix alignment with Flexbox',
                confidence: 0.8,
                files: [{
                        path: 'styles.css',
                        language: 'css',
                        changes: [{
                                type: 'add',
                                line: 1,
                                content: `{{selector}} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

/* Vertical centering */
{{selector}}.center {
  justify-content: center;
}

/* Responsive stacking */
@media (max-width: 768px) {
  {{selector}} {
    flex-direction: column;
    align-items: stretch;
  }
}`
                            }]
                    }]
            }
        });
    }
}
exports.FixTemplates = FixTemplates;
