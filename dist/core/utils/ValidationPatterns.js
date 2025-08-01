"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormValidator = exports.ValidationBuilder = exports.Validators = void 0;
exports.validate = validate;
exports.isValid = isValid;
exports.createValidator = createValidator;
const ErrorHandlerFactory_1 = require("../error/ErrorHandlerFactory");
const CentralizedErrorHandler_1 = require("../error/CentralizedErrorHandler");
const logger = (0, ErrorHandlerFactory_1.createModuleLogger)({
    module: 'ValidationPatterns',
    defaultCategory: CentralizedErrorHandler_1.ErrorCategory.VALIDATION
});
class Validators {
    static isURL(value, options = {}) {
        if (!value) {
            return { valid: false, error: 'URL is required' };
        }
        try {
            const url = new URL(value);
            const allowedProtocols = options.protocols || ['http:', 'https:'];
            if (!allowedProtocols.includes(url.protocol)) {
                return {
                    valid: false,
                    error: `Protocol ${url.protocol} not allowed. Use: ${allowedProtocols.join(', ')}`
                };
            }
            return { valid: true };
        }
        catch (error) {
            return { valid: false, error: 'Invalid URL format' };
        }
    }
    static isEmail(value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!value) {
            return { valid: false, error: 'Email is required' };
        }
        if (!emailRegex.test(value)) {
            return { valid: false, error: 'Invalid email format' };
        }
        return { valid: true };
    }
    static isSelector(value, type = 'css') {
        if (!value) {
            return { valid: false, error: 'Selector is required' };
        }
        if (type === 'css') {
            try {
                document.createDocumentFragment().querySelector(value);
                return { valid: true };
            }
            catch {
                return { valid: false, error: 'Invalid CSS selector' };
            }
        }
        else {
            if (!value.startsWith('/') && !value.startsWith('//')) {
                return { valid: false, error: 'XPath must start with / or //' };
            }
            return { valid: true };
        }
    }
    static isGitHubToken(value) {
        if (!value) {
            return { valid: false, error: 'GitHub token is required' };
        }
        const validPrefixes = ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'];
        const hasValidPrefix = validPrefixes.some(prefix => value.startsWith(prefix));
        if (!hasValidPrefix && !value.match(/^[a-f0-9]{40}$/)) {
            return {
                valid: false,
                error: 'Invalid GitHub token format',
                details: {
                    hint: 'Token should start with ghp_, gho_, etc. or be a 40-character hex string'
                }
            };
        }
        return { valid: true };
    }
    static isAPIKey(value, options = {}) {
        if (!value) {
            return { valid: false, error: 'API key is required' };
        }
        const { minLength = 20, maxLength = 200, pattern, prefix } = options;
        if (value.length < minLength) {
            return { valid: false, error: `API key must be at least ${minLength} characters` };
        }
        if (value.length > maxLength) {
            return { valid: false, error: `API key must not exceed ${maxLength} characters` };
        }
        if (prefix && !value.startsWith(prefix)) {
            return { valid: false, error: `API key must start with ${prefix}` };
        }
        if (pattern && !pattern.test(value)) {
            return { valid: false, error: 'API key format is invalid' };
        }
        return { valid: true };
    }
    static isPort(value) {
        const port = typeof value === 'string' ? parseInt(value, 10) : value;
        if (isNaN(port)) {
            return { valid: false, error: 'Port must be a number' };
        }
        if (port < 1 || port > 65535) {
            return { valid: false, error: 'Port must be between 1 and 65535' };
        }
        return { valid: true };
    }
    static isTimeout(value) {
        const match = value.match(/^(\d+)(ms|s|m|h)?$/);
        if (!match) {
            return {
                valid: false,
                error: 'Invalid timeout format',
                details: { example: '30s, 5m, 1000ms' }
            };
        }
        const [, amount, unit = 'ms'] = match;
        const num = parseInt(amount, 10);
        if (num <= 0) {
            return { valid: false, error: 'Timeout must be positive' };
        }
        const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000 };
        const ms = num * multipliers[unit];
        if (ms > 3600000) {
            return { valid: false, error: 'Timeout cannot exceed 1 hour' };
        }
        return { valid: true, details: { milliseconds: ms } };
    }
    static isFilePath(value, options = {}) {
        if (!value) {
            return { valid: false, error: 'File path is required' };
        }
        if (value.includes('..') && !options.allowRelative) {
            return { valid: false, error: 'Relative paths with .. are not allowed' };
        }
        if (options.extensions && options.extensions.length > 0) {
            const hasValidExt = options.extensions.some(ext => value.toLowerCase().endsWith(ext.toLowerCase()));
            if (!hasValidExt) {
                return {
                    valid: false,
                    error: `File must have one of these extensions: ${options.extensions.join(', ')}`
                };
            }
        }
        return { valid: true };
    }
    static isJSON(value) {
        try {
            JSON.parse(value);
            return { valid: true };
        }
        catch (error) {
            return {
                valid: false,
                error: 'Invalid JSON format',
                details: { parseError: error instanceof Error ? error.message : String(error) }
            };
        }
    }
    static isSemVer(value) {
        const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
        if (!semverRegex.test(value)) {
            return {
                valid: false,
                error: 'Invalid semantic version',
                details: { example: '1.2.3, 1.0.0-alpha, 2.1.0+build123' }
            };
        }
        return { valid: true };
    }
}
exports.Validators = Validators;
class ValidationBuilder {
    constructor(fieldName) {
        this.validators = [];
        this.fieldName = fieldName;
    }
    custom(validator) {
        this.validators.push(validator);
        return this;
    }
    required(message) {
        this.validators.push((value) => {
            if (value === null || value === undefined || value === '') {
                return { valid: false, error: message || `${this.fieldName} is required` };
            }
            return { valid: true };
        });
        return this;
    }
    length(min, max) {
        this.validators.push((value) => {
            const str = String(value);
            if (min !== undefined && str.length < min) {
                return { valid: false, error: `${this.fieldName} must be at least ${min} characters` };
            }
            if (max !== undefined && str.length > max) {
                return { valid: false, error: `${this.fieldName} must not exceed ${max} characters` };
            }
            return { valid: true };
        });
        return this;
    }
    pattern(regex, message) {
        this.validators.push((value) => {
            if (!regex.test(String(value))) {
                return { valid: false, error: message || `${this.fieldName} format is invalid` };
            }
            return { valid: true };
        });
        return this;
    }
    oneOf(values, message) {
        this.validators.push((value) => {
            if (!values.includes(value)) {
                return {
                    valid: false,
                    error: message || `${this.fieldName} must be one of: ${values.join(', ')}`
                };
            }
            return { valid: true };
        });
        return this;
    }
    range(min, max) {
        this.validators.push((value) => {
            const num = Number(value);
            if (isNaN(num)) {
                return { valid: false, error: `${this.fieldName} must be a number` };
            }
            if (min !== undefined && num < min) {
                return { valid: false, error: `${this.fieldName} must be at least ${min}` };
            }
            if (max !== undefined && num > max) {
                return { valid: false, error: `${this.fieldName} must not exceed ${max}` };
            }
            return { valid: true };
        });
        return this;
    }
    validate(value) {
        for (const validator of this.validators) {
            const result = validator(value);
            if (!result.valid) {
                return result;
            }
        }
        return { valid: true };
    }
    build() {
        return (value) => this.validate(value);
    }
}
exports.ValidationBuilder = ValidationBuilder;
class FormValidator {
    constructor() {
        this.rules = new Map();
    }
    field(name) {
        const builder = new ValidationBuilder(String(name));
        this.rules.set(name, builder);
        return builder;
    }
    validate(data) {
        const errors = {};
        let valid = true;
        for (const [field, builder] of this.rules) {
            const result = builder.validate(data[field]);
            if (!result.valid) {
                errors[String(field)] = result.error;
                valid = false;
            }
        }
        return { valid, errors: errors };
    }
}
exports.FormValidator = FormValidator;
function validate(value, validator) {
    const result = validator(value);
    if (!result.valid) {
        throw new Error(result.error);
    }
}
function isValid(value, validator) {
    return validator(value).valid;
}
function createValidator(name, validationFn, errorMessage) {
    return (value) => {
        if (!validationFn(value)) {
            const error = typeof errorMessage === 'function' ? errorMessage(value) : errorMessage;
            logger.debug(`Validation failed for ${name}: ${error}`);
            return { valid: false, error };
        }
        return { valid: true };
    };
}
