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
exports.debugAction = void 0;
const core = __importStar(require("@actions/core"));
exports.debugAction = {
    name: 'debug_elements',
    description: 'List all interactive elements on the page for debugging',
    parameters: {
        type: {
            description: 'Type of elements to show: all, buttons, inputs, links',
            required: false,
            default: 'all'
        }
    },
    async execute(params, context) {
        const { page, dom } = context;
        const type = params.type || 'all';
        try {
            core.info(`\n🔍 Debug: Interactive Elements on Page`);
            core.info(`URL: ${page.url()}`);
            core.info(`Total elements: ${dom.elements.size}`);
            core.info(`Interactive elements: ${dom.interactiveElements.length}\n`);
            let elementsToShow = dom.interactiveElements;
            if (type !== 'all') {
                elementsToShow = dom.interactiveElements.filter(id => {
                    const element = dom.elements.get(id);
                    if (!element)
                        return false;
                    switch (type) {
                        case 'buttons':
                            return element.tag === 'button' ||
                                element.attributes.role === 'button' ||
                                element.attributes.type === 'submit';
                        case 'inputs':
                            return element.tag === 'input' ||
                                element.tag === 'textarea' ||
                                element.tag === 'select';
                        case 'links':
                            return element.tag === 'a';
                        default:
                            return true;
                    }
                });
            }
            const details = [];
            elementsToShow.forEach((id, index) => {
                const element = dom.elements.get(id);
                if (!element)
                    return;
                const info = [
                    `[${element.index}] ${element.tag}`,
                    element.text ? `"${element.text.substring(0, 50)}"` : '',
                    element.attributes.type ? `type="${element.attributes.type}"` : '',
                    element.attributes.role ? `role="${element.attributes.role}"` : '',
                    element.attributes.placeholder ? `placeholder="${element.attributes.placeholder}"` : '',
                    element.attributes.value ? `value="${element.attributes.value.substring(0, 20)}..."` : '',
                    element.attributes.class ? `class="${element.attributes.class.substring(0, 30)}..."` : ''
                ].filter(Boolean).join(' ');
                details.push(info);
                core.info(info);
            });
            const submitButtons = dom.interactiveElements.filter(id => {
                const element = dom.elements.get(id);
                if (!element)
                    return false;
                return (element.tag === 'button' || element.attributes.type === 'submit') &&
                    (element.text?.toLowerCase().includes('sign') ||
                        element.text?.toLowerCase().includes('log') ||
                        element.text?.toLowerCase().includes('submit') ||
                        element.text?.toLowerCase().includes('continue'));
            });
            if (submitButtons.length > 0) {
                core.info(`\n🎯 Potential submit buttons found:`);
                submitButtons.forEach(id => {
                    const element = dom.elements.get(id);
                    if (element) {
                        core.info(`  [${element.index}] ${element.tag} "${element.text}"`);
                    }
                });
            }
            return {
                success: true,
                data: {
                    totalElements: dom.elements.size,
                    interactiveElements: elementsToShow.length,
                    details: details.slice(0, 20),
                    submitButtons: submitButtons.length
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Debug failed: ${error}`
            };
        }
    }
};
