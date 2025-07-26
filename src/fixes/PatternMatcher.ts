import { VisualIssue } from '../bot/types';
import { CodebaseContext, Pattern } from '../context/types';

/**
 * Finds similar patterns in the codebase to guide fix generation
 */
export class PatternMatcher {
  private patterns: Pattern[] = [];

  /**
   * Find patterns similar to the current issue
   */
  async findSimilarPatterns(
    issue: VisualIssue, 
    context: CodebaseContext
  ): Promise<Pattern[]> {
    const similarPatterns: Pattern[] = [];

    // Look for patterns based on issue type
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

    // Sort by relevance
    return this.rankPatterns(similarPatterns, issue);
  }

  /**
   * Find positioning-related patterns
   */
  private findPositioningPatterns(context: CodebaseContext): Pattern[] {
    const patterns: Pattern[] = [];

    // Common positioning patterns
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

    // Add patterns from context if available
    if (context.patterns) {
      patterns.push(...context.patterns.filter(p => p.type === 'positioning'));
    }

    return patterns;
  }

  /**
   * Find responsive design patterns
   */
  private findResponsivePatterns(
    context: CodebaseContext, 
    viewports: string[]
  ): Pattern[] {
    const patterns: Pattern[] = [];
    
    // Determine breakpoint based on viewport
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

    // Framework-specific patterns
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

  /**
   * Find color/contrast patterns
   */
  private findColorPatterns(context: CodebaseContext): Pattern[] {
    const patterns: Pattern[] = [];

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

  /**
   * Find general patterns by type
   */
  private findGeneralPatterns(context: CodebaseContext, issueType: string): Pattern[] {
    // Return patterns from context that match the issue type
    if (context.patterns) {
      return context.patterns.filter(p => 
        p.usage.toLowerCase().includes(issueType.toLowerCase())
      );
    }
    return [];
  }

  /**
   * Rank patterns by relevance to the issue
   */
  private rankPatterns(patterns: Pattern[], issue: VisualIssue): Pattern[] {
    return patterns
      .map(pattern => ({
        ...pattern,
        score: this.calculateRelevance(pattern, issue)
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5); // Return top 5 most relevant
  }

  /**
   * Calculate pattern relevance score
   */
  private calculateRelevance(pattern: Pattern, issue: VisualIssue): number {
    let score = 0;

    // Type match
    if (pattern.type === issue.type) {
      score += 3;
    }

    // Usage match
    const selector = issue.location.selector?.toLowerCase() || '';
    if (pattern.usage.toLowerCase().includes(selector)) {
      score += 2;
    }

    // Viewport match
    if (issue.affectedViewports.some(vp => 
      pattern.code.toLowerCase().includes(vp) ||
      pattern.description.toLowerCase().includes(vp)
    )) {
      score += 1;
    }

    return score;
  }

  /**
   * Get CSS breakpoint for viewport
   */
  private getBreakpoint(viewport: string): string {
    const breakpoints: Record<string, string> = {
      'mobile': '768px',
      'tablet': '1024px',
      'desktop': '1280px'
    };
    
    return breakpoints[viewport] || '768px';
  }

  /**
   * Update context for better pattern matching
   */
  updateContext(context: CodebaseContext): void {
    if (context.patterns) {
      this.patterns = context.patterns;
    }
  }
}