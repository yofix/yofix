"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authActions = exports.visualTestingActions = exports.extractionActions = exports.interactionActions = exports.navigateActions = void 0;
exports.registerBuiltInActions = registerBuiltInActions;
const navigation_1 = require("./navigation");
const interaction_1 = require("./interaction");
const extraction_1 = require("./extraction");
const visual_1 = require("./visual");
const auth_1 = require("./auth");
function registerBuiltInActions(registry, llmProvider) {
    navigation_1.navigateActions.forEach(({ definition, handler }) => {
        registry.register(definition, handler);
    });
    const interactionActionsWithLLM = (0, interaction_1.getInteractionActions)(llmProvider);
    interactionActionsWithLLM.forEach(({ definition, handler }) => {
        registry.register(definition, handler);
    });
    extraction_1.extractionActions.forEach(({ definition, handler }) => {
        registry.register(definition, handler);
    });
    visual_1.visualTestingActions.forEach(({ definition, handler }) => {
        registry.register(definition, handler);
    });
    auth_1.authActions.forEach(({ definition, handler }) => {
        registry.register(definition, handler);
    });
}
var navigation_2 = require("./navigation");
Object.defineProperty(exports, "navigateActions", { enumerable: true, get: function () { return navigation_2.navigateActions; } });
var interaction_2 = require("./interaction");
Object.defineProperty(exports, "interactionActions", { enumerable: true, get: function () { return interaction_2.interactionActions; } });
var extraction_2 = require("./extraction");
Object.defineProperty(exports, "extractionActions", { enumerable: true, get: function () { return extraction_2.extractionActions; } });
var visual_2 = require("./visual");
Object.defineProperty(exports, "visualTestingActions", { enumerable: true, get: function () { return visual_2.visualTestingActions; } });
var auth_2 = require("./auth");
Object.defineProperty(exports, "authActions", { enumerable: true, get: function () { return auth_2.authActions; } });
