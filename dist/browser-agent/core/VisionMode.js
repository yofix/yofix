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
exports.VisionMode = void 0;
const core = __importStar(require("@actions/core"));
class VisionMode {
    constructor(page) {
        this.page = page;
        this.annotationCache = new Map();
    }
    async captureAnnotatedScreenshot(dom) {
        const cacheKey = `${dom.url}_${dom.elements.size}`;
        if (this.annotationCache.has(cacheKey)) {
            core.debug('Using cached annotated screenshot');
            return this.annotationCache.get(cacheKey);
        }
        core.debug('Creating annotated screenshot...');
        const startTime = Date.now();
        const screenshotBuffer = await this.page.screenshot({
            fullPage: false,
            type: 'png'
        });
        const viewport = this.page.viewportSize() || { width: 1280, height: 720 };
        const visibleElements = new Map();
        let elementIndex = 0;
        for (const [id, element] of dom.elements) {
            if (element.isInteractive && element.isVisible && element.isInViewport) {
                const annotation = {
                    index: elementIndex,
                    element,
                    boundingBox: element.boundingBox,
                    label: this.getElementLabel(element)
                };
                visibleElements.set(elementIndex, annotation);
                elementIndex++;
            }
        }
        await this.injectVisualOverlays(visibleElements);
        const annotatedBuffer = await this.page.screenshot({
            fullPage: false,
            type: 'png'
        });
        await this.removeVisualOverlays();
        const result = {
            base64: annotatedBuffer.toString('base64'),
            elements: visibleElements,
            width: viewport.width,
            height: viewport.height
        };
        this.annotationCache.set(cacheKey, result);
        core.debug(`Annotated screenshot created in ${Date.now() - startTime}ms with ${visibleElements.size} elements`);
        return result;
    }
    async injectVisualOverlays(elements) {
        await this.page.evaluate((elementsData) => {
            document.querySelectorAll('.yofix-vision-overlay').forEach(el => el.remove());
            if (!document.getElementById('yofix-vision-style')) {
                const style = document.createElement('style');
                style.id = 'yofix-vision-style';
                style.textContent = `
          .yofix-vision-overlay {
            position: absolute;
            background: rgba(255, 0, 0, 0.3);
            border: 2px solid red;
            color: white;
            font-size: 14px;
            font-weight: bold;
            font-family: monospace;
            padding: 2px 6px;
            border-radius: 3px;
            z-index: 10000;
            pointer-events: none;
            min-width: 20px;
            text-align: center;
          }
          .yofix-vision-number {
            position: absolute;
            top: -20px;
            left: -2px;
            background: red;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 12px;
          }
        `;
                document.head.appendChild(style);
            }
            elementsData.forEach(([index, data]) => {
                const overlay = document.createElement('div');
                overlay.className = 'yofix-vision-overlay';
                overlay.setAttribute('data-yofix-index', String(index));
                overlay.style.left = `${data.boundingBox.x}px`;
                overlay.style.top = `${data.boundingBox.y}px`;
                overlay.style.width = `${data.boundingBox.width}px`;
                overlay.style.height = `${data.boundingBox.height}px`;
                const number = document.createElement('div');
                number.className = 'yofix-vision-number';
                number.textContent = String(index);
                overlay.appendChild(number);
                document.body.appendChild(overlay);
            });
        }, Array.from(elements.entries()));
    }
    async removeVisualOverlays() {
        await this.page.evaluate(() => {
            document.querySelectorAll('.yofix-vision-overlay').forEach(el => el.remove());
        });
    }
    getElementLabel(element) {
        if (element.text && element.text.length < 30) {
            return element.text;
        }
        if (element.attributes['aria-label']) {
            return element.attributes['aria-label'];
        }
        if (element.attributes.placeholder) {
            return element.attributes.placeholder;
        }
        if (element.attributes.title) {
            return element.attributes.title;
        }
        switch (element.tag) {
            case 'a':
                return 'Link';
            case 'button':
                return 'Button';
            case 'input':
                return `Input[${element.attributes.type || 'text'}]`;
            case 'select':
                return 'Dropdown';
            default:
                return element.tag.toUpperCase();
        }
    }
    generateVisionPrompt(screenshot, task) {
        const elementDescriptions = [];
        screenshot.elements.forEach((annotation, index) => {
            const elem = annotation.element;
            const desc = `[${index}] ${annotation.label} at (${Math.round(annotation.boundingBox.x)}, ${Math.round(annotation.boundingBox.y)})`;
            elementDescriptions.push(desc);
        });
        return `Task: ${task}

I can see a webpage with ${screenshot.elements.size} interactive elements marked with red numbers.

Elements:
${elementDescriptions.join('\n')}

The screenshot shows these numbered elements overlaid on the page. To interact with an element, use its number.

What actions should I take? Respond with specific element numbers.`;
    }
    getElementByVisionIndex(screenshot, index) {
        const annotation = screenshot.elements.get(index);
        return annotation?.element;
    }
    clearCache() {
        this.annotationCache.clear();
    }
}
exports.VisionMode = VisionMode;
