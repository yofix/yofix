import { AgentState, IndexedDOM, ActionDefinition, StepResult } from '../types';
import { DOMIndexer } from '../core/DOMIndexer';
import * as core from '@actions/core';

export class PromptBuilder {
  private domIndexer: DOMIndexer;
  
  constructor() {
    this.domIndexer = new DOMIndexer();
  }
  
  /**
   * Build the main task execution prompt
   */
  buildTaskPrompt(
    task: string,
    state: AgentState,
    dom: IndexedDOM,
    actions: ActionDefinition[],
    screenshot?: Buffer
  ): string {
    const sections: string[] = [];
    
    // Task description
    sections.push(this.buildTaskSection(task));
    
    // Current state
    sections.push(this.buildStateSection(state, dom));
    
    // Available actions
    sections.push(this.buildActionsSection(actions));
    
    // Interactive elements
    sections.push(this.buildElementsSection(dom));
    
    // History context
    if (state.history.length > 0) {
      sections.push(this.buildHistorySection(state.history));
    }
    
    // Memory context
    if (state.memory.size > 0) {
      sections.push(this.buildMemorySection(state));
    }
    
    // Instructions
    sections.push(this.buildInstructions());
    
    return sections.join('\n\n');
  }
  
  private buildTaskSection(task: string): string {
    return `<task>
${task}
</task>`;
  }
  
  private buildStateSection(state: AgentState, dom: IndexedDOM): string {
    return `<current_state>
URL: ${state.currentUrl}
Page Title: ${dom.title}
Steps Completed: ${state.history.length}
Files Saved: ${state.fileSystem.size}
</current_state>`;
  }
  
  private buildActionsSection(actions: ActionDefinition[]): string {
    const lines: string[] = ['<available_actions>'];
    
    actions.forEach(action => {
      lines.push(`\n${action.name}: ${action.description}`);
      
      if (action.parameters && Object.keys(action.parameters).length > 0) {
        const params = Object.entries(action.parameters)
          .map(([key, schema]) => `${key}${schema.required ? '*' : ''}`)
          .join(', ');
        lines.push(`  Parameters: ${params}`);
      }
      
      if (action.examples && action.examples.length > 0) {
        lines.push(`  Example: ${action.examples[0]}`);
      }
    });
    
    lines.push('</available_actions>');
    return lines.join('\n');
  }
  
  private buildElementsSection(dom: IndexedDOM): string {
    const lines: string[] = ['<interactive_elements>'];
    
    // Group elements by type for better organization
    const buttons: string[] = [];
    const links: string[] = [];
    const inputs: string[] = [];
    const others: string[] = [];
    
    dom.interactiveElements.forEach(id => {
      const element = dom.elements.get(id);
      if (!element || !element.isVisible) return;
      
      const desc = this.describeElement(element);
      if (!desc) return;
      
      const line = `[${element.index}] ${desc}`;
      
      if (element.tag === 'button' || element.attributes.role === 'button') {
        buttons.push(line);
      } else if (element.tag === 'a') {
        links.push(line);
      } else if (element.tag === 'input' || element.tag === 'textarea' || element.tag === 'select') {
        inputs.push(line);
      } else {
        others.push(line);
      }
    });
    
    if (buttons.length > 0) {
      lines.push('\nButtons:');
      lines.push(...buttons);
    }
    
    if (links.length > 0) {
      lines.push('\nLinks:');
      lines.push(...links);
    }
    
    if (inputs.length > 0) {
      lines.push('\nInputs:');
      lines.push(...inputs);
    }
    
    if (others.length > 0) {
      lines.push('\nOther:');
      lines.push(...others);
    }
    
    lines.push('</interactive_elements>');
    return lines.join('\n');
  }
  
  private buildHistorySection(history: StepResult[]): string {
    const recentSteps = history.slice(-5); // Last 5 steps
    const lines: string[] = ['<recent_steps>'];
    
    recentSteps.forEach((step, i) => {
      const status = step.result.success ? '✓' : '✗';
      lines.push(`${i + 1}. ${status} ${step.action}: ${JSON.stringify(step.parameters)}`);
      
      if (!step.result.success && step.result.error) {
        lines.push(`   Error: ${step.result.error}`);
      }
    });
    
    lines.push('</recent_steps>');
    return lines.join('\n');
  }
  
  private buildMemorySection(state: AgentState): string {
    const lines: string[] = ['<memory>'];
    
    // Show relevant memory entries
    const relevantEntries: string[] = [];
    
    for (const [key, value] of state.memory) {
      if (typeof value === 'object' && value.value) {
        // It's a MemoryEntry
        relevantEntries.push(`${key}: ${JSON.stringify(value.value)}`);
      } else {
        relevantEntries.push(`${key}: ${JSON.stringify(value)}`);
      }
      
      if (relevantEntries.length >= 5) break; // Limit to 5 entries
    }
    
    lines.push(...relevantEntries);
    lines.push('</memory>');
    return lines.join('\n');
  }
  
