"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeGuards = void 0;
exports.safeJSONParse = safeJSONParse;
exports.parseJSONAs = parseJSONAs;
exports.safeJSONStringify = safeJSONStringify;
exports.jsonClone = jsonClone;
exports.mergeJSON = mergeJSON;
const ErrorHandlerFactory_1 = require("../error/ErrorHandlerFactory");
const CentralizedErrorHandler_1 = require("../error/CentralizedErrorHandler");
const logger = (0, ErrorHandlerFactory_1.createModuleLogger)({
    module: 'JSONParser',
    defaultCategory: CentralizedErrorHandler_1.ErrorCategory.PROCESSING
});
function safeJSONParse(content, options = {}) {
    if (options.maxLength && content.length > options.maxLength) {
        return {
            success: false,
            error: `Content exceeds maximum length of ${options.maxLength} characters`,
            metadata: { truncated: true }
        };
    }
    try {
        let jsonContent = content.trim();
        let sourceFormat = 'raw';
        if (options.extractFromMarkdown) {
            const extracted = extractJSONFromMarkdown(jsonContent);
            if (extracted) {
                jsonContent = extracted;
                sourceFormat = 'markdown';
            }
        }
        try {
            const parsed = JSON.parse(jsonContent);
            if (options.validate && !options.validate(parsed)) {
                throw new Error('Validation failed');
            }
            const result = options.transform ? options.transform(parsed) : parsed;
            return {
                success: true,
                data: result,
                metadata: { sourceFormat, objectCount: 1 }
            };
        }
        catch (error) {
            if (options.allowMultiple) {
                const multiResult = parseMultipleJSON(jsonContent, options);
                if (multiResult.success) {
                    return multiResult;
                }
            }
            throw error;
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.debug(`JSON parse failed: ${errorMessage}`, {
            contentPreview: content.substring(0, 100)
        });
        if (options.defaultValue !== undefined) {
            return {
                success: true,
                data: options.defaultValue,
                error: errorMessage,
                metadata: { sourceFormat: 'raw' }
            };
        }
        return {
            success: false,
            error: `Failed to parse JSON: ${errorMessage}`
        };
    }
}
function parseMultipleJSON(content, options) {
    const objects = [];
    const lines = content.split('\n');
    let currentObject = '';
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    for (const line of lines) {
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            currentObject += char;
            if (escapeNext) {
                escapeNext = false;
                continue;
            }
            if (char === '\\') {
                escapeNext = true;
                continue;
            }
            if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
            }
            if (!inString) {
                if (char === '{')
                    braceCount++;
                if (char === '}')
                    braceCount--;
                if (braceCount === 0 && currentObject.trim()) {
                    try {
                        const parsed = JSON.parse(currentObject);
                        if (!options.validate || options.validate(parsed)) {
                            const result = options.transform ? options.transform(parsed) : parsed;
                            objects.push(result);
                        }
                    }
                    catch (error) {
                        logger.debug(`Skipping invalid JSON object: ${error}`);
                    }
                    currentObject = '';
                }
            }
        }
    }
    if (objects.length > 0) {
        return {
            success: true,
            data: objects,
            metadata: {
                sourceFormat: 'multiple',
                objectCount: objects.length
            }
        };
    }
    return {
        success: false,
        error: 'No valid JSON objects found'
    };
}
function extractJSONFromMarkdown(content) {
    const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
    const matches = Array.from(content.matchAll(codeBlockRegex));
    for (const match of matches) {
        const possibleJSON = match[1].trim();
        try {
            JSON.parse(possibleJSON);
            return possibleJSON;
        }
        catch {
        }
    }
    const jsonRegex = /(\{[\s\S]*\}|\[[\s\S]*\])/;
    const match = content.match(jsonRegex);
    if (match) {
        try {
            JSON.parse(match[1]);
            return match[1];
        }
        catch {
        }
    }
    return null;
}
function parseJSONAs(content, typeGuard, options = {}) {
    const result = safeJSONParse(content, {
        ...options,
        validate: typeGuard
    });
    if (result.success && !typeGuard(result.data)) {
        return {
            success: false,
            error: 'Parsed data does not match expected type'
        };
    }
    return result;
}
exports.TypeGuards = {
    isString: (data) => typeof data === 'string',
    isNumber: (data) => typeof data === 'number',
    isBoolean: (data) => typeof data === 'boolean',
    isArray: (data) => Array.isArray(data),
    isObject: (data) => data !== null && typeof data === 'object' && !Array.isArray(data),
    isStringArray: (data) => Array.isArray(data) && data.every(item => typeof item === 'string'),
    hasProperty: (key) => (data) => data !== null && typeof data === 'object' && key in data
};
function safeJSONStringify(data, options = {}) {
    try {
        const seen = new WeakSet();
        const replacer = (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular]';
                }
                seen.add(value);
            }
            return options.replacer ? options.replacer(key, value) : value;
        };
        const result = JSON.stringify(data, replacer, options.pretty ? 2 : undefined);
        return {
            success: true,
            data: result
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`JSON stringify failed: ${errorMessage}`);
        return {
            success: false,
            error: `Failed to stringify JSON: ${errorMessage}`
        };
    }
}
function jsonClone(data) {
    const stringified = safeJSONStringify(data);
    if (!stringified.success)
        return null;
    const parsed = safeJSONParse(stringified.data);
    return parsed.success ? parsed.data : null;
}
function mergeJSON(...objects) {
    const result = {};
    for (const obj of objects) {
        if (obj && typeof obj === 'object') {
            Object.assign(result, jsonClone(obj) || obj);
        }
    }
    return result;
}
