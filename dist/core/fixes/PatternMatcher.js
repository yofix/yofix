"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternMatcher = void 0;
class PatternMatcher {
    constructor() {
        this.patterns = [];
    }
    async findSimilarPatterns(issue, context) {
        const similarPatterns = [];
        switch (issue.type) {
            case 'layout-shift':
            case 'element-overlap':
                similarPatterns.push(...this.findPositioningPatterns(context));
                break;
            case 'responsive-breakage':
            case 'text-overflow':
                similarPatterns.push(...this.findResponsivePatterns(context, issue.affectedViewports));
                break;
            case 'color-contrast':
                similarPatterns.push(...this.findColorPatterns(context));
                break;
            default:
                similarPatterns.push(...this.findGeneralPatterns(context, issue.type));
        }
        return this.rankPatterns(similarPatterns, issue);
    }
    findPositioningPatterns(context) {
        const patterns = [];
        patterns.push({
            id: 'fixed-header',
            type: 'positioning',
            description: 'Fixed header with z-index management',
            code: `position: fixed;
top: 0;
left: 0;
right: 0;
z-index: 1000;`,
            usage: 'header, navigation'
        });
        patterns.push({
            id: 'sticky-sidebar',
            type: 'positioning',
            description: 'Sticky sidebar pattern',
            code: `position: sticky;
top: 20px;
height: fit-content;`,
            usage: 'sidebar, navigation'
        });
        patterns.push({
            id: 'modal-overlay',
            type: 'positioning',
            description: 'Modal with proper z-index layering',
            code: `position: fixed;
inset: 0;
z-index: 9999;
display: flex;
align-items: center;
justify-content: center;`,
            usage: 'modal, overlay'
        });
        if (context.patterns) {
            patterns.push(...context.patterns.filter(p => p.type === 'positioning'));
        }
        return patterns;
    }
    findResponsivePatterns(context, viewports) {
        const patterns = [];
        const breakpoint = this.getBreakpoint(viewports[0]);
        patterns.push({
            id: 'mobile-menu',
            type: 'responsive',
            description: 'Mobile menu transformation',
            code: `@media (max-width: ${breakpoint}) {
  .nav-menu {
    position: fixed;
    left: -100%;
    transition: left 0.3s ease;
  }
  .nav-menu.open {
    left: 0;
  }
}`,
            usage: 'navigation, mobile'
        });
        patterns.push({
            id: 'text-truncation',
            type: 'responsive',
            description: 'Responsive text truncation',
            code: `white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
max-width: 100%;`,
            usage: 'text, buttons'
        });
        patterns.push({
            id: 'flexible-grid',
            type: 'responsive',
            description: 'Responsive grid layout',
            code: `display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
gap: 1rem;`,
            usage: 'grid, cards'
        });
        if (context.styleSystem === 'tailwind') {
            patterns.push({
                id: 'tailwind-responsive',
                type: 'responsive',
                description: 'Tailwind responsive utilities',
                code: `class="hidden md:block lg:flex"`,
                usage: 'tailwind classes'
            });
        }
        return patterns;
    }
    findColorPatterns(context) {
        const patterns = [];
        patterns.push({
            id: 'wcag-contrast',
            type: 'color',
            description: 'WCAG AAA compliant text colors',
            code: `color: #1a1a1a; /* 15.3:1 contrast on white */
background-color: #ffffff;`,
            usage: 'text, accessibility'
        });
        patterns.push({
            id: 'hover-states',
            type: 'color',
            description: 'Accessible hover states',
            code: `:hover {
  background-color: rgba(0, 0, 0, 0.1);
  outline: 2px solid currentColor;
  outline-offset: 2px;
}`,
            usage: 'buttons, links'
        });
        return patterns;
    }
    findGeneralPatterns(context, issueType) {
        if (context.patterns) {
            return context.patterns.filter(p => p.usage.toLowerCase().includes(issueType.toLowerCase()));
        }
        return [];
    }
    rankPatterns(patterns, issue) {
        return patterns
            .map(pattern => ({
            ...pattern,
            score: this.calculateRelevance(pattern, issue)
        }))
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 5);
    }
    calculateRelevance(pattern, issue) {
        let score = 0;
        if (pattern.type === issue.type) {
            score += 3;
        }
        const selector = issue.location.selector?.toLowerCase() || '';
        if (pattern.usage.toLowerCase().includes(selector)) {
            score += 2;
        }
        if (issue.affectedViewports.some(vp => pattern.code.toLowerCase().includes(vp) ||
            pattern.description.toLowerCase().includes(vp))) {
            score += 1;
        }
        return score;
    }
    getBreakpoint(viewport) {
        const breakpoints = {
            'mobile': '768px',
            'tablet': '1024px',
            'desktop': '1280px'
        };
        return breakpoints[viewport] || '768px';
    }
    updateContext(context) {
        if (context.patterns) {
            this.patterns = context.patterns;
        }
    }
}
exports.PatternMatcher = PatternMatcher;
