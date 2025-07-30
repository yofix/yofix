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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
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
exports.authActions = exports.visualTestingActions = exports.extractionActions = exports.interactionActions = exports.navigateActions = exports.registerBuiltInActions = exports.AnthropicProvider = exports.LLMProvider = exports.PromptBuilder = exports.StateManager = exports.ActionRegistry = exports.DOMIndexer = exports.Agent = void 0;
exports.runAgent = runAgent;
var Agent_1 = require("./core/Agent");
Object.defineProperty(exports, "Agent", { enumerable: true, get: function () { return Agent_1.Agent; } });
var DOMIndexer_1 = require("./core/DOMIndexer");
Object.defineProperty(exports, "DOMIndexer", { enumerable: true, get: function () { return DOMIndexer_1.DOMIndexer; } });
var ActionRegistry_1 = require("./core/ActionRegistry");
Object.defineProperty(exports, "ActionRegistry", { enumerable: true, get: function () { return ActionRegistry_1.ActionRegistry; } });
var StateManager_1 = require("./core/StateManager");
Object.defineProperty(exports, "StateManager", { enumerable: true, get: function () { return StateManager_1.StateManager; } });
var PromptBuilder_1 = require("./llm/PromptBuilder");
Object.defineProperty(exports, "PromptBuilder", { enumerable: true, get: function () { return PromptBuilder_1.PromptBuilder; } });
var LLMProvider_1 = require("./llm/providers/LLMProvider");
Object.defineProperty(exports, "LLMProvider", { enumerable: true, get: function () { return LLMProvider_1.LLMProvider; } });
var AnthropicProvider_1 = require("./llm/providers/AnthropicProvider");
Object.defineProperty(exports, "AnthropicProvider", { enumerable: true, get: function () { return AnthropicProvider_1.AnthropicProvider; } });
var actions_1 = require("./actions");
Object.defineProperty(exports, "registerBuiltInActions", { enumerable: true, get: function () { return actions_1.registerBuiltInActions; } });
var navigation_1 = require("./actions/navigation");
Object.defineProperty(exports, "navigateActions", { enumerable: true, get: function () { return navigation_1.navigateActions; } });
var interaction_1 = require("./actions/interaction");
Object.defineProperty(exports, "interactionActions", { enumerable: true, get: function () { return interaction_1.interactionActions; } });
var extraction_1 = require("./actions/extraction");
Object.defineProperty(exports, "extractionActions", { enumerable: true, get: function () { return extraction_1.extractionActions; } });
var visual_1 = require("./actions/visual");
Object.defineProperty(exports, "visualTestingActions", { enumerable: true, get: function () { return visual_1.visualTestingActions; } });
var auth_1 = require("./actions/auth");
Object.defineProperty(exports, "authActions", { enumerable: true, get: function () { return auth_1.authActions; } });
__exportStar(require("./types"), exports);
async function runAgent(task, options) {
    const { Agent } = await Promise.resolve().then(() => __importStar(require('./core/Agent')));
    const agent = new Agent(task, options);
    try {
        await agent.initialize();
        const result = await agent.run();
        return result;
    }
    finally {
        await agent.cleanup();
    }
}
