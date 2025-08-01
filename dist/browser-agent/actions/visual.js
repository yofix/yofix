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
exports.visualTestingActions = void 0;
const core = __importStar(require("@actions/core"));
exports.visualTestingActions = [
    {
        definition: {
            name: 'check_visual_issues',
            description: 'Analyze page for visual issues like overlaps, overflows, alignment problems',
            parameters: {
                screenshot: { type: 'boolean', required: false, description: 'Take screenshots of issues' },
                severity: { type: 'string', required: false, description: 'Minimum severity to report (critical, warning, info)' }
            },
            examples: [
                'check_visual_issues',
                'check_visual_issues screenshot=true severity="warning"'
            ]
        },
        handler: async (params, context) => {
            try {
                const { page, dom } = context;
                const issues = [];
                const analysisResults = await page.evaluate(() => {
                    const issues = [];
                    document.querySelectorAll('*').forEach(element => {
                        const style = window.getComputedStyle(element);
                        if (element.scrollWidth > element.clientWidth && style.overflow === 'hidden') {
                            issues.push({
                                type: 'text-overflow',
                                element: element.tagName,
                                description: `Text overflow detected in ${element.tagName}`,
                                severity: 'warning',
                                bounds: element.getBoundingClientRect()
                            });
                        }
                    });
                    const interactiveElements = document.querySelectorAll('button, a, input, select, textarea');
                    const rects = Array.from(interactiveElements).map(el => ({
                        element: el,
                        rect: el.getBoundingClientRect()
                    }));
                    for (let i = 0; i < rects.length; i++) {
                        for (let j = i + 1; j < rects.length; j++) {
                            const r1 = rects[i].rect;
                            const r2 = rects[j].rect;
                            if (r1.left < r2.right && r1.right > r2.left &&
                                r1.top < r2.bottom && r1.bottom > r2.top) {
                                issues.push({
                                    type: 'element-overlap',
                                    description: `Elements overlapping: ${rects[i].element.tagName} and ${rects[j].element.tagName}`,
                                    severity: 'critical',
                                    bounds: r1
                                });
                            }
                        }
                    }
                    document.querySelectorAll('img').forEach(img => {
                        if (!img.complete || img.naturalWidth === 0) {
                            issues.push({
                                type: 'broken-image',
                                description: `Broken image: ${img.src}`,
                                severity: 'warning',
                                bounds: img.getBoundingClientRect()
                            });
                        }
                    });
                    document.querySelectorAll('*').forEach(element => {
                        const rect = element.getBoundingClientRect();
                        if (rect.right > window.innerWidth && rect.width > 50) {
                            issues.push({
                                type: 'horizontal-overflow',
                                description: `Element extends beyond viewport: ${element.tagName}`,
                                severity: 'critical',
                                bounds: rect
                            });
                        }
                    });
                    return issues;
                });
                const minSeverity = params.severity || 'info';
                const severityOrder = { info: 0, warning: 1, critical: 2 };
                const minLevel = severityOrder[minSeverity] || 0;
                for (const result of analysisResults) {
                    const severityLevel = severityOrder[result.severity] || 0;
                    if (severityLevel >= minLevel) {
                        const issue = {
                            type: result.type,
                            description: result.description,
                            severity: result.severity
                        };
                        if (params.screenshot && result.bounds) {
                            try {
                                const clip = {
                                    x: Math.max(0, result.bounds.x - 10),
                                    y: Math.max(0, result.bounds.y - 10),
                                    width: Math.min(result.bounds.width + 20, page.viewportSize().width),
                                    height: Math.min(result.bounds.height + 20, page.viewportSize().height)
                                };
                                issue.screenshot = await page.screenshot({
                                    clip,
                                    type: 'png'
                                });
                            }
                            catch (e) {
                                core.warning(`Failed to capture issue screenshot: ${e}`);
                            }
                        }
                        issues.push(issue);
                    }
                }
                context.state.memory.set('visual_issues', issues);
                return {
                    success: true,
                    data: {
                        issueCount: issues.length,
                        issues: issues.map(i => ({ type: i.type, severity: i.severity, description: i.description }))
                    },
                    screenshot: params.screenshot ? await page.screenshot({ type: 'png', fullPage: true }) : undefined
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: `Visual check failed: ${error}`
                };
            }
        }
    },
    {
        definition: {
            name: 'test_responsive',
            description: 'Test page responsiveness at different viewport sizes',
            parameters: {
                viewports: {
                    type: 'array',
                    required: false,
                    description: 'Array of viewport sizes to test [{width, height}]'
                }
            },
            examples: [
                'test_responsive',
                'test_responsive viewports=[{"width":375,"height":667},{"width":768,"height":1024}]'
            ]
        },
        handler: async (params, context) => {
            try {
                const { page } = context;
                const defaultViewports = [
                    { width: 375, height: 667, name: 'Mobile' },
                    { width: 768, height: 1024, name: 'Tablet' },
                    { width: 1920, height: 1080, name: 'Desktop' }
                ];
                const viewports = params.viewports || defaultViewports;
                const results = [];
                for (const viewport of viewports) {
                    await page.setViewportSize(viewport);
                    await page.waitForTimeout(500);
                    const issues = await page.evaluate(() => {
                        const problems = [];
                        if (document.documentElement.scrollWidth > window.innerWidth) {
                            problems.push('Horizontal scroll detected');
                        }
                        document.querySelectorAll('p, span, div').forEach(el => {
                            const style = window.getComputedStyle(el);
                            const fontSize = parseFloat(style.fontSize);
                            if (fontSize < 12 && el.textContent && el.textContent.trim().length > 10) {
                                problems.push(`Text too small: ${fontSize}px`);
                            }
                        });
                        return problems;
                    });
                    results.push({
                        viewport,
                        issues,
                        screenshot: await page.screenshot({ type: 'png' })
                    });
                }
                context.state.memory.set('responsive_test_results', results);
                return {
                    success: true,
                    data: {
                        testedViewports: viewports.length,
                        results: results.map(r => ({
                            viewport: r.viewport,
                            issueCount: r.issues.length
                        }))
                    }
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: `Responsive test failed: ${error}`
                };
            }
        }
    },
    {
        definition: {
            name: 'compare_baseline',
            description: 'Compare current page with baseline screenshot',
            parameters: {
                baseline: { type: 'string', required: true, description: 'Path to baseline screenshot in file system' },
                threshold: { type: 'number', required: false, description: 'Difference threshold (0-1)' }
            },
            examples: [
                'compare_baseline baseline="/screenshots/homepage-baseline.png"',
                'compare_baseline baseline="/baseline/login.png" threshold=0.1'
            ]
        },
        handler: async (params, context) => {
            try {
                const { page, state } = context;
                const baselineData = state.fileSystem.get(params.baseline);
                if (!baselineData) {
                    return {
                        success: false,
                        error: `Baseline not found: ${params.baseline}`
                    };
                }
                const currentScreenshot = await page.screenshot({ type: 'png', fullPage: true });
                const threshold = params.threshold || 0.05;
                const sizeDiff = Math.abs(currentScreenshot.length - baselineData.length) / baselineData.length;
                const hasSignificantChange = sizeDiff > threshold;
                return {
                    success: true,
                    data: {
                        different: hasSignificantChange,
                        sizeDifference: sizeDiff,
                        threshold
                    },
                    screenshot: currentScreenshot
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: `Baseline comparison failed: ${error}`
                };
            }
        }
    },
    {
        definition: {
            name: 'generate_visual_fix',
            description: 'Generate code fix for detected visual issue',
            parameters: {
                issueIndex: { type: 'number', required: true, description: 'Index of issue from check_visual_issues' },
                framework: { type: 'string', required: false, description: 'Frontend framework (react, vue, etc)' }
            },
            examples: [
                'generate_visual_fix issueIndex=0',
                'generate_visual_fix issueIndex=1 framework="react"'
            ]
        },
        handler: async (params, context) => {
            try {
                const { state } = context;
                const issues = state.memory.get('visual_issues');
                if (!issues || issues.length <= params.issueIndex) {
                    return {
                        success: false,
                        error: `No issue found at index ${params.issueIndex}`
                    };
                }
                const issue = issues[params.issueIndex];
                const framework = params.framework || 'generic';
                let fix = '';
                let explanation = '';
                switch (issue.type) {
                    case 'text-overflow':
                        fix = `// Add CSS to handle text overflow
.overflowing-element {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// Or for multiline:
.multiline-overflow {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}`;
                        explanation = 'Use text-overflow: ellipsis for single lines or line-clamp for multiline text';
                        break;
                    case 'element-overlap':
                        fix = `// Fix overlapping elements
.container {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

// Or use grid:
.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}`;
                        explanation = 'Use flexbox or grid layout to prevent element overlap';
                        break;
                    case 'horizontal-overflow':
                        fix = `// Prevent horizontal overflow
.container {
  max-width: 100%;
  overflow-x: auto;
}

// Or make content responsive:
.responsive-element {
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
}`;
                        explanation = 'Constrain width to viewport and add horizontal scroll if needed';
                        break;
                    case 'broken-image':
                        fix = `// Handle broken images
img {
  display: block;
  max-width: 100%;
  height: auto;
}

img:not([src]), img[src=""] {
  visibility: hidden;
}

// React component with error handling:
const SafeImage = ({ src, alt, fallback }) => {
  const [error, setError] = useState(false);
  
  if (error) {
    return <img src={fallback} alt={alt} />;
  }
  
  return <img src={src} alt={alt} onError={() => setError(true)} />;
};`;
                        explanation = 'Add error handling for images with fallback options';
                        break;
                }
                const fixPath = `/fixes/issue-${params.issueIndex}-fix.${framework === 'react' ? 'jsx' : 'css'}`;
                state.fileSystem.set(fixPath, fix);
                return {
                    success: true,
                    data: {
                        issue: issue.type,
                        framework,
                        fixPath,
                        explanation
                    },
                    extractedContent: fix
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: `Fix generation failed: ${error}`
                };
            }
        }
    }
];
