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
exports.ProgressReporterFactory = exports.RateLimitedProgressReporter = exports.CompositeProgressReporter = exports.CommentProgressReporter = exports.ConsoleProgressReporter = exports.NullProgressReporter = void 0;
const core = __importStar(require("@actions/core"));
class NullProgressReporter {
    async report(message) {
        core.debug(`Progress: ${message}`);
    }
}
exports.NullProgressReporter = NullProgressReporter;
class ConsoleProgressReporter {
    async report(message) {
        console.log(message);
    }
}
exports.ConsoleProgressReporter = ConsoleProgressReporter;
class CommentProgressReporter {
    constructor(updateComment, commentId) {
        this.updateComment = updateComment;
        this.commentId = commentId;
    }
    async report(message) {
        await this.updateComment(this.commentId, message);
    }
}
exports.CommentProgressReporter = CommentProgressReporter;
class CompositeProgressReporter {
    constructor(reporters) {
        this.reporters = reporters;
    }
    async report(message) {
        await Promise.all(this.reporters.map(reporter => reporter.report(message)));
    }
}
exports.CompositeProgressReporter = CompositeProgressReporter;
class RateLimitedProgressReporter {
    constructor(delegate) {
        this.delegate = delegate;
        this.lastReport = 0;
        this.minInterval = 1000;
        this.pendingMessage = null;
        this.pendingTimer = null;
    }
    async report(message) {
        const now = Date.now();
        const timeSinceLastReport = now - this.lastReport;
        if (timeSinceLastReport >= this.minInterval) {
            this.lastReport = now;
            await this.delegate.report(message);
        }
        else {
            this.pendingMessage = message;
            if (!this.pendingTimer) {
                const delay = this.minInterval - timeSinceLastReport;
                this.pendingTimer = setTimeout(() => {
                    this.reportPending();
                }, delay);
            }
        }
    }
    async reportPending() {
        if (this.pendingMessage) {
            this.lastReport = Date.now();
            await this.delegate.report(this.pendingMessage);
            this.pendingMessage = null;
            this.pendingTimer = null;
        }
    }
}
exports.RateLimitedProgressReporter = RateLimitedProgressReporter;
class ProgressReporterFactory {
    static createForGitHubComment(updateComment, commentId) {
        const commentReporter = new CommentProgressReporter(updateComment, commentId);
        return new RateLimitedProgressReporter(commentReporter);
    }
    static createComposite(...reporters) {
        return new CompositeProgressReporter(reporters);
    }
    static createNull() {
        return new NullProgressReporter();
    }
}
exports.ProgressReporterFactory = ProgressReporterFactory;
