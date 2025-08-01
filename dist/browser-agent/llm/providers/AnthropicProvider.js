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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
const LLMProvider_1 = require("./LLMProvider");
const core = __importStar(require("@actions/core"));
const config_1 = __importDefault(require("../../../config"));
class AnthropicProvider extends LLMProvider_1.LLMProvider {
    constructor(config) {
        super(config);
    }
    async initializeClient() {
        if (!this.claude) {
            const { Anthropic } = await Promise.resolve().then(() => __importStar(require('@anthropic-ai/sdk')));
            this.claude = new Anthropic({
                apiKey: this.config.apiKey
            });
        }
    }
    async complete(prompt, systemPrompt) {
        await this.initializeClient();
        try {
            const response = await this.claude.messages.create({
                model: this.config.model || config_1.default.get('ai.claude.defaultModel'),
                max_tokens: this.config.maxTokens || 1024,
                temperature: this.config.temperature || 0.3,
                system: systemPrompt || this.getSystemPrompt(),
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });
            const content = response.content[0];
            const text = content.type === 'text' ? content.text : '';
            core.debug(`LLM Response: ${text}`);
            return this.parseResponse(text);
        }
        catch (error) {
            core.error(`Anthropic API error: ${error}`);
            throw error;
        }
    }
    getSystemPrompt() {
        return `You are Claude, a browser automation agent powered by Anthropic. ${super.getSystemPrompt()}
    
Additional capabilities:
- You can see and analyze screenshots when provided
- You understand complex web layouts and can identify UI patterns
- You can handle multi-step workflows intelligently
- You learn from previous actions to improve success rates

When you see indexed elements like [0], [1], [2], use the index parameter to interact with them.
For example: click index=0 to click the first interactive element.`;
    }
}
exports.AnthropicProvider = AnthropicProvider;
