"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslog_1 = require("tslog");
/**
 * Decorates the Homebridge logger to only log debug messages when debug mode is enabled.
 */
var DaikinPlatformLogger = /** @class */ (function () {
    function DaikinPlatformLogger(logger, debugMode) {
        if (logger === void 0) { logger = undefined; }
        if (debugMode === void 0) { debugMode = false; }
        this.logger = logger;
        this.debugMode = debugMode;
        this.tsLogger = new tslog_1.Logger();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DaikinPlatformLogger.prototype.debug = function () {
        var messages = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            messages[_i] = arguments[_i];
        }
        if (this.debugMode) {
            for (var i = 0; i < messages.length; i++) {
                if (this.logger !== undefined)
                    this.logger.debug(messages[i]);
                else
                    this.tsLogger.debug(messages[i]);
            }
        }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DaikinPlatformLogger.prototype.info = function () {
        var messages = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            messages[_i] = arguments[_i];
        }
        for (var i = 0; i < messages.length; i++) {
            if (this.logger !== undefined)
                this.logger.info(messages[i]);
            else
                this.tsLogger.info(messages[i]);
        }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DaikinPlatformLogger.prototype.error = function () {
        var messages = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            messages[_i] = arguments[_i];
        }
        for (var i = 0; i < messages.length; i++) {
            if (this.logger !== undefined)
                this.logger.error(messages[i]);
            else
                this.tsLogger.error(messages[i]);
        }
    };
    return DaikinPlatformLogger;
}());
exports.default = DaikinPlatformLogger;
