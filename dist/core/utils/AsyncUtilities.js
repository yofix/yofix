"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTimeout = withTimeout;
exports.delay = delay;
exports.sleep = sleep;
exports.retryWithBackoff = retryWithBackoff;
exports.throttle = throttle;
exports.debounce = debounce;
exports.concurrent = concurrent;
exports.createDeferred = createDeferred;
exports.parseTimeout = parseTimeout;
exports.allSettled = allSettled;
exports.raceWithCleanup = raceWithCleanup;
const ErrorHandlerFactory_1 = require("../error/ErrorHandlerFactory");
const CentralizedErrorHandler_1 = require("../error/CentralizedErrorHandler");
const logger = (0, ErrorHandlerFactory_1.createModuleLogger)({
    module: 'AsyncUtilities',
    defaultCategory: CentralizedErrorHandler_1.ErrorCategory.PROCESSING
});
async function withTimeout(promise, timeoutMs, options = {}) {
    const { message = `Operation timed out after ${timeoutMs}ms`, error = new Error(message), onTimeout } = options;
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(async () => {
            if (onTimeout) {
                try {
                    await onTimeout();
                }
                catch (cleanupError) {
                    logger.warn('Timeout cleanup failed', cleanupError);
                }
            }
            reject(error);
        }, timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    }
    catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}
function delay(ms, options = {}) {
    let timeoutId;
    let rejectFn;
    const promise = new Promise((resolve, reject) => {
        rejectFn = reject;
        timeoutId = setTimeout(resolve, ms);
    });
    const cancel = () => {
        clearTimeout(timeoutId);
        if (options.onCancel) {
            options.onCancel();
        }
        if (options.cancellable) {
            rejectFn(new Error('Delay cancelled'));
        }
    };
    return { promise, cancel };
}
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function retryWithBackoff(fn, options = {}) {
    const { maxAttempts = 3, initialDelay = 1000, maxDelay = 30000, factor = 2, onRetry, shouldRetry = () => true } = options;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxAttempts || !shouldRetry(lastError, attempt)) {
                throw lastError;
            }
            const nextDelay = Math.min(initialDelay * Math.pow(factor, attempt - 1), maxDelay);
            if (onRetry) {
                await onRetry(attempt, lastError, nextDelay);
            }
            await sleep(nextDelay);
        }
    }
    throw lastError;
}
function throttle(fn, waitMs, options = {}) {
    const { leading = true, trailing = true } = options;
    let timeoutId = null;
    let lastCallTime = 0;
    let lastArgs = null;
    let result;
    const throttled = function (...args) {
        const now = Date.now();
        const remaining = waitMs - (now - lastCallTime);
        lastArgs = args;
        if (remaining <= 0 || remaining > waitMs) {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            lastCallTime = now;
            if (leading) {
                result = fn.apply(this, args);
            }
        }
        else if (!timeoutId && trailing) {
            timeoutId = setTimeout(() => {
                lastCallTime = Date.now();
                timeoutId = null;
                if (lastArgs) {
                    result = fn.apply(this, lastArgs);
                }
            }, remaining);
        }
        return result;
    };
    throttled.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        lastArgs = null;
    };
    throttled.flush = () => {
        if (timeoutId && lastArgs) {
            clearTimeout(timeoutId);
            result = fn.apply(throttled, lastArgs);
            timeoutId = null;
            lastArgs = null;
            lastCallTime = Date.now();
        }
    };
    return throttled;
}
function debounce(fn, waitMs, options = {}) {
    const { leading = false, maxWait } = options;
    let timeoutId = null;
    let maxTimeoutId = null;
    let lastCallTime = 0;
    let lastArgs = null;
    let result;
    const debounced = function (...args) {
        const now = Date.now();
        lastArgs = args;
        const later = () => {
            timeoutId = null;
            maxTimeoutId = null;
            lastCallTime = 0;
            if (!leading && lastArgs) {
                result = fn.apply(this, lastArgs);
            }
        };
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        if (leading && !lastCallTime) {
            result = fn.apply(this, args);
        }
        timeoutId = setTimeout(later, waitMs);
        if (maxWait && !maxTimeoutId) {
            maxTimeoutId = setTimeout(() => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                later();
            }, maxWait);
        }
        lastCallTime = now;
        return result;
    };
    debounced.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        if (maxTimeoutId) {
            clearTimeout(maxTimeoutId);
            maxTimeoutId = null;
        }
        lastArgs = null;
        lastCallTime = 0;
    };
    debounced.flush = () => {
        if (timeoutId && lastArgs) {
            clearTimeout(timeoutId);
            if (maxTimeoutId) {
                clearTimeout(maxTimeoutId);
            }
            result = fn.apply(debounced, lastArgs);
            timeoutId = null;
            maxTimeoutId = null;
            lastArgs = null;
            lastCallTime = 0;
        }
    };
    return debounced;
}
async function concurrent(tasks, options) {
    const { concurrency, throwOnError = false, onProgress } = options;
    const results = [];
    const executing = [];
    let completed = 0;
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const promise = (async () => {
            try {
                const data = await task();
                results[i] = { success: true, data };
            }
            catch (error) {
                results[i] = { success: false, error: error };
                if (throwOnError) {
                    throw error;
                }
            }
            finally {
                completed++;
                if (onProgress) {
                    onProgress(completed, tasks.length);
                }
            }
        })();
        executing.push(promise);
        if (executing.length >= concurrency) {
            await Promise.race(executing);
            executing.splice(executing.findIndex(p => p === promise), 1);
        }
    }
    await Promise.all(executing);
    return results;
}
function createDeferred() {
    let resolve;
    let reject;
    let isResolved = false;
    let isRejected = false;
    const promise = new Promise((res, rej) => {
        resolve = (value) => {
            isResolved = true;
            res(value);
        };
        reject = (reason) => {
            isRejected = true;
            rej(reason);
        };
    });
    return { promise, resolve: resolve, reject: reject, isResolved, isRejected };
}
function parseTimeout(timeout) {
    if (typeof timeout === 'number') {
        return timeout;
    }
    const match = timeout.match(/^(\d+)(ms|s|m|h)?$/);
    if (!match) {
        throw new Error(`Invalid timeout format: ${timeout}`);
    }
    const [, amount, unit = 'ms'] = match;
    const multipliers = {
        ms: 1,
        s: 1000,
        m: 60000,
        h: 3600000
    };
    return parseInt(amount, 10) * multipliers[unit];
}
async function allSettled(promises) {
    return Promise.all(promises.map(async (promise) => {
        try {
            const value = await promise;
            return { status: 'fulfilled', value };
        }
        catch (reason) {
            return { status: 'rejected', reason };
        }
    }));
}
async function raceWithCleanup(promises, timeoutMs) {
    const cleanupFns = promises.map(p => p.cleanup).filter(Boolean);
    try {
        const racers = promises.map(p => p.promise);
        if (timeoutMs) {
            const timeoutPromise = withTimeout(Promise.race(racers), timeoutMs, {
                onTimeout: async () => {
                    await Promise.all(cleanupFns.map(fn => fn?.()));
                }
            });
            return await timeoutPromise;
        }
        return await Promise.race(racers);
    }
    finally {
        setTimeout(() => {
            cleanupFns.forEach(fn => fn?.());
        }, 0);
    }
}
