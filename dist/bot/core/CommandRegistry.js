"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRegistryBuilder = exports.DefaultCommandRegistry = void 0;
class DefaultCommandRegistry {
    constructor() {
        this.handlers = [];
    }
    register(handler) {
        this.handlers.push(handler);
    }
    getHandler(command) {
        return this.handlers.find(handler => handler.canHandle(command)) || null;
    }
    getAllHandlers() {
        return [...this.handlers];
    }
    generateHelpText() {
        const helpTexts = this.handlers
            .map(handler => handler.getHelpText())
            .filter(text => text.length > 0);
        return `## 🔧 YoFix Bot - Available Commands\n\n${helpTexts.join('\n')}`;
    }
}
exports.DefaultCommandRegistry = DefaultCommandRegistry;
class CommandRegistryBuilder {
    constructor() {
        this.registry = new DefaultCommandRegistry();
    }
    add(handler) {
        this.registry.register(handler);
        return this;
    }
    addMany(handlers) {
        handlers.forEach(handler => this.registry.register(handler));
        return this;
    }
    build() {
        return this.registry;
    }
}
exports.CommandRegistryBuilder = CommandRegistryBuilder;