  private buildInstructions(): string {
    return `<instructions>
Analyze the task and current state to determine the next action.

Response format:
{
  "thinking": "Brief explanation of your reasoning",
  "action": "action_name",
  "parameters": {
    "param1": "value1"
  }
}

Guidelines:
- Prefer 'smart_type' and 'smart_click' actions for better element detection
- Use element indices (e.g., index=5) as fallback when smart actions don't work
- IMPORTANT: For forms, fill ALL fields before submitting
- Take screenshots when important information is displayed
- Save important data to files for later reference
- If an action fails, try an alternative approach
- Only mark task complete when ALL requested actions are done

Form Filling Rules:
- ALWAYS fill all form fields (email, password, etc.) before clicking submit
- Prefer 'smart_type' for intelligent field detection:
  - smart_type field="email" text="user@example.com"
  - smart_type field="password" text="password123"
- Use 'smart_click' for submit buttons:
  - smart_click target="submit"
  - smart_click target="login"
  - smart_click target="sign in"
- Each field requires a separate action
- After filling all fields, then click the submit button

Common patterns:
- For login: 
  1. smart_type field="email" text="user@example.com"
  2. smart_type field="password" text="password123"
  3. smart_click target="login"
- For navigation: click on links or use go_to with URLs
- For data extraction: get_text or screenshot, then save_to_file

Smart Actions (Recommended):
- smart_type: Finds form fields using semantic understanding (email, password, username)
- smart_click: Finds buttons using context and position (submit, login, continue)

CRITICAL: Never submit a form with empty required fields!
</instructions>`;
  }
  
  private describeElement(element: any): string {
    const parts: string[] = [];
    
    // Element type
    switch (element.tag) {
      case 'a':
        parts.push('Link');
        break;
      case 'button':
        parts.push('Button');
        break;
      case 'input':
        const inputType = element.attributes.type || 'text';
        parts.push(`Input[${inputType}]`);
        break;
      case 'select':
        parts.push('Dropdown');
        break;
      case 'textarea':
        parts.push('Textarea');
        break;
      default:
        if (element.attributes.role === 'button') {
          parts.push('Button');
        } else {
          parts.push(element.tag.toUpperCase());
        }
    }
    
    // Text content or labels
    if (element.text && element.text.length < 50) {
      parts.push(`"${element.text.trim()}"`);
    } else if (element.attributes['aria-label']) {
      parts.push(`"${element.attributes['aria-label']}"`);
    } else if (element.attributes.placeholder) {
      parts.push(`placeholder="${element.attributes.placeholder}"`);
    } else if (element.attributes.value && element.tag === 'button') {
      parts.push(`"${element.attributes.value}"`);
    }
    
    // Additional context
    if (element.attributes.href && element.tag === 'a') {
      const href = element.attributes.href;
      if (href.startsWith('/')) {
        parts.push(`→ ${href}`);
      } else if (!href.startsWith('javascript:')) {
        try {
          const url = new URL(href);
          parts.push(`→ ${url.pathname}`);
        } catch {
          parts.push(`→ ${href.substring(0, 30)}...`);
        }
      }
    }
    
    return parts.join(' ');
  }
  
  /**
   * Build error recovery prompt
   */
  buildErrorRecoveryPrompt(
    lastAction: StepResult,
    error: string,
    dom: IndexedDOM,
    actions: ActionDefinition[]
  ): string {
    return `<error_recovery>
The last action failed:
Action: ${lastAction.action}
Parameters: ${JSON.stringify(lastAction.parameters)}
Error: ${error}

Current URL: ${dom.url}
Available elements: ${dom.interactiveElements.length}

${this.buildElementsSection(dom)}

${this.buildActionsSection(actions)}

<instructions>
Analyze why the action failed and suggest an alternative approach.
Common solutions:
- If element not found, try a different identifier (index, text, or selector)
- If navigation failed, check if already on target page
- If form submission failed, check for validation errors
- If click failed, element might be hidden - try scrolling first

Respond with an alternative action to accomplish the same goal.
</instructions>
</error_recovery>`;
  }
  
  /**
   * Build completion check prompt
   */
  buildCompletionCheckPrompt(task: string, state: AgentState): string {
    const lastSteps = state.history.slice(-3).map(step => 
      `${step.action}: ${JSON.stringify(step.parameters)} - ${step.result.success ? '✓' : '✗'}`
    ).join('\n');
    
    return `<completion_check>
Original task: ${task}

Current state:
- URL: ${state.currentUrl}
- Steps completed: ${state.history.length}
- Last 3 actions:
${lastSteps}

Task requirements analysis:
1. Has every part of the task been completed?
2. Were all requested actions performed?
3. Was the final goal achieved?

For login tasks, ensure:
- Email/username was entered
- Password was entered
- Login button was clicked
- Login was successful (check URL change or page content)

For data extraction tasks, ensure:
- Requested data was found
- Data was saved or returned

Respond with:
{
  "completed": true/false,
  "reason": "Brief explanation of what's done or what's missing",
  "next_action": "If not completed, specific next action needed"
}

IMPORTANT: Only mark as completed if ALL parts of the task are done!
</completion_check>`;
  }
}