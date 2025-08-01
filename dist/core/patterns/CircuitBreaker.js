"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerFactory = exports.CircuitBreakerError = exports.CircuitBreaker = exports.CircuitState = void 0;
exports.WithCircuitBreaker = WithCircuitBreaker;
exports.withCircuitBreaker = withCircuitBreaker;
const __1 = require("..");
const ErrorHandlerFactory_1 = require("../error/ErrorHandlerFactory");
var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "CLOSED";
    CircuitState["OPEN"] = "OPEN";
    CircuitState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitState || (exports.CircuitState = CircuitState = {}));
class CircuitBreaker {
    constructor(config) {
        this.config = config;
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.totalRequests = 0;
        this.totalFailures = 0;
        this.halfOpenRequests = 0;
        this.halfOpenSuccesses = 0;
        this.logger = (0, ErrorHandlerFactory_1.createModuleLogger)({
            module: `CircuitBreaker.${this.config.serviceName}`,
            defaultCategory: __1.ErrorCategory.NETWORK
        });
        this.failureThreshold = config.failureThreshold ?? 5;
        this.resetTimeout = config.resetTimeout ?? 60000;
        this.timeout = config.timeout ?? 30000;
        this.successThreshold = config.successThreshold ?? 0.5;
        this.volumeThreshold = config.volumeThreshold ?? 5;
    }
    async execute(operation) {
        this.totalRequests++;
        if (this.state === CircuitState.OPEN) {
            if (Date.now() < this.nextAttempt) {
                return this.handleOpen();
            }
            this.state = CircuitState.HALF_OPEN;
            this.halfOpenRequests = 0;
            this.halfOpenSuccesses = 0;
            this.logger.info(`Circuit moved to HALF_OPEN state for ${this.config.serviceName}`);
        }
        try {
            const result = await this.executeWithTimeout(operation);
            this.onSuccess();
            return result;
        }
        catch (error) {
            return this.onFailure(error);
        }
    }
    async executeWithTimeout(operation) {
        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Operation timed out after ${this.timeout}ms`));
            }, this.timeout);
            try {
                const result = await operation();
                clearTimeout(timeoutId);
                resolve(result);
            }
            catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }
    onSuccess() {
        this.failures = 0;
        this.successes++;
        this.lastSuccessTime = Date.now();
        if (this.state === CircuitState.HALF_OPEN) {
            this.halfOpenRequests++;
            this.halfOpenSuccesses++;
            if (this.halfOpenRequests >= this.volumeThreshold) {
                const successRate = this.halfOpenSuccesses / this.halfOpenRequests;
                if (successRate >= this.successThreshold) {
                    this.state = CircuitState.CLOSED;
                    this.logger.info(`Circuit CLOSED for ${this.config.serviceName} (success rate: ${(successRate * 100).toFixed(1)}%)`);
                }
                else {
                    this.open();
                }
            }
        }
    }
    onFailure(error) {
        this.failures++;
        this.totalFailures++;
        this.lastFailureTime = Date.now();
        const shouldTrigger = this.config.isFailure ? this.config.isFailure(error) : true;
        if (!shouldTrigger) {
            throw error;
        }
        __1.errorHandler.handleError(error, {
            severity: __1.ErrorSeverity.MEDIUM,
            category: __1.ErrorCategory.NETWORK,
            userAction: `${this.config.serviceName} operation`,
            metadata: {
                circuitState: this.state,
                failures: this.failures,
                totalFailures: this.totalFailures
            },
            skipGitHubPost: true
        });
        if (this.state === CircuitState.HALF_OPEN) {
            this.halfOpenRequests++;
            this.open();
        }
        else if (this.state === CircuitState.CLOSED && this.failures >= this.failureThreshold) {
            this.open();
        }
        if (this.config.fallback) {
            this.logger.info(`Using fallback for ${this.config.serviceName}`);
            return this.config.fallback();
        }
        throw error;
    }
    open() {
        this.state = CircuitState.OPEN;
        this.nextAttempt = Date.now() + this.resetTimeout;
        this.logger.warn(`Circuit OPEN for ${this.config.serviceName} after ${this.failures} failures`);
        if (this.failures >= this.failureThreshold * 2) {
            __1.errorHandler.handleError(new Error(`Circuit breaker opened for ${this.config.serviceName}`), {
                severity: __1.ErrorSeverity.HIGH,
                category: __1.ErrorCategory.NETWORK,
                userAction: 'Circuit breaker activation',
                metadata: this.getStats()
            });
        }
    }
    handleOpen() {
        const error = new CircuitBreakerError(`Circuit breaker is OPEN for ${this.config.serviceName}`, this.config.serviceName, this.state);
        if (this.config.fallback) {
            this.logger.debug(`Circuit open, using fallback for ${this.config.serviceName}`);
            return this.config.fallback();
        }
        throw error;
    }
    getStats() {
        const successRate = this.totalRequests > 0
            ? (this.totalRequests - this.totalFailures) / this.totalRequests
            : 0;
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            totalRequests: this.totalRequests,
            totalFailures: this.totalFailures,
            consecutiveFailures: this.failures,
            successRate
        };
    }
    reset() {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.halfOpenRequests = 0;
        this.halfOpenSuccesses = 0;
        this.nextAttempt = undefined;
        this.logger.info(`Circuit reset for ${this.config.serviceName}`);
    }
    forceOpen() {
        this.open();
    }
    forceClose() {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.logger.info(`Circuit force closed for ${this.config.serviceName}`);
    }
}
exports.CircuitBreaker = CircuitBreaker;
class CircuitBreakerError extends Error {
    constructor(message, serviceName, state) {
        super(message);
        this.serviceName = serviceName;
        this.state = state;
        this.name = 'CircuitBreakerError';
    }
}
exports.CircuitBreakerError = CircuitBreakerError;
class CircuitBreakerFactory {
    static getBreaker(config) {
        const existing = this.breakers.get(config.serviceName);
        if (existing) {
            return existing;
        }
        const breaker = new CircuitBreaker(config);
        this.breakers.set(config.serviceName, breaker);
        return breaker;
    }
    static getAllBreakers() {
        return new Map(this.breakers);
    }
    static resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }
    static getAllStats() {
        const stats = {};
        for (const [name, breaker] of this.breakers) {
            stats[name] = breaker.getStats();
        }
        return stats;
    }
}
exports.CircuitBreakerFactory = CircuitBreakerFactory;
CircuitBreakerFactory.breakers = new Map();
function WithCircuitBreaker(config) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const serviceName = `${target.constructor.name}.${propertyKey}`;
        descriptor.value = async function (...args) {
            const breaker = CircuitBreakerFactory.getBreaker({
                ...config,
                serviceName
            });
            return breaker.execute(() => originalMethod.apply(this, args));
        };
        return descriptor;
    };
}
function withCircuitBreaker(fn, config) {
    const breaker = CircuitBreakerFactory.getBreaker(config);
    return (async (...args) => {
        return breaker.execute(() => fn(...args));
    });
}
