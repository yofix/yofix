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
exports.TestGenerator = void 0;
const core = __importStar(require("@actions/core"));
class TestGenerator {
    constructor(firebaseConfig, viewports) {
        this.firebaseConfig = firebaseConfig;
        this.viewports = viewports;
    }
    generateTests(analysis) {
        core.info('Generating React SPA tests based on route analysis...');
        const tests = [];
        tests.push(this.createSPALoadingTest());
        if (analysis.components.length > 0) {
            tests.push(...this.createComponentTests(analysis.components));
        }
        if (analysis.routes.length > 0) {
            tests.push(...this.createRouteTests(analysis.routes));
        }
        const formComponents = analysis.components.filter(comp => comp.toLowerCase().includes('form') ||
            comp.toLowerCase().includes('input') ||
            comp.toLowerCase().includes('login') ||
            comp.toLowerCase().includes('signup'));
        if (formComponents.length > 0) {
            tests.push(...this.createFormTests(formComponents));
        }
        if (analysis.hasUIChanges) {
            tests.push(this.createResponsiveTest());
        }
        if (analysis.riskLevel === 'high') {
            tests.push(this.createErrorBoundaryTest());
        }
        core.info(`Generated ${tests.length} tests for React SPA verification`);
        return tests;
    }
    createSPALoadingTest() {
        const actions = [
            { type: 'goto', target: this.firebaseConfig.previewUrl, timeout: 30000 },
            { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 }
        ];
        const assertions = [
            { type: 'visible', target: this.getSPAReadySelector(), timeout: 10000 },
            { type: 'text', target: 'title', expected: 'should contain app name' }
        ];
        return {
            id: 'spa-loading',
            name: 'React SPA Loading and Hydration',
            type: 'component',
            selector: this.getSPAReadySelector(),
            actions,
            assertions,
            viewport: this.viewports[0]
        };
    }
    createComponentTests(components) {
        return components.slice(0, 5).map((component, index) => {
            const selector = this.generateComponentSelector(component);
            const actions = [
                { type: 'goto', target: this.firebaseConfig.previewUrl, timeout: 30000 },
                { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 }
            ];
            const assertions = [
                { type: 'visible', target: selector, timeout: 10000 }
            ];
            if (this.isInteractiveComponent(component)) {
                actions.push({ type: 'click', target: selector, timeout: 5000 });
                assertions.push({
                    type: 'visible',
                    target: `${selector}:not([disabled])`,
                    timeout: 5000
                });
            }
            return {
                id: `component-${component.toLowerCase()}`,
                name: `${component} Component Verification`,
                type: 'component',
                selector,
                actions,
                assertions,
                viewport: this.viewports[index % this.viewports.length]
            };
        });
    }
    createRouteTests(routes) {
        return routes.slice(0, 5).map((route, index) => {
            const fullUrl = this.firebaseConfig.previewUrl + (route.startsWith('/') ? route : `/${route}`);
            const actions = [
                { type: 'goto', target: fullUrl, timeout: 30000 },
                { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 }
            ];
            const assertions = [
                { type: 'url', target: route, timeout: 10000 },
                { type: 'visible', target: this.getSPAReadySelector(), timeout: 10000 }
            ];
            if (route === '/' || route === '/home') {
                assertions.push({
                    type: 'visible',
                    target: 'main, [role="main"], .main-content',
                    timeout: 5000
                });
            }
            return {
                id: `route-${route.replace(/[^a-zA-Z0-9]/g, '-')}`,
                name: `Route Navigation: ${route}`,
                type: 'route',
                selector: this.getSPAReadySelector(),
                actions,
                assertions,
                viewport: this.viewports[index % this.viewports.length]
            };
        });
    }
    createFormTests(formComponents) {
        return formComponents.slice(0, 3).map(component => {
            const formSelector = this.generateFormSelector(component);
            const actions = [
                { type: 'goto', target: this.firebaseConfig.previewUrl, timeout: 30000 },
                { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 },
                { type: 'wait', target: formSelector, timeout: 10000 }
            ];
            const assertions = [
                { type: 'visible', target: formSelector, timeout: 10000 }
            ];
            if (component.toLowerCase().includes('login')) {
                actions.push({ type: 'fill', target: 'input[type="email"], input[name*="email"]', value: 'test@example.com', timeout: 5000 }, { type: 'fill', target: 'input[type="password"], input[name*="password"]', value: 'testpassword', timeout: 5000 });
                assertions.push({
                    type: 'visible',
                    target: 'button[type="submit"], button:has-text("Login"), button:has-text("Sign In")',
                    timeout: 5000
                });
            }
            return {
                id: `form-${component.toLowerCase()}`,
                name: `${component} Form Interaction`,
                type: 'form',
                selector: formSelector,
                actions,
                assertions,
                viewport: this.viewports[0]
            };
        });
    }
    createResponsiveTest() {
        const actions = [
            { type: 'goto', target: this.firebaseConfig.previewUrl, timeout: 30000 },
            { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 }
        ];
        const assertions = [
            { type: 'visible', target: this.getSPAReadySelector(), timeout: 10000 }
        ];
        return {
            id: 'responsive-design',
            name: 'Responsive Design Verification',
            type: 'interaction',
            selector: 'body',
            actions,
            assertions,
            viewport: this.viewports.find(v => v.width <= 768) || this.viewports[1]
        };
    }
    createErrorBoundaryTest() {
        const actions = [
            { type: 'goto', target: this.firebaseConfig.previewUrl, timeout: 30000 },
            { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 }
        ];
        const assertions = [
            { type: 'visible', target: this.getSPAReadySelector(), timeout: 10000 },
            { type: 'hidden', target: '[data-testid="error-boundary"], .error-boundary, .error-fallback', timeout: 5000 }
        ];
        return {
            id: 'error-boundary',
            name: 'Error Boundary and Crash Prevention',
            type: 'component',
            selector: 'body',
            actions,
            assertions,
            viewport: this.viewports[0]
        };
    }
    generateComponentSelector(component) {
        const kebabCase = component.replace(/([A-Z])/g, '-$1').toLowerCase().substring(1);
        const selectors = [
            `[data-testid="${kebabCase}"]`,
            `[data-testid="${component.toLowerCase()}"]`,
            `.${kebabCase}`,
            `.${component.toLowerCase()}`,
            `[class*="${kebabCase}"]`,
            `[class*="${component.toLowerCase()}"]`
        ];
        return selectors.join(', ');
    }
    generateFormSelector(component) {
        const kebabCase = component.replace(/([A-Z])/g, '-$1').toLowerCase().substring(1);
        return [
            `form[data-testid="${kebabCase}"]`,
            `form.${kebabCase}`,
            `[data-testid="${kebabCase}"] form`,
            `.${kebabCase} form`,
            'form'
        ].join(', ');
    }
    getSPAReadySelector() {
        if (this.firebaseConfig.buildSystem === 'vite') {
            return '#root:not(:empty), #app:not(:empty), [data-reactroot], .App';
        }
        else {
            return '#root:not(:empty), #app:not(:empty), [data-reactroot]';
        }
    }
    isInteractiveComponent(component) {
        const interactiveKeywords = [
            'button', 'input', 'select', 'form', 'link', 'tab', 'menu',
            'modal', 'dialog', 'dropdown', 'toggle', 'switch', 'slider'
        ];
        return interactiveKeywords.some(keyword => component.toLowerCase().includes(keyword));
    }
    static parseViewports(viewportsInput) {
        const defaultViewports = [
            { width: 1920, height: 1080, name: 'Desktop' },
            { width: 768, height: 1024, name: 'Tablet' },
            { width: 375, height: 667, name: 'Mobile' }
        ];
        if (!viewportsInput) {
            return defaultViewports;
        }
        try {
            const viewports = viewportsInput.split(',').map(viewport => {
                const [dimensions, name] = viewport.split(':');
                const [width, height] = dimensions.split('x').map(Number);
                return {
                    width,
                    height,
                    name: name || `${width}x${height}`
                };
            });
            return viewports.length > 0 ? viewports : defaultViewports;
        }
        catch (error) {
            core.warning(`Failed to parse viewports "${viewportsInput}". Using defaults.`);
            return defaultViewports;
        }
    }
}
exports.TestGenerator = TestGenerator;
