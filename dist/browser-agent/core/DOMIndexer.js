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
exports.DOMIndexer = void 0;
const core = __importStar(require("@actions/core"));
class DOMIndexer {
    constructor() {
        this.interactiveSelectors = [
            'a', 'button', 'input', 'select', 'textarea',
            '[role="button"]', '[role="link"]', '[role="checkbox"]',
            '[role="radio"]', '[role="switch"]', '[onclick]',
            '[contenteditable="true"]', 'summary'
        ];
    }
    async indexPage(page) {
        core.debug('Indexing page DOM elements...');
        const startTime = Date.now();
        const indexedData = await page.evaluate(this.getIndexingScript());
        const viewport = page.viewportSize() || { width: 1920, height: 1080 };
        const url = page.url();
        const title = await page.title();
        const elements = new Map();
        const interactiveElements = [];
        indexedData.elements.forEach((elem) => {
            const element = {
                id: elem.id,
                index: elem.index,
                xpath: elem.xpath,
                selector: elem.selector,
                tag: elem.tag,
                text: elem.text,
                attributes: elem.attributes,
                isInteractive: elem.isInteractive,
                isVisible: elem.isVisible,
                isInViewport: elem.isInViewport,
                boundingBox: elem.boundingBox,
                children: elem.children,
                parent: elem.parent
            };
            elements.set(element.id, element);
            if (element.isInteractive && element.isVisible) {
                interactiveElements.push(element.id);
            }
        });
        let screenshot;
        try {
            screenshot = await page.screenshot({
                fullPage: false,
                type: 'png'
            });
        }
        catch (error) {
            core.warning(`Failed to take screenshot: ${error}`);
        }
        const duration = Date.now() - startTime;
        core.debug(`DOM indexing completed in ${duration}ms. Found ${elements.size} elements, ${interactiveElements.length} interactive.`);
        return {
            elements,
            interactiveElements,
            screenshot,
            viewport,
            url,
            title
        };
    }
    getIndexingScript() {
        return `
      (() => {
        const elements = [];
        const elementMap = new Map();
        let index = 0;
        
        // Helper to get xpath
        function getXPath(element) {
          if (element.id) {
            return '//*[@id="' + element.id + '"]';
          }
          
          const paths = [];
          for (; element && element.nodeType === 1; element = element.parentNode) {
            let index = 0;
            for (let sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
              if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                index++;
              }
            }
            const tagName = element.tagName.toLowerCase();
            const pathIndex = index ? '[' + (index + 1) + ']' : '';
            paths.unshift(tagName + pathIndex);
          }
          return paths.length ? '/' + paths.join('/') : null;
        }
        
        // Helper to get best selector
        function getBestSelector(element) {
          if (element.id) {
            return '#' + element.id;
          }
          
          const classes = Array.from(element.classList).filter(c => c && !c.includes(':'));
          if (classes.length > 0) {
            return element.tagName.toLowerCase() + '.' + classes.join('.');
          }
          
          return element.tagName.toLowerCase();
        }
        
        // Helper to check if element is interactive
        function isInteractive(element) {
          const tag = element.tagName.toLowerCase();
          const role = element.getAttribute('role');
          
          return ${JSON.stringify(this.interactiveSelectors)}.some(selector => {
            return element.matches(selector);
          }) || element.onclick !== null || element.style.cursor === 'pointer';
        }
        
        // Helper to check visibility
        function isVisible(element) {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          
          return rect.width > 0 && 
                 rect.height > 0 && 
                 style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0';
        }
        
        // Helper to check if in viewport
        function isInViewport(element) {
          const rect = element.getBoundingClientRect();
          const viewport = {
            width: window.innerWidth || document.documentElement.clientWidth,
            height: window.innerHeight || document.documentElement.clientHeight
          };
          
          return rect.top < viewport.height && 
                 rect.bottom > 0 && 
                 rect.left < viewport.width && 
                 rect.right > 0;
        }
        
        // Traverse DOM and index elements
        function traverseDOM(element, parentId = null) {
          if (element.nodeType !== 1) return;
          
          const id = 'elem_' + index;
          const rect = element.getBoundingClientRect();
          
          const elemData = {
            id: id,
            index: index,
            xpath: getXPath(element),
            selector: getBestSelector(element),
            tag: element.tagName.toLowerCase(),
            text: element.textContent?.trim().substring(0, 100),
            attributes: {},
            isInteractive: isInteractive(element),
            isVisible: isVisible(element),
            isInViewport: isInViewport(element),
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            children: [],
            parent: parentId
          };
          
          // Get relevant attributes
          ['href', 'src', 'alt', 'title', 'placeholder', 'value', 'type', 'name', 'role', 'aria-label'].forEach(attr => {
            if (element.hasAttribute(attr)) {
              elemData.attributes[attr] = element.getAttribute(attr);
            }
          });
          
          elements.push(elemData);
          elementMap.set(element, id);
          
          // Index children
          for (const child of element.children) {
            const childId = traverseDOM(child, id);
            if (childId) {
              elemData.children.push(childId);
            }
          }
          
          index++;
          return id;
        }
        
        // Start traversal from body
        traverseDOM(document.body);
        
        // Add numeric indices to interactive elements for easy reference
        let interactiveIndex = 0;
        elements.forEach(elem => {
          if (elem.isInteractive && elem.isVisible && elem.isInViewport) {
            elem.index = interactiveIndex++;
          }
        });
        
        return { elements };
      })();
    `;
    }
    async highlightElement(page, elementId, duration = 2000) {
        await page.evaluate(({ id, duration }) => {
            const xpath = document.evaluate(`//*[@data-yofix-id="${id}"]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (xpath) {
                const originalStyle = xpath.style.cssText;
                xpath.style.cssText += 'outline: 3px solid red !important; outline-offset: 2px !important;';
                setTimeout(() => {
                    xpath.style.cssText = originalStyle;
                }, duration);
            }
        }, { id: elementId, duration });
    }
    getElementByIndex(dom, index) {
        for (const [id, element] of dom.elements) {
            if (element.index === index && element.isInteractive) {
                return element;
            }
        }
        return undefined;
    }
    findElementsByText(dom, text, fuzzy = true) {
        const results = [];
        const searchText = text.toLowerCase();
        for (const [id, element] of dom.elements) {
            const elementText = element.text?.toLowerCase() || '';
            const placeholderText = element.attributes.placeholder?.toLowerCase() || '';
            const ariaLabel = element.attributes['aria-label']?.toLowerCase() || '';
            if (fuzzy) {
                if (elementText.includes(searchText) ||
                    placeholderText.includes(searchText) ||
                    ariaLabel.includes(searchText)) {
                    results.push(element);
                }
            }
            else {
                if (elementText === searchText ||
                    placeholderText === searchText ||
                    ariaLabel === searchText) {
                    results.push(element);
                }
            }
        }
        return results;
    }
    getInteractiveSummary(dom) {
        const summary = [];
        dom.interactiveElements.forEach(id => {
            const element = dom.elements.get(id);
            if (!element)
                return;
            const desc = this.describeElement(element);
            if (desc) {
                summary.push(`[${element.index}] ${desc}`);
            }
        });
        return summary.join('\n');
    }
    describeElement(element) {
        const parts = [];
        if (element.tag === 'a') {
            parts.push('Link');
        }
        else if (element.tag === 'button' || element.attributes.role === 'button') {
            parts.push('Button');
        }
        else if (element.tag === 'input') {
            const type = element.attributes.type || 'text';
            parts.push(`Input[${type}]`);
        }
        else if (element.tag === 'select') {
            parts.push('Dropdown');
        }
        else if (element.tag === 'textarea') {
            parts.push('Textarea');
        }
        else {
            parts.push(element.tag.toUpperCase());
        }
        if (element.text && element.text.length < 50) {
            parts.push(`"${element.text}"`);
        }
        else if (element.attributes['aria-label']) {
            parts.push(`"${element.attributes['aria-label']}"`);
        }
        else if (element.attributes.placeholder) {
            parts.push(`placeholder="${element.attributes.placeholder}"`);
        }
        else if (element.attributes.title) {
            parts.push(`"${element.attributes.title}"`);
        }
        if (element.attributes.href) {
            parts.push(`→ ${element.attributes.href}`);
        }
        return parts.join(' ');
    }
}
exports.DOMIndexer = DOMIndexer;
