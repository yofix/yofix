// Enhanced XPath-focused ContextAwareElementFinder approach

interface XPathEnhancedElement {
  element: DOMElement;
  xpath: {
    full: string;          // Complete XPath
    simplified: string;    // Shortened for LLM context
    semantic: string;      // Human-readable description
    reliability: number;   // How reliable this XPath is (1-100)
  };
  context: {
    text: string;
    position: string;
    styling: string;
    neighbors: string[];
    formContext: string;
    hierarchy: string;
  };
}

class EnhancedXPathElementFinder {
  
  /**
   * Build clickable elements with optimized XPath information
   */
  private buildClickableElementsWithXPath(dom: IndexedDOM): XPathEnhancedElement[] {
    const elements = Array.from(dom.elements.values())
      .filter(e => e.isVisible && e.isInteractive);
    
    return elements.map(element => ({
      element,
      xpath: this.buildOptimizedXPath(element, dom),
      context: {
        text: `"${element.text || ''}" (aria: "${element.attributes['aria-label'] || ''}")`,
        position: `${element.boundingBox.x},${element.boundingBox.y} (${element.boundingBox.width}x${element.boundingBox.height})`,
        styling: `tag: ${element.tag}, class: "${element.attributes.class || ''}", type: "${element.attributes.type || ''}"`,
        neighbors: this.findNearbyElements(element, dom),
        formContext: this.analyzeFormEnvironment(element, dom),
        hierarchy: this.getElementHierarchy(element)
      }
    }));
  }

  /**
   * Build optimized XPath with multiple strategies
   */
  private buildOptimizedXPath(element: DOMElement, dom: IndexedDOM): {
    full: string;
    simplified: string; 
    semantic: string;
    reliability: number;
  } {
    const full = element.xpath;
    
    // Strategy 1: Use ID if available (most reliable)
    if (element.attributes.id) {
      return {
        full,
        simplified: `//*[@id="${element.attributes.id}"]`,
        semantic: `Element with ID "${element.attributes.id}"`,
        reliability: 95
      };
    }
    
    // Strategy 2: Use semantic attributes (high reliability)
    if (element.attributes['data-testid']) {
      return {
        full,
        simplified: `//*[@data-testid="${element.attributes['data-testid']}"]`,
        semantic: `Test element "${element.attributes['data-testid']}"`,
        reliability: 90
      };
    }
    
    // Strategy 3: Use text content (good for buttons)
    if (element.text && element.text.length < 30) {
      const textXPath = `//${element.tag}[text()="${element.text}"]`;
      return {
        full,
        simplified: textXPath,
        semantic: `${element.tag} with text "${element.text}"`,
        reliability: 80
      };
    }
    
    // Strategy 4: Use class + position (moderate reliability)
    if (element.attributes.class) {
      const classNames = element.attributes.class.split(' ')[0]; // Use first class
      return {
        full,
        simplified: `//${element.tag}[@class="${classNames}"]`,
        semantic: `${element.tag} with class "${classNames}"`,
        reliability: 60
      };
    }
    
    // Strategy 5: Use position-based (lowest reliability)
    const positionXPath = this.generatePositionBasedXPath(element, dom);
    return {
      full,
      simplified: positionXPath,
      semantic: `${element.tag} at position ${element.index}`,
      reliability: 40
    };
  }

  /**
   * Generate position-based XPath as fallback
   */
  private generatePositionBasedXPath(element: DOMElement, dom: IndexedDOM): string {
    // Find similar elements and use position
    const similarElements = Array.from(dom.elements.values())
      .filter(e => e.tag === element.tag && e.isVisible)
      .sort((a, b) => a.boundingBox.y - b.boundingBox.y);
    
    const position = similarElements.findIndex(e => e.id === element.id) + 1;
    return `//${element.tag}[${position}]`;
  }

  /**
   * Build LLM prompt with XPath-enhanced elements
   */
  private buildXPathEnhancedPrompt(
    elements: XPathEnhancedElement[], 
    userTask: string, 
    pageContext: string
  ): string {
    // Sort by XPath reliability and take top 8 (instead of 10 to save context)
    const topElements = elements
      .sort((a, b) => b.xpath.reliability - a.xpath.reliability)
      .slice(0, 8);

    const elementSummary = topElements.map((item, index) => {
      return `${index}: ${item.context.text} 
   XPath: ${item.xpath.simplified} (${item.xpath.semantic})
   Styling: ${item.context.styling} 
   Context: ${item.context.formContext}
   Reliability: ${item.xpath.reliability}%`;
    }).join('\n\n');

    return `
TASK: ${userTask}

PAGE CONTEXT: ${pageContext}

CLICKABLE ELEMENTS WITH XPATH:
${elementSummary}

For each element (0-${topElements.length - 1}), analyze:
1. Relevance to task (0-100)
2. Role (primary_action, secondary_action, navigation, utility, destructive)  
3. XPath reliability assessment
4. Reasoning

Respond in JSON format:
{
  "0": {
    "relevance": 85, 
    "role": "primary_action", 
    "xpath_score": 95,
    "reasoning": "Login button with reliable ID-based XPath"
  }
}`;
  }

  /**
   * Enhanced element interaction using best XPath strategy
   */
  async clickElementWithBestXPath(
    page: any, 
    selectedElement: XPathEnhancedElement
  ): Promise<boolean> {
    const strategies = [
      { xpath: selectedElement.xpath.simplified, description: selectedElement.xpath.semantic },
      { xpath: selectedElement.xpath.full, description: "Full XPath fallback" }
    ];

    for (const strategy of strategies) {
      try {
        console.log(`<pre>Attempting click with: ${strategy.description}</pre>`);
        console.log(`<pre>XPath: ${strategy.xpath}</pre>`);
        
        await page.click(`xpath=${strategy.xpath}`, { timeout: 5000 });
        console.log(`<pre>✅ Click successful with ${strategy.description}</pre>`);
        return true;
        
      } catch (error) {
        console.log(`<pre>❌ Failed with ${strategy.description}: ${error}</pre>`);
        continue;
      }
    }
    
    console.log(`<pre>❌ All XPath strategies failed for element</pre>`);
    return false;
  }
}

// Usage example:
/*
const enhancedFinder = new EnhancedXPathElementFinder();

// Build elements with XPath optimization
const xpathElements = enhancedFinder.buildClickableElementsWithXPath(dom);

// Find best element using LLM with XPath context
const result = await enhancedFinder.findElementWithLLMClassification(
  xpathElements, userTask, screenshot
);

// Click using most reliable XPath strategy
const success = await enhancedFinder.clickElementWithBestXPath(page, result);
*/