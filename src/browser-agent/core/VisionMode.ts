import { Page } from 'playwright';
import { DOMElement, IndexedDOM, BoundingBox } from '../types';
import * as core from '@actions/core';
import sharp from 'sharp';

export interface AnnotatedScreenshot {
  base64: string;
  elements: Map<number, ElementAnnotation>;
  width: number;
  height: number;
}

export interface ElementAnnotation {
  index: number;
  element: DOMElement;
  boundingBox: BoundingBox;
  label: string;
}

export class VisionMode {
  private page: Page;
  private annotationCache: Map<string, AnnotatedScreenshot>;
  
  constructor(page: Page) {
    this.page = page;
    this.annotationCache = new Map();
  }
  
  /**
   * Take a screenshot with numbered element overlays
   * This is the core of vision mode - visual elements are tagged with numbers
   */
  async captureAnnotatedScreenshot(dom: IndexedDOM): Promise<AnnotatedScreenshot> {
    const cacheKey = `${dom.url}_${dom.elements.size}`;
    
    // Check cache
    if (this.annotationCache.has(cacheKey)) {
      core.debug('Using cached annotated screenshot');
      return this.annotationCache.get(cacheKey)!;
    }
    
    core.debug('Creating annotated screenshot...');
    const startTime = Date.now();
    
    // Take base screenshot
    const screenshotBuffer = await this.page.screenshot({ 
      fullPage: false,
      type: 'png'
    });
    
    // Get viewport for coordinate mapping
    const viewport = this.page.viewportSize() || { width: 1280, height: 720 };
    
    // Filter interactive elements in viewport
    const visibleElements = new Map<number, ElementAnnotation>();
    let elementIndex = 0;
    
    for (const [id, element] of dom.elements) {
      if (element.isInteractive && element.isVisible && element.isInViewport) {
        const annotation: ElementAnnotation = {
          index: elementIndex,
          element,
          boundingBox: element.boundingBox!,
          label: this.getElementLabel(element)
        };
        visibleElements.set(elementIndex, annotation);
        elementIndex++;
      }
    }
    
    // Inject visual overlays using JavaScript
    await this.injectVisualOverlays(visibleElements);
    
    // Take screenshot with overlays
    const annotatedBuffer = await this.page.screenshot({ 
      fullPage: false,
      type: 'png'
    });
    
    // Remove overlays
    await this.removeVisualOverlays();
    
    const result: AnnotatedScreenshot = {
      base64: annotatedBuffer.toString('base64'),
      elements: visibleElements,
      width: viewport.width,
      height: viewport.height
    };
    
    // Cache result
    this.annotationCache.set(cacheKey, result);
    
    core.debug(`Annotated screenshot created in ${Date.now() - startTime}ms with ${visibleElements.size} elements`);
    
    return result;
  }
  
  /**
   * Inject numbered overlays on interactive elements
   */
  private async injectVisualOverlays(elements: Map<number, ElementAnnotation>): Promise<void> {
    await this.page.evaluate((elementsData) => {
      // Remove any existing overlays
      document.querySelectorAll('.yofix-vision-overlay').forEach(el => el.remove());
      
      // Create style if not exists
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
      
      // Create overlays for each element
      elementsData.forEach(([index, data]) => {
        const overlay = document.createElement('div');
        overlay.className = 'yofix-vision-overlay';
        overlay.setAttribute('data-yofix-index', String(index));
        
        // Position overlay
        overlay.style.left = `${data.boundingBox.x}px`;
        overlay.style.top = `${data.boundingBox.y}px`;
        overlay.style.width = `${data.boundingBox.width}px`;
        overlay.style.height = `${data.boundingBox.height}px`;
        
        // Add number label
        const number = document.createElement('div');
        number.className = 'yofix-vision-number';
        number.textContent = String(index);
        overlay.appendChild(number);
        
        document.body.appendChild(overlay);
      });
    }, Array.from(elements.entries()));
  }
  
  /**
   * Remove visual overlays
   */
  private async removeVisualOverlays(): Promise<void> {
    await this.page.evaluate(() => {
      document.querySelectorAll('.yofix-vision-overlay').forEach(el => el.remove());
    });
  }
  
  /**
   * Get a descriptive label for an element
   */
  private getElementLabel(element: DOMElement): string {
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
    
    // Generate label based on element type
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
  
  /**
   * Generate a vision context prompt for LLM
   * This is what the AI "sees" - a screenshot with numbered elements
   */
  generateVisionPrompt(screenshot: AnnotatedScreenshot, task: string): string {
    const elementDescriptions: string[] = [];
    
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
  
  /**
   * Find element by number from vision annotation
   */
  getElementByVisionIndex(screenshot: AnnotatedScreenshot, index: number): DOMElement | undefined {
    const annotation = screenshot.elements.get(index);
    return annotation?.element;
  }
  
  /**
   * Clear cache when page changes significantly
   */
  clearCache(): void {
    this.annotationCache.clear();
  }
}