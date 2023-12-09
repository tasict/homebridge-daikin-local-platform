"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaikinLocalAPI = exports.DaikinDevice = exports.CLIMATE_FAN_SPEED_5 = exports.CLIMATE_FAN_SPEED_4 = exports.CLIMATE_FAN_SPEED_3 = exports.CLIMATE_FAN_SPEED_2 = exports.CLIMATE_FAN_SPEED_1 = exports.CLIMATE_FAN_SPEED_SLIENT = exports.CLIMATE_FAN_SPEED_AUTO = exports.CLIMATE_MODE_DEHUMIDIFY = exports.CLIMATE_MODE_AUTO = exports.CLIMATE_MODE_COOLING = exports.CLIMATE_MODE_HEATING = exports.CLIMATE_MODE_FAN = void 0;
var axios_1 = require("axios");
var const_1 = require("./const");
exports.CLIMATE_MODE_FAN = '0000';
exports.CLIMATE_MODE_HEATING = '0100';
exports.CLIMATE_MODE_COOLING = '0200';
exports.CLIMATE_MODE_AUTO = '0300';
exports.CLIMATE_MODE_DEHUMIDIFY = '0500';
exports.CLIMATE_FAN_SPEED_AUTO = '0A00';
exports.CLIMATE_FAN_SPEED_SLIENT = '0B00';
exports.CLIMATE_FAN_SPEED_1 = '0300';
exports.CLIMATE_FAN_SPEED_2 = '0400';
exports.CLIMATE_FAN_SPEED_3 = '0500';
exports.CLIMATE_FAN_SPEED_4 = '0600';
exports.CLIMATE_FAN_SPEED_5 = '0700';
var CLIMATE_OPERATE_ON = '00';
var CLIMATE_OPERATE_OFF = '01';
var CLIMATE_OPERATE_SETTING = '02';
var COMMAND_QUERY = '{"requests":[{"op":2,"to":"/dsiot/edge.adp_i?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_d?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_f?filter=pv"},{"op":2,"to":"/dsiot/edge.dev_i?filter=pv"},{"op":2,"to":"/dsiot/edge/adr_0100.dgc_status?filter=pv"}]}';
var COMMAND_QUERY_WITH_MD = '{"requests":[{"op":2,"to":"/dsiot/edge.adp_i?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_d?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_f?filter=pv"},{"op":2,"to":"/dsiot/edge.dev_i?filter=pv"},{"op":2,"to":"/dsiot/edge/adr_0100.dgc_status"}]}';
var DaikinDevice = /** @class */ (function () {
    function DaikinDevice(IP, log) {
        this.IP = IP;
        this.log = log;
        this._lastUpdateTimestamp = 0;
        this._callback = null;
        this._IP = IP;
        this._Response = {};
        this._log = log;
    }
    DaikinDevice.prototype.setCallback = function (callback) {
        this._callback = callback;
    };
    DaikinDevice.prototype.queryDevice = function (bForce) {
        if (bForce === void 0) { bForce = false; }
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!bForce && (Date.now() - this._lastUpdateTimestamp) < const_1.SECONDS_BETWEEN_REQUEST) {
                            this.log.debug("Daikin - queryDevice('".concat(this._IP, "'): Skipping query as last update was less than ").concat(const_1.SECONDS_BETWEEN_REQUEST, " micro seconds ago"));
                            return [2 /*return*/, this._Response];
                        }
                        return [4 /*yield*/, axios_1.default.request({
                                method: 'post',
                                url: "http://".concat(this._IP).concat(const_1.ENDPOINT),
                                headers: {
                                    'Accept': 'application/json; charset=UTF-8',
                                    'Content-Type': 'application/json',
                                    'User-Agent': const_1.USER_AGENT,
                                },
                                data: COMMAND_QUERY_WITH_MD,
                            })];
                    case 1:
                        response = _a.sent();
                        this._lastUpdateTimestamp = Date.now();
                        if (response.status === 200) {
                            //this.log.debug(`Daikin - queryDevice('${this._IP}'): Response: '${JSON.stringify(response.data)}'`);
                            return [2 /*return*/, response.data];
                        }
                        this.log.debug("Daikin - queryDevice('".concat(this._IP, "'): Error: Invalid response status code: '").concat(response.status, "'"));
                        return [2 /*return*/, undefined];
                }
            });
        });
    };
    DaikinDevice.prototype.fetchDeviceStatus = function (bForce) {
        if (bForce === void 0) { bForce = false; }
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.queryDevice(bForce)];
                    case 1:
                        response = _a.sent();
                        this._Response = response;
                        this.log.debug("Daikin - fetchDeviceStatus(): Name:' ".concat(this.getDeviceName(), "' MAC:'").concat(this.getMacAddress(), "' Temp: '").concat(this.getIndoorTemperature(), "' Humidity: '").concat(this.getIndoorHumidity(), "' Target Temp: '").concat(this.getTargetTemperature(), "'  Mode: '").concat(this.getOperationModeName(), "' FanSpeed: '").concat(this.getFanSpeedName(), "' "));
                        if (this._callback) {
                            this._callback(this);
                        }
                        return [2 /*return*/, true];
                }
            });
        });
    };
    DaikinDevice.prototype.getMacAddress = function () {
        return this.extractValue(this._Response, '/dsiot/edge.adp_i', 'mac');
    };
    DaikinDevice.prototype.getDeviceName = function () {
        return this.extractValue(this._Response, '/dsiot/edge.adp_d', 'name');
    };
    DaikinDevice.prototype.getDeviceReg = function () {
        return this.extractValue(this._Response, '/dsiot/edge.adp_i', 'reg');
    };
    DaikinDevice.prototype.getDeviceType = function () {
        return this.extractValue(this._Response, '/dsiot/edge.dev_i', 'type') + this.extractValue(this._Response, '/dsiot/edge.adp_i', 'enlv');
    };
    DaikinDevice.prototype.getFirmwareVersion = function () {
        return this.extractValue(this._Response, '/dsiot/edge.adp_i', 'ver');
    };
    DaikinDevice.prototype.getDeviceIP = function () {
        return this._IP;
    };
    DaikinDevice.prototype.getPowerStatus = function () {
        return this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_A002/p_01') === '1';
    };
    DaikinDevice.prototype.getIndoorTemperature = function () {
        return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_A00B/p_01'), 16);
    };
    DaikinDevice.prototype.getIndoorHumidity = function () {
        return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_A00B/p_02'), 16);
    };
    //0000:fan 0100:heating 0200:cooling 0300:auto 0500:dehumidify
    DaikinDevice.prototype.getOperationMode = function () {
        return this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_01');
    };
    DaikinDevice.prototype.getOperationModeName = function () {
        var mode = this.getOperationMode();
        if (mode === exports.CLIMATE_MODE_FAN) {
            return 'Fan';
        }
        else if (mode === exports.CLIMATE_MODE_DEHUMIDIFY) {
            return 'Dehumidify';
        }
        else if (mode === exports.CLIMATE_MODE_AUTO) {
            return 'Auto';
        }
        else if (mode === exports.CLIMATE_MODE_HEATING) {
            return 'Heating';
        }
        else if (mode === exports.CLIMATE_MODE_COOLING) {
            return 'Cooling';
        }
        return 'Unknown';
    };
    DaikinDevice.prototype.getTargetTemperatureWithMode = function (mode) {
        if (mode === exports.CLIMATE_MODE_HEATING) {
            return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_03'), 16) / 2.0;
        }
        else if (mode === exports.CLIMATE_MODE_COOLING) {
            return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_02'), 16) / 2.0;
        }
        else if (mode === exports.CLIMATE_MODE_AUTO) {
            return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_1D'), 16) / 2.0;
        }
        this.log.debug("Daikin - getTargetTemperature(): Error: Invalid mode: '".concat(mode, "'"));
        return 0;
    };
    DaikinDevice.prototype.getTargetTemperature = function () {
        var mode = this.getOperationMode();
        return this.getTargetTemperatureWithMode(mode);
    };
    DaikinDevice.prototype.getTargetTemperatureRange = function () {
        var mode = this.getOperationMode();
        var pn = 'p_02';
        if (mode === exports.CLIMATE_MODE_HEATING) {
            pn = 'p_03';
        }
        else if (mode === exports.CLIMATE_MODE_COOLING) {
            pn = 'p_02';
        }
        else if (mode === exports.CLIMATE_MODE_AUTO) {
            pn = 'p_1D';
        }
        else {
            this.log.debug("Daikin - getTargetTemperatureRange(): Error: Invalid mode: '".concat(mode, "'"));
            return [0, 0];
        }
        var md = this.extractObject(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/' + pn);
        var min = md ? parseInt(md['md']['mi'], 16) / 2.0 : 0;
        var max = md ? parseInt(md['md']['mx'], 16) / 2.0 : 0;
        return [min, max];
    };
    DaikinDevice.prototype.getCoolingThresholdTemperatureRange = function () {
        var md = this.extractObject(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_02');
        var min = md ? parseInt(md['md']['mi'], 16) / 2.0 : 0;
        var max = md ? parseInt(md['md']['mx'], 16) / 2.0 : 0;
        return [min, max];
    };
    DaikinDevice.prototype.getHeatingThresholdTemperatureRange = function () {
        var md = this.extractObject(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_03');
        var min = md ? parseInt(md['md']['mi'], 16) / 2.0 : 0;
        var max = md ? parseInt(md['md']['mx'], 16) / 2.0 : 0;
        return [min, max];
    };
    DaikinDevice.prototype.getFanSpeed = function () {
        var mode = this.getOperationMode();
        var pn = 'p_09';
        if (mode === exports.CLIMATE_MODE_FAN) {
            pn = 'p_28';
        }
        else if (mode === exports.CLIMATE_MODE_DEHUMIDIFY) {
            pn = 'p_27';
        }
        else if (mode === exports.CLIMATE_MODE_AUTO) {
            pn = 'p_26';
        }
        else if (mode === exports.CLIMATE_MODE_HEATING) {
            pn = 'p_0A';
        }
        else if (mode === exports.CLIMATE_MODE_COOLING) {
            pn = 'p_09';
        }
        return this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/' + pn);
    };
    DaikinDevice.prototype.getFanSpeedName = function () {
        var speed = this.getFanSpeed();
        if (speed === exports.CLIMATE_FAN_SPEED_AUTO) {
            return 'Auto';
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_SLIENT) {
            return 'Silent';
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_1) {
            return '1';
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_2) {
            return '2';
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_3) {
            return '3';
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_4) {
            return '4';
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_5) {
            return '5';
        }
        return 'Unknown';
    };
    DaikinDevice.prototype.getFanSpeedNumber = function () {
        var speed = this.getFanSpeed();
        if (speed === exports.CLIMATE_FAN_SPEED_AUTO) {
            return 0;
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_SLIENT) {
            return 1;
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_1) {
            return 2;
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_2) {
            return 3;
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_3) {
            return 4;
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_4) {
            return 5;
        }
        else if (speed === exports.CLIMATE_FAN_SPEED_5) {
            return 6;
        }
        return 0;
    };
    DaikinDevice.prototype.setPowerStatus = function (power) {
        return __awaiter(this, void 0, void 0, function () {
            var command;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        command = [{ "pn": "e_3003", "pch": [{ "pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING }] }, { "pn": "e_A002", "pch": [{ "pn": "p_01", "pv": power ? '01' : '00' }] }];
                        return [4 /*yield*/, this.sendCommand(command)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DaikinDevice.prototype.setOperationMode = function (mode) {
        return __awaiter(this, void 0, void 0, function () {
            var command;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        command = [{ "pn": "e_3003", "pch": [{ "pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING }] }, { "pn": "e_3001", "pch": [{ "pn": "p_01", "pv": mode }] }];
                        return [4 /*yield*/, this.sendCommand(command)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DaikinDevice.prototype.setTargetTemperature = function (temperature) {
        return __awaiter(this, void 0, void 0, function () {
            var mode, pn, pv, command;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mode = this.getOperationMode();
                        pn = 'p_02';
                        pv = (temperature * 2).toString(16);
                        if (mode === exports.CLIMATE_MODE_HEATING) {
                            pn = 'p_03';
                        }
                        else if (mode === exports.CLIMATE_MODE_COOLING) {
                            pn = 'p_02';
                        }
                        else if (mode === exports.CLIMATE_MODE_AUTO) {
                            pn = 'p_1D';
                        }
                        else {
                            return [2 /*return*/, false];
                        }
                        command = [{ "pn": "e_3003", "pch": [{ "pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING }] }, { "pn": "e_3001", "pch": [{ "pn": pn, "pv": pv }] }];
                        return [4 /*yield*/, this.sendCommand(command)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DaikinDevice.prototype.setFanSpeed = function (speed) {
        return __awaiter(this, void 0, void 0, function () {
            var mode, pn, command;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mode = this.getOperationMode();
                        pn = 'p_09';
                        if (mode === exports.CLIMATE_MODE_FAN) {
                            pn = 'p_28';
                        }
                        else if (mode === exports.CLIMATE_MODE_DEHUMIDIFY) {
                            pn = 'p_27';
                        }
                        else if (mode === exports.CLIMATE_MODE_AUTO) {
                            pn = 'p_26';
                        }
                        else if (mode === exports.CLIMATE_MODE_HEATING) {
                            pn = 'p_0A';
                        }
                        else if (mode === exports.CLIMATE_MODE_COOLING) {
                            pn = 'p_09';
                        }
                        command = [{ "pn": "e_3003", "pch": [{ "pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING }] }, { "pn": "e_3001", "pch": [{ "pn": pn, "pv": speed }] }];
                        return [4 /*yield*/, this.sendCommand(command)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    DaikinDevice.prototype.extractValue = function (responsesData, fr, path) {
        try {
            if (responsesData === undefined || responsesData.hasOwnProperty('responses') === false) {
                this.log.debug('Daikin - extractValue(): Error: No responses object found');
                return undefined;
            }
            var currentObject = responsesData['responses'];
            for (var _i = 0, currentObject_1 = currentObject; _i < currentObject_1.length; _i++) {
                var response = currentObject_1[_i];
                if (response['fr'] === fr) {
                    currentObject = response['pc']['pch'];
                }
            }
            var pathKeys = path.split('/');
            for (var i = 0; i < pathKeys.length; i++) {
                try {
                    var key = pathKeys[i];
                    for (var _a = 0, currentObject_2 = currentObject; _a < currentObject_2.length; _a++) {
                        var currentObjectElement = currentObject_2[_a];
                        if ((currentObjectElement['pn'] === key && currentObjectElement.hasOwnProperty('pch'))) {
                            currentObject = currentObjectElement['pch'];
                            break;
                        }
                        else if (currentObjectElement['pn'] === key && currentObjectElement.hasOwnProperty('pv')) {
                            if (i === pathKeys.length - 1) {
                                return currentObjectElement['pv'];
                            }
                        }
                    }
                }
                catch (e) {
                    this.log.debug('Daikin - extractValue(): Error:' + e);
                }
            }
        }
        catch (e) {
            this.log.debug('Daikin - extractValue(): Error:' + e);
        }
        this.log.debug('Daikin - extractValue(): Error: No value found for path:' + path);
        return undefined;
    };
    DaikinDevice.prototype.extractObject = function (responsesData, fr, path) {
        try {
            if (responsesData === undefined || responsesData.hasOwnProperty('responses') === false) {
                this.log.debug('Daikin - extractObject(): Error: No responses object found');
                return undefined;
            }
            var currentObject = responsesData['responses'];
            for (var _i = 0, currentObject_3 = currentObject; _i < currentObject_3.length; _i++) {
                var response = currentObject_3[_i];
                if (response['fr'] === fr) {
                    currentObject = response['pc']['pch'];
                }
            }
            var pathKeys = path.split('/');
            for (var _a = 0, pathKeys_1 = pathKeys; _a < pathKeys_1.length; _a++) {
                var key = pathKeys_1[_a];
                try {
                    for (var _b = 0, currentObject_4 = currentObject; _b < currentObject_4.length; _b++) {
                        var currentObjectElement = currentObject_4[_b];
                        if (currentObjectElement['pn'] === key && currentObjectElement.hasOwnProperty('pch')) {
                            currentObject = currentObjectElement['pch'];
                            break;
                        }
                        else if (currentObjectElement['pn'] === key && currentObjectElement.hasOwnProperty('pv')) {
                            return currentObjectElement;
                        }
                    }
                }
                catch (e) {
                    this.log.debug('Daikin - extractValue(): Error:' + e);
                }
            }
        }
        catch (e) {
            this.log.debug('Daikin - extractValue(): Error:' + e);
        }
        this.log.debug('Daikin - extractValue(): Error: No value found for path:' + path);
        return undefined;
    };
    DaikinDevice.prototype.sendCommand = function (command) {
        return __awaiter(this, void 0, void 0, function () {
            var param, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        param = { "requests": [{ "op": 3, "to": "/dsiot/edge/adr_0100.dgc_status", "pc": { "pn": "dgc_status", "pch": [{ "pn": "e_1002", "pch": command }] } }] };
                        return [4 /*yield*/, axios_1.default.request({
                                method: 'post',
                                url: "http://".concat(this._IP).concat(const_1.ENDPOINT),
                                headers: {
                                    'Accept': 'application/json; charset=UTF-8',
                                    'Content-Type': 'application/json',
                                    'User-Agent': const_1.USER_AGENT,
                                },
                                data: JSON.stringify(param),
                            })];
                    case 1:
                        response = _a.sent();
                        if (response.status === 200) {
                            this.log.debug("Daikin - sendCommand('".concat(this._IP, "'):  '").concat(JSON.stringify(param), " ' : Response: '").concat(JSON.stringify(response.data), "'"));
                        }
                        else {
                            this.log.debug("Daikin - sendCommand('".concat(this._IP, "'): '").concat(JSON.stringify(param), " ' : Error: Invalid response status code: '").concat(response.status, "'"));
                        }
                        return [4 /*yield*/, this.fetchDeviceStatus(true)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, response.status === 200];
                }
            });
        });
    };
    return DaikinDevice;
}());
exports.DaikinDevice = DaikinDevice;
var DaikinLocalAPI = /** @class */ (function () {
    function DaikinLocalAPI(log) {
        this.log = log;
        this._devices = [];
    }
    DaikinLocalAPI.prototype.fetchDevices = function (climateIPs, bForce) {
        if (bForce === void 0) { bForce = false; }
        return __awaiter(this, void 0, void 0, function () {
            var _i, climateIPs_1, ip, daikinDevice;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.log.debug('Daikin: fetchDevices()');
                        this._devices = [];
                        _i = 0, climateIPs_1 = climateIPs;
                        _a.label = 1;
                    case 1:
                        if (!(_i < climateIPs_1.length)) return [3 /*break*/, 4];
                        ip = climateIPs_1[_i];
                        daikinDevice = new DaikinDevice(ip, this.log);
                        return [4 /*yield*/, daikinDevice.fetchDeviceStatus(bForce)];
                    case 2:
                        if (_a.sent()) {
                            this._devices.push(daikinDevice);
                        }
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, this._devices];
                }
            });
        });
    };
    return DaikinLocalAPI;
}());
exports.DaikinLocalAPI = DaikinLocalAPI;
