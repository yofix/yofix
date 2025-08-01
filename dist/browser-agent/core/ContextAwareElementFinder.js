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
exports.ContextAwareElementFinder = void 0;
const LogFormatter_1 = require("../utils/LogFormatter");
const core = __importStar(require("@actions/core"));
class ContextAwareElementFinder {
    constructor(llmProvider) {
        this.llmProvider = llmProvider;
    }
    async findElementWithLLMClassification(dom, userTask, screenshot) {
        const clickableElements = this.extractAllClickableElements(dom);
        const classification = await this.classifyElementsWithLLM(clickableElements, userTask, dom, screenshot);
        const scored = this.scoreElementsFromLLMClassification(clickableElements, classification);
        scored.sort((a, b) => b.score - a.score);
        return scored[0] || null;
    }
    extractAllClickableElements(dom) {
        const elements = Array.from(dom.elements.values())
            .filter(e => e.isVisible && e.isInteractive);
        return elements.map(element => ({
            element,
            context: {
                text: `"${element.text || ''}" (aria: "${element.attributes['aria-label'] || ''}", value: "${element.attributes.value || ''}")`,
                position: `${element.boundingBox.x},${element.boundingBox.y} (${element.boundingBox.width}x${element.boundingBox.height})`,
                styling: `tag: ${element.tag}, class: "${element.attributes.class || ''}", type: "${element.attributes.type || ''}"`,
                neighbors: this.findNearbyElements(element, dom),
                formContext: this.analyzeFormEnvironment(element, dom),
                hierarchy: this.getElementHierarchy(element)
            }
        }));
    }
    async classifyElementsWithLLM(elements, userTask, dom, screenshot) {
        if (!this.llmProvider) {
            return this.fallbackClassification(elements, userTask);
        }
        const pageContext = this.buildPageContext(dom);
        const elementSummary = elements.slice(0, 10).map((item, index) => `${index}: ${item.context.text} | ${item.context.styling} | Position: ${item.context.position} | Form: ${item.context.formContext}`).join('\n');
        const prompt = `
TASK: ${userTask}

PAGE CONTEXT: ${pageContext}

CLICKABLE ELEMENTS:
${elementSummary}

For each element (0-${Math.min(elements.length - 1, 9)}), analyze:
1. How relevant is it to the user's task? (0-100)
2. What role does it serve on this page? (primary_action, secondary_action, navigation, utility, destructive)
3. Why is it relevant/irrelevant?

Consider:
- Element text, styling, and position
- Form context and nearby elements  
- Page type and user intent
- Visual hierarchy and prominence

Respond in JSON format:
{
  "0": {"relevance": 85, "role": "primary_action", "reasoning": "Login button positioned after password field"},
  "1": {"relevance": 20, "role": "utility", "reasoning": "Forgot password link - secondary to main task"}
}`;
        try {
            const response = await this.llmProvider.complete([{
                    role: 'user',
                    content: prompt
                }]);
            const classification = JSON.parse(response.content || '{}');
            const result = {};
            Object.entries(classification).forEach(([index, data]) => {
                const elementIndex = parseInt(index);
                if (elementIndex < elements.length) {
                    result[elements[elementIndex].element.id] = data;
                }
            });
            return result;
        }
        catch (error) {
            LogFormatter_1.LogFormatter.formatError(`LLM classification failed: ${error}`);
            return this.fallbackClassification(elements, userTask);
        }
    }
    analyzeTaskContext(taskDescription, targetText) {
        const task = taskDescription.toLowerCase();
        const target = (targetText || '').toLowerCase();
        let intent = 'generic';
        let targetAction;
        let avoidActions = [];
        const keywords = [];
        if (task.match(/login|sign.*in|authenticate|log.*in/) || target.match(/login|sign.*in/)) {
            intent = 'login';
            targetAction = 'login';
            avoidActions = ['forgot', 'reset', 'register', 'signup', 'help'];
            keywords.push('login', 'signin', 'authenticate');
        }
        else if (task.match(/buy|purchase|checkout|add.*cart|order/) || target.match(/buy|add.*cart|checkout/)) {
            intent = 'purchase';
            targetAction = 'purchase';
            avoidActions = ['save.*later', 'wishlist', 'compare', 'cancel'];
            keywords.push('buy', 'purchase', 'checkout', 'cart');
        }
        else if (task.match(/submit|send|apply|register/) || target.match(/submit|send|apply/)) {
            intent = 'submit';
            targetAction = 'submit';
            avoidActions = ['cancel', 'reset', 'clear'];
            keywords.push('submit', 'send', 'apply');
        }
        else if (task.match(/go.*to|navigate|visit|open/) || target.match(/continue|next|proceed/)) {
            intent = 'navigate';
            targetAction = 'navigate';
            avoidActions = ['back', 'cancel', 'close'];
            keywords.push('continue', 'next', 'proceed', 'go');
        }
        else if (task.match(/search|find|look.*for/) || target.match(/search|find/)) {
            intent = 'search';
            targetAction = 'search';
            avoidActions = ['clear', 'reset', 'cancel'];
            keywords.push('search', 'find');
        }
        else if (task.match(/help|support|contact|assistance/) || target.match(/help|support/)) {
            intent = 'help';
            targetAction = 'help';
            avoidActions = ['close', 'cancel', 'skip'];
            keywords.push('help', 'support', 'contact');
        }
        return { intent, targetAction, avoidActions, keywords };
    }
    async findSubmitButton(dom, nearPasswordField, taskContext) {
        const candidates = this.findSubmitCandidates(dom);
        if (candidates.length === 0) {
            core.debug('No submit button candidates found');
            return null;
        }
        const context = this.analyzeTaskContext(taskContext || 'login', '');
        core.debug(`Task context: ${context.intent}, target: ${context.targetAction}, avoid: ${context.avoidActions?.join(', ')}`);
        const scored = candidates.map(element => this.scoreSubmitButton(element, dom, nearPasswordField, context));
        const classified = scored.map(item => this.classifyButtonIntent(item, dom, context));
        classified.sort((a, b) => b.score - a.score);
        const best = classified[0];
        if (best.score < 10) {
            core.debug(`Best submit button score too low: ${best.score}`);
            return null;
        }
        const confidence = this.calculateConfidence(classified);
        best.confidence = confidence;
        core.info(`Found submit button [${best.element.index}] with score ${best.score} (${best.confidence}% confidence)`);
        core.debug(`Reasons: ${best.reasons.join(', ')}`);
        if (classified.length > 1) {
            core.debug(`\nTop candidates:\n${this.explainSelection(classified.slice(0, 3))}`);
        }
        return best;
    }
    async findFormField(dom, fieldType) {
        const candidates = Array.from(dom.elements.values()).filter(elem => (elem.tag === 'input' || elem.tag === 'textarea') && elem.isVisible);
        const scored = candidates.map(element => this.scoreFormField(element, fieldType, dom));
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (!best || best.score < 20)
            return null;
        best.confidence = this.calculateConfidence(scored);
        return best;
    }
    findSubmitCandidates(dom) {
        const candidates = Array.from(dom.elements.values()).filter(elem => {
            if (!elem.isVisible || !elem.isInteractive)
                return false;
            const isButton = elem.tag === 'button' ||
                elem.attributes.type === 'submit' ||
                elem.attributes.role === 'button' ||
                (elem.tag === 'input' && elem.attributes.type === 'submit') ||
                (elem.tag === 'a' && this.looksLikeButton(elem));
            const hasSubmitText = elem.text && elem.text.match(/login|sign.*in|submit|continue|next|go|enter/i);
            return isButton || hasSubmitText;
        });
        if (candidates.length === 0) {
            return Array.from(dom.elements.values()).filter(elem => {
                return elem.isVisible && elem.isInteractive &&
                    elem.text && elem.text.match(/login|sign.*in|submit/i);
            });
        }
        return candidates;
    }
    scoreSubmitButton(element, dom, nearPasswordField, context) {
        let score = 0;
        const reasons = [];
        if (nearPasswordField && this.isAfterElement(element, nearPasswordField)) {
            score += 50;
            reasons.push('after password field');
        }
        const buttonContext = this.getFormContext(element, dom);
        if (buttonContext.isLastButtonInForm) {
            score += 30;
            reasons.push('last button in form');
        }
        if (buttonContext.isOnlyButtonInForm) {
            score += 40;
            reasons.push('only button in form');
        }
        if (element.boundingBox.width > 100) {
            score += 20;
            reasons.push('wide button (primary)');
        }
        const text = (element.text || '').toLowerCase();
        const ariaLabel = (element.attributes['aria-label'] || '').toLowerCase();
        const value = (element.attributes.value || '').toLowerCase();
        const { positivePatterns, negativePatterns } = this.generateContextualPatterns(context);
        for (const { pattern, score: penalty, reason } of negativePatterns) {
            if (pattern.test(text) || pattern.test(ariaLabel) || pattern.test(value)) {
                score += penalty;
                reasons.push(reason);
            }
        }
        for (const { pattern, score: points, reason } of positivePatterns) {
            if (pattern.test(text) || pattern.test(ariaLabel) || pattern.test(value)) {
                score += points;
                reasons.push(reason);
                break;
            }
        }
        if (element.attributes.type === 'submit') {
            score += 60;
            reasons.push('type=submit');
        }
        const classes = element.attributes.class || '';
        if (classes.match(/primary|main|submit|login|signin/i)) {
            score += 25;
            reasons.push('primary button class');
        }
        if (classes.match(/secondary|cancel|back|reset|forgot/i)) {
            score -= 30;
            reasons.push('PENALTY: secondary/cancel class');
        }
        const formContext = this.analyzeFormRelationships(element, dom);
        if (formContext.nearbyInputs >= 2) {
            score += 20;
            reasons.push(`near ${formContext.nearbyInputs} inputs`);
        }
        if (formContext.nearPasswordField) {
            score += 30;
            reasons.push('positioned after password field');
        }
        if (formContext.nearEmailField) {
            score += 20;
            reasons.push('positioned after email field');
        }
        if (formContext.isBottomRightButton) {
            score += 25;
            reasons.push('bottom-right form position (primary action)');
        }
        if (formContext.inFormContainer) {
            score += 15;
            reasons.push('inside form container');
        }
        const visualScore = this.calculateVisualPromience(element);
        score += visualScore.score;
        if (visualScore.reasons.length > 0) {
            reasons.push(...visualScore.reasons);
        }
        return { element, score, confidence: 0, reasons };
    }
    scoreFormField(element, fieldType, dom) {
        let score = 0;
        const reasons = [];
        const type = element.attributes.type || 'text';
        if (fieldType === 'password' && type === 'password') {
            score += 100;
            reasons.push('type=password');
        }
        else if (fieldType === 'email' && type === 'email') {
            score += 100;
            reasons.push('type=email');
        }
        else if ((fieldType === 'email' || fieldType === 'username') && type === 'text') {
            const passwordField = this.findPasswordFieldInDom(dom);
            if (passwordField && this.isBeforeElement(element, passwordField)) {
                score += 70;
                reasons.push('text field before password');
            }
        }
        const placeholder = (element.attributes.placeholder || '').toLowerCase();
        if (placeholder.includes(fieldType)) {
            score += 80;
            reasons.push('placeholder match');
        }
        const name = (element.attributes.name || '').toLowerCase();
        if (name.includes(fieldType)) {
            score += 70;
            reasons.push('name match');
        }
        const ariaLabel = (element.attributes['aria-label'] || '').toLowerCase();
        if (ariaLabel.includes(fieldType)) {
            score += 60;
            reasons.push('aria-label match');
        }
        if (element.attributes.id) {
            score += 10;
            reasons.push('has id (labelable)');
        }
        if (fieldType === 'email' || fieldType === 'username') {
            if (placeholder.match(/user|email|login|account/i)) {
                score += 40;
                reasons.push('username pattern');
            }
        }
        return { element, score, confidence: 0, reasons };
    }
    isAfterElement(element, reference) {
        return element.boundingBox.y > reference.boundingBox.y;
    }
    isBeforeElement(element, reference) {
        return element.boundingBox.y < reference.boundingBox.y;
    }
    findPasswordFieldInDom(dom) {
        for (const [id, element] of dom.elements) {
            if (element.tag === 'input' && element.attributes.type === 'password' && element.isVisible) {
                return element;
            }
        }
        return null;
    }
    looksLikeButton(element) {
        const classes = element.attributes.class || '';
        const style = element.attributes.style || '';
        return classes.match(/btn|button/i) !== null ||
            style.includes('cursor: pointer') ||
            element.attributes.role === 'button';
    }
    getFormContext(element, dom) {
        const buttons = Array.from(dom.elements.values()).filter(e => (e.tag === 'button' || e.attributes.type === 'submit' || e.attributes.role === 'button') &&
            e.isVisible &&
            Math.abs(e.boundingBox.x - element.boundingBox.x) < 500);
        const buttonYPositions = buttons.map(b => b.boundingBox.y).sort((a, b) => a - b);
        const elementY = element.boundingBox.y;
        return {
            isLastButtonInForm: elementY === Math.max(...buttonYPositions),
            isOnlyButtonInForm: buttons.length === 1
        };
    }
    countNearbyInputs(element, dom) {
        const nearbyThreshold = 200;
        return Array.from(dom.elements.values()).filter(e => {
            if (e.tag !== 'input' && e.tag !== 'textarea')
                return false;
            const distance = Math.sqrt(Math.pow(e.boundingBox.x - element.boundingBox.x, 2) +
                Math.pow(e.boundingBox.y - element.boundingBox.y, 2));
            return distance < nearbyThreshold;
        }).length;
    }
    calculateConfidence(scores) {
        if (scores.length === 0)
            return 0;
        if (scores.length === 1)
            return 100;
        const bestScore = scores[0].score;
        const secondBestScore = scores[1]?.score || 0;
        if (bestScore > secondBestScore * 2)
            return 95;
        if (bestScore > secondBestScore * 1.5)
            return 80;
        if (bestScore > secondBestScore * 1.2)
            return 60;
        return 40;
    }
    generateContextualPatterns(context) {
        const intent = context?.intent || 'generic';
        const avoidActions = context?.avoidActions || [];
        let positivePatterns = [];
        let negativePatterns = [];
        switch (intent) {
            case 'login':
                positivePatterns = [
                    { pattern: /^(sign|log)[\s-]?in$/i, score: 80, reason: 'exact login text' },
                    { pattern: /^login$/i, score: 75, reason: 'exact login' },
                    { pattern: /^authenticate$/i, score: 70, reason: 'authenticate action' },
                    { pattern: /(sign|log).*in/i, score: 50, reason: 'contains login' },
                    { pattern: /enter/i, score: 40, reason: 'enter action' },
                    { pattern: /access/i, score: 30, reason: 'access action' }
                ];
                negativePatterns = [
                    { pattern: /forgot.*password|reset.*password/i, score: -80, reason: 'PENALTY: password recovery' },
                    { pattern: /register|sign.*up|create.*account/i, score: -70, reason: 'PENALTY: registration' },
                    { pattern: /help|support/i, score: -50, reason: 'PENALTY: help/support' },
                    { pattern: /demo|trial|free/i, score: -40, reason: 'PENALTY: promotional' }
                ];
                break;
            case 'purchase':
                positivePatterns = [
                    { pattern: /^buy.*now$/i, score: 80, reason: 'buy now action' },
                    { pattern: /^add.*cart$/i, score: 75, reason: 'add to cart' },
                    { pattern: /^checkout$/i, score: 70, reason: 'checkout action' },
                    { pattern: /^purchase$/i, score: 65, reason: 'purchase action' },
                    { pattern: /^order$/i, score: 60, reason: 'order action' },
                    { pattern: /buy|purchase/i, score: 50, reason: 'contains purchase' }
                ];
                negativePatterns = [
                    { pattern: /save.*later|wishlist/i, score: -60, reason: 'PENALTY: save for later' },
                    { pattern: /compare|review/i, score: -50, reason: 'PENALTY: comparison' },
                    { pattern: /cancel|remove/i, score: -45, reason: 'PENALTY: cancel action' },
                    { pattern: /continue.*shopping/i, score: -40, reason: 'PENALTY: continue shopping' }
                ];
                break;
            case 'submit':
                positivePatterns = [
                    { pattern: /^submit$/i, score: 80, reason: 'exact submit' },
                    { pattern: /^send$/i, score: 75, reason: 'send action' },
                    { pattern: /^apply$/i, score: 70, reason: 'apply action' },
                    { pattern: /^save$/i, score: 65, reason: 'save action' },
                    { pattern: /submit|send/i, score: 50, reason: 'contains submit' }
                ];
                negativePatterns = [
                    { pattern: /cancel|reset|clear/i, score: -60, reason: 'PENALTY: cancel/reset' },
                    { pattern: /preview|draft/i, score: -40, reason: 'PENALTY: preview/draft' }
                ];
                break;
            case 'navigate':
                positivePatterns = [
                    { pattern: /^continue$/i, score: 80, reason: 'continue action' },
                    { pattern: /^next$/i, score: 75, reason: 'next action' },
                    { pattern: /^proceed$/i, score: 70, reason: 'proceed action' },
                    { pattern: /^go$/i, score: 65, reason: 'go action' },
                    { pattern: /continue|next|proceed/i, score: 50, reason: 'contains navigation' }
                ];
                negativePatterns = [
                    { pattern: /back|previous|cancel/i, score: -60, reason: 'PENALTY: back/cancel' },
                    { pattern: /skip|later/i, score: -40, reason: 'PENALTY: skip' }
                ];
                break;
            case 'search':
                positivePatterns = [
                    { pattern: /^search$/i, score: 80, reason: 'search action' },
                    { pattern: /^find$/i, score: 75, reason: 'find action' },
                    { pattern: /^go$/i, score: 70, reason: 'go action' },
                    { pattern: /search|find/i, score: 50, reason: 'contains search' }
                ];
                negativePatterns = [
                    { pattern: /clear|reset/i, score: -50, reason: 'PENALTY: clear/reset' },
                    { pattern: /cancel/i, score: -40, reason: 'PENALTY: cancel' }
                ];
                break;
            case 'help':
                positivePatterns = [
                    { pattern: /^help$/i, score: 80, reason: 'help action' },
                    { pattern: /^support$/i, score: 75, reason: 'support action' },
                    { pattern: /^contact$/i, score: 70, reason: 'contact action' },
                    { pattern: /help|support|contact/i, score: 50, reason: 'contains help' }
                ];
                negativePatterns = [
                    { pattern: /close|cancel|skip/i, score: -40, reason: 'PENALTY: close/cancel' }
                ];
                break;
            default:
                positivePatterns = [
                    { pattern: /^submit$/i, score: 70, reason: 'submit action' },
                    { pattern: /^continue$/i, score: 65, reason: 'continue action' },
                    { pattern: /^next$/i, score: 60, reason: 'next action' },
                    { pattern: /^save$/i, score: 55, reason: 'save action' },
                    { pattern: /submit|continue|next/i, score: 40, reason: 'contains action' }
                ];
                negativePatterns = [
                    { pattern: /cancel|close/i, score: -50, reason: 'PENALTY: cancel/close' },
                    { pattern: /back|previous/i, score: -40, reason: 'PENALTY: back' }
                ];
        }
        if (avoidActions.length > 0) {
            const avoidPattern = new RegExp(avoidActions.join('|'), 'i');
            negativePatterns.push({
                pattern: avoidPattern,
                score: -70,
                reason: 'PENALTY: user-specified avoid action'
            });
        }
        return { positivePatterns, negativePatterns };
    }
    analyzeFormRelationships(element, dom) {
        const elementX = element.boundingBox.x;
        const elementY = element.boundingBox.y;
        const proximityThreshold = 300;
        const nearbyInputs = Array.from(dom.elements.values()).filter(e => {
            if (e.tag !== 'input' && e.tag !== 'textarea')
                return false;
            if (!e.isVisible)
                return false;
            const distance = Math.sqrt(Math.pow(e.boundingBox.x - elementX, 2) +
                Math.pow(e.boundingBox.y - elementY, 2));
            return distance < proximityThreshold;
        });
        const passwordFields = nearbyInputs.filter(e => e.attributes.type === 'password' && e.boundingBox.y < elementY);
        const emailFields = nearbyInputs.filter(e => (e.attributes.type === 'email' ||
            e.attributes.placeholder?.toLowerCase().includes('email') ||
            e.attributes.name?.toLowerCase().includes('email')) &&
            e.boundingBox.y < elementY);
        const otherButtons = Array.from(dom.elements.values()).filter(e => (e.tag === 'button' || e.attributes.type === 'submit') &&
            e.isVisible && e.id !== element.id);
        const isBottomRight = otherButtons.every(btn => element.boundingBox.y >= btn.boundingBox.y &&
            element.boundingBox.x >= btn.boundingBox.x);
        const inFormContainer = element.xpath.includes('form') ||
            element.attributes.form !== undefined;
        return {
            nearbyInputs: nearbyInputs.length,
            nearPasswordField: passwordFields.length > 0,
            nearEmailField: emailFields.length > 0,
            isBottomRightButton: isBottomRight && otherButtons.length > 0,
            inFormContainer
        };
    }
    classifyButtonIntent(elementScore, dom, context) {
        const element = elementScore.element;
        const text = (element.text || '').toLowerCase();
        const classes = element.attributes.class || '';
        let intentScore = 0;
        const intentReasons = [];
        if (text.match(/^(login|sign.*in|submit|continue|proceed|next|go)$/i)) {
            intentScore += 40;
            intentReasons.push('PRIMARY: core action verb');
        }
        const formInputs = Array.from(dom.elements.values()).filter(e => (e.tag === 'input' || e.tag === 'textarea') && e.isVisible);
        const inputsAbove = formInputs.filter(input => input.boundingBox.y < element.boundingBox.y).length;
        if (inputsAbove >= 2) {
            intentScore += 30;
            intentReasons.push('PRIMARY: positioned after form inputs');
        }
        if (classes.match(/primary|main|cta|btn-primary/i)) {
            intentScore += 35;
            intentReasons.push('PRIMARY: explicit primary styling');
        }
        if (text.match(/forgot|reset|help|cancel|back|skip|later/i)) {
            intentScore -= 50;
            intentReasons.push('SECONDARY: support/fallback action');
        }
        if (classes.match(/secondary|link|text|outline|ghost/i)) {
            intentScore -= 25;
            intentReasons.push('SECONDARY: secondary styling');
        }
        if (element.tag === 'a' && !classes.match(/btn|button/i)) {
            intentScore -= 20;
            intentReasons.push('SECONDARY: link element');
        }
        if (text.match(/delete|remove|destroy|cancel|abort/i)) {
            intentScore -= 30;
            intentReasons.push('DESTRUCTIVE: dangerous action');
        }
        if (classes.match(/danger|error|destructive|warning/i)) {
            intentScore -= 25;
            intentReasons.push('DESTRUCTIVE: warning styling');
        }
        const hasPasswordField = Array.from(dom.elements.values()).some(e => e.attributes.type === 'password' && e.isVisible);
        if (hasPasswordField && text.match(/login|sign.*in/i)) {
            intentScore += 50;
            intentReasons.push('PRIMARY: login action in auth context');
        }
        const newScore = elementScore.score + intentScore;
        const newReasons = [...elementScore.reasons, ...intentReasons];
        return {
            ...elementScore,
            score: newScore,
            reasons: newReasons
        };
    }
    calculateVisualPromience(element) {
        let score = 0;
        const reasons = [];
        const area = element.boundingBox.width * element.boundingBox.height;
        if (area > 5000) {
            score += 15;
            reasons.push('large button area');
        }
        else if (area < 1000) {
            score -= 10;
            reasons.push('PENALTY: small button');
        }
        const classes = element.attributes.class || '';
        if (classes.match(/blue|green|primary|cta|call.*action/i)) {
            score += 20;
            reasons.push('prominent color class');
        }
        if (classes.match(/gray|grey|secondary|muted|subtle/i)) {
            score -= 15;
            reasons.push('PENALTY: muted color class');
        }
        const containerWidth = 1200;
        const centerX = containerWidth / 2;
        const distanceFromCenter = Math.abs(element.boundingBox.x - centerX);
        if (distanceFromCenter < 100) {
            score += 10;
            reasons.push('center-aligned');
        }
        return { score, reasons };
    }
    findNearbyElements(element, dom) {
        const threshold = 150;
        return Array.from(dom.elements.values())
            .filter(e => e.id !== element.id && e.isVisible)
            .filter(e => {
            const distance = Math.sqrt(Math.pow(e.boundingBox.x - element.boundingBox.x, 2) +
                Math.pow(e.boundingBox.y - element.boundingBox.y, 2));
            return distance < threshold;
        })
            .slice(0, 3)
            .map(e => `${e.tag}:"${e.text?.substring(0, 20) || ''}"`);
    }
    analyzeFormEnvironment(element, dom) {
        const inputs = Array.from(dom.elements.values())
            .filter(e => (e.tag === 'input' || e.tag === 'textarea') && e.isVisible)
            .filter(e => Math.abs(e.boundingBox.y - element.boundingBox.y) < 200);
        const inputTypes = inputs.map(i => i.attributes.type || 'text');
        const hasPassword = inputTypes.includes('password');
        const hasEmail = inputTypes.includes('email') || inputs.some(i => i.attributes.placeholder?.toLowerCase().includes('email'));
        return `${inputs.length} inputs nearby${hasPassword ? ', password field' : ''}${hasEmail ? ', email field' : ''}`;
    }
    getElementHierarchy(element) {
        const parts = element.xpath.split('/').slice(-3);
        return parts.join(' > ');
    }
    buildPageContext(dom) {
        const pageTitle = dom.url;
        const inputCount = Array.from(dom.elements.values()).filter(e => e.tag === 'input').length;
        const buttonCount = Array.from(dom.elements.values()).filter(e => e.tag === 'button' || e.attributes.type === 'submit').length;
        const hasPasswordField = Array.from(dom.elements.values()).some(e => e.attributes.type === 'password');
        return `Page: ${pageTitle}, ${inputCount} inputs, ${buttonCount} buttons${hasPasswordField ? ', has password field (likely auth page)' : ''}`;
    }
    scoreElementsFromLLMClassification(elements, classification) {
        return elements.map(item => {
            const elementClass = classification[item.element.id];
            if (!elementClass) {
                return { element: item.element, score: 0, confidence: 0, reasons: ['No LLM classification'] };
            }
            let score = elementClass.relevance;
            const reasons = [elementClass.reasoning];
            switch (elementClass.role) {
                case 'primary_action':
                    score += 20;
                    reasons.push('PRIMARY ACTION role');
                    break;
                case 'secondary_action':
                    score -= 10;
                    reasons.push('secondary action');
                    break;
                case 'destructive':
                    score -= 30;
                    reasons.push('PENALTY: destructive action');
                    break;
                case 'utility':
                    score -= 15;
                    reasons.push('utility function');
                    break;
            }
            return {
                element: item.element,
                score,
                confidence: Math.min(95, score),
                reasons
            };
        });
    }
    fallbackClassification(elements, userTask) {
        const result = {};
        elements.forEach(item => {
            const text = (item.element.text || '').toLowerCase();
            let relevance = 30;
            let role = 'utility';
            let reasoning = 'Pattern-based fallback';
            if (userTask.toLowerCase().includes('login') && text.includes('login')) {
                relevance = 80;
                role = 'primary_action';
                reasoning = 'Login text matches login task';
            }
            else if (text.includes('submit') || text.includes('send')) {
                relevance = 70;
                role = 'primary_action';
                reasoning = 'Submit/send action';
            }
            else if (text.includes('cancel') || text.includes('close')) {
                relevance = 20;
                role = 'secondary_action';
                reasoning = 'Cancel/close action';
            }
            result[item.element.id] = { relevance, reasoning, role };
        });
        return result;
    }
    explainSelection(scored) {
        const top3 = scored.slice(0, 3);
        return top3.map((item, index) => {
            const elem = item.element;
            return `${index + 1}. [${elem.index}] ${elem.tag} "${elem.text?.substring(0, 30) || ''}" - Score: ${item.score} (${item.confidence}% conf)\n   Reasons: ${item.reasons.join(', ')}`;
        }).join('\n');
    }
}
exports.ContextAwareElementFinder = ContextAwareElementFinder;
