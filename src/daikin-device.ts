import DaikinPlatformLogger from './logger';
import axios, { AxiosRequestConfig } from 'axios';
import rateLimit from 'axios-rate-limit';

import {
  MIN_REQUEST_INTERVAL_MS
} from './const';

export const CLIMATE_MODE_FAN = '0000';
export const CLIMATE_MODE_HEATING = '0100';
export const CLIMATE_MODE_COOLING = '0200';
export const CLIMATE_MODE_AUTO = '0300';
export const CLIMATE_MODE_DEHUMIDIFY = '0500';
export const CLIMATE_MODE_HUMIDIFY = '0800';

export const CLIMATE_FAN_SPEED_AUTO = '0A00';
export const CLIMATE_FAN_SPEED_SLIENT = '0B00';
export const CLIMATE_FAN_SPEED_1 = '0300';
export const CLIMATE_FAN_SPEED_2 = '0400';
export const CLIMATE_FAN_SPEED_3 = '0500';
export const CLIMATE_FAN_SPEED_4 = '0600';
export const CLIMATE_FAN_SPEED_5 = '0700';

export const MODE_NAME_BY_CODE: Record<string, string> = {
  [CLIMATE_MODE_FAN]: 'Fan',
  [CLIMATE_MODE_HEATING]: 'Heating',
  [CLIMATE_MODE_COOLING]: 'Cooling',
  [CLIMATE_MODE_AUTO]: 'Auto',
  [CLIMATE_MODE_DEHUMIDIFY]: 'Dehumidify',
  [CLIMATE_MODE_HUMIDIFY]: 'Humidify',
};

// Bidirectional mapping between Daikin fan-speed codes, the HomeKit rotation-speed
// step (0 = auto ... 6 = level 5) and the human-readable name.
export const FAN_SPEED_TABLE: { code: string; number: number; name: string }[] = [
  { code: CLIMATE_FAN_SPEED_AUTO, number: 0, name: 'Auto' },
  { code: CLIMATE_FAN_SPEED_SLIENT, number: 1, name: 'Silent' },
  { code: CLIMATE_FAN_SPEED_1, number: 2, name: '1' },
  { code: CLIMATE_FAN_SPEED_2, number: 3, name: '2' },
  { code: CLIMATE_FAN_SPEED_3, number: 4, name: '3' },
  { code: CLIMATE_FAN_SPEED_4, number: 5, name: '4' },
  { code: CLIMATE_FAN_SPEED_5, number: 6, name: '5' },
];

// Energy counters as the unit reports them (dsiot `i_power`). Arrays are
// chronological: dailyWh ends with today, thisYearKWh with the current month.
export interface EnergyHistory {
  todayRuntimeMinutes: number;
  dailyWh: number[];          // last 7 days, 100 Wh resolution
  thisYearKWh: number[];      // Jan .. current month
  previousYearKWh: number[];  // Jan .. Dec
  utcOffsetMinutes?: number;  // the unit's time zone, which sets its day boundary
}

// One request at a time across every device so a burst of HomeKit reads
// cannot flood the units.
const http = rateLimit(axios.create(), { maxRequests: 1, perMilliseconds: 500 });

// Protocol-independent Daikin device. Subclasses implement one wire protocol
// each (see DaikinDsiotDevice and DaikinBRP069Device); every getter/setter
// exchanges values in the shared CLIMATE_MODE_* / CLIMATE_FAN_SPEED_* codes so
// the accessory layer never needs to know which protocol is underneath.
export abstract class DaikinDevice {

  protected _IP: string;
  protected _Response: object;
  protected _log: DaikinPlatformLogger;
  protected _lastUpdateTimestamp: number = 0;
  // Status listeners: a unit being migrated has both a HAP and a Matter accessory.
  protected _callbacks: ((device: DaikinDevice) => void)[] = [];
  // Shared promise for an in-flight query so concurrent reads don't each hit the unit.
  protected _inflightQuery: Promise<any> | null = null;

  constructor(
    public readonly IP: string,
    protected readonly log: DaikinPlatformLogger,
  ) {
    this._IP = IP;
    this._Response = {};
    this._log = log;
  }

  public addCallback(callback: (device: DaikinDevice) => void) {
    this._callbacks.push(callback);
  }

  protected async request(config: AxiosRequestConfig): Promise<any> {
    return http.request(config);
  }

  public async queryDevice(bForce:boolean = false): Promise<any> {

    if(!bForce) {
      if((Date.now() - this._lastUpdateTimestamp) < MIN_REQUEST_INTERVAL_MS) {
        this.log.debug(`Daikin - queryDevice('${this._IP}'): Skipping query as last update was less than ${MIN_REQUEST_INTERVAL_MS} ms ago`);
        return this._Response;
      }

      // Coalesce concurrent (non-forced) reads onto a single request.
      if(this._inflightQuery) {
        return this._inflightQuery;
      }
    }

    const request = this._doQuery();

    if(!bForce) {
      this._inflightQuery = request;
    }

    try {
      return await request;
    }
    finally {
      if(this._inflightQuery === request) {
        this._inflightQuery = null;
      }
    }
  }

  protected abstract _doQuery(): Promise<any>;

  // Short human-readable protocol tag used in discovery logs.
  public abstract getProtocolName(): string;

  // Lightweight protocol check used during discovery; must stay quiet on
  // failure (debug only) since probing the wrong protocol is expected.
  public abstract probe(): Promise<boolean>;

  public async fetchDeviceStatus(bForce:boolean = false): Promise<boolean> {

    const response = await this.queryDevice(bForce);

    if(response === undefined) {
      this.log.error(`Daikin - fetchDeviceStatus('${this._IP}', ${bForce}): Error: No response from device`);
      return false;
    }


    if(!this.getMacAddress()){
      this.log.error(`Daikin - fetchDeviceStatus(${bForce}): Error: ${this._IP} no MAC address found`);
      this.log.debug(`Daikin - fetchDeviceStatus(${bForce}): Response: '${this._Response}'`);
      return false;
    }


    this.log.debug(`Daikin - fetchDeviceStatus(${bForce}): Name: ${this.getDeviceName()} MAC:${this.getMacAddress()} Power:${this.getPowerStatus()} Temp:${this.getIndoorTemperature()} Humidity:${this.getIndoorHumidity()} Target Temp:${this.getTargetTemperature()}'  Mode:${this.getOperationModeName()} FanSpeed:${this.getFanSpeedName()} `);

    this._callbacks.forEach((callback) => callback(this));

    return true;
  }

  public getDeviceIP(): string {
    return this._IP;
  }

  public abstract getMacAddress(): string;

  public abstract getSSID(): string;

  public abstract getDeviceName(): string;

  public abstract getDeviceReg(): string;

  public abstract getDeviceType(): string;

  public abstract getFirmwareVersion(): string;

  public abstract getPowerStatus(): boolean;

  public abstract setPowerStatus(power: boolean): Promise<boolean>;

  public abstract getIndoorTemperature(): number;

  public abstract getIndoorHumidity(): number;

  public abstract getOutdoorTemperature(): number;

  // Returns one of the CLIMATE_MODE_* codes.
  public abstract getOperationMode(): string;

  public abstract setOperationMode(mode: string): Promise<boolean>;

  public abstract supportsOperationMode(mode: string): boolean;

  public getOperationModeName(): string {

    return MODE_NAME_BY_CODE[this.getOperationMode()] ?? 'Unknown';

  }

  public getSupportedOperationModeNames(): string[] {

    return Object.keys(MODE_NAME_BY_CODE)
      .filter(mode => this.supportsOperationMode(mode))
      .map(mode => MODE_NAME_BY_CODE[mode]);
  }

  public abstract getTargetTemperatureWithMode(mode:string): number;

  public getTargetTemperature(): number {

    const mode = this.getOperationMode();

    return this.getTargetTemperatureWithMode(mode);

  }

  public abstract setTargetTemperature(temperature: number): Promise<boolean>;

  public abstract getTargetTemperatureRange(): number[];

  public abstract getCoolingThresholdTemperatureRange(): number[];

  public abstract getHeatingThresholdTemperatureRange(): number[];

  // Returns one of the CLIMATE_FAN_SPEED_* codes.
  public abstract getFanSpeed(): string;

  public abstract setFanSpeed(speed: string): Promise<boolean>;

  public getFanSpeedName(): string {

    const speed = this.getFanSpeed();

    return FAN_SPEED_TABLE.find(entry => entry.code === speed)?.name ?? 'Unknown';
  }

  public getFanSpeedNumber(): number {

    const speed = this.getFanSpeed();

    return FAN_SPEED_TABLE.find(entry => entry.code === speed)?.number ?? 0;
  }

  // Whether the unit reports an indoor humidity / outdoor temperature reading;
  // the accessory only exposes the matching HomeKit sensor service when true.
  public supportsIndoorHumidity(): boolean {
    return true;
  }

  public supportsOutdoorTemperature(): boolean {
    return true;
  }

  // Vane swing, one boolean per axis. Not every unit has both axes (ducted
  // units have neither), so the accessory layer checks supportsSwing* before
  // exposing the matching HomeKit controls. setSwing sets both axes in one
  // device command; unsupported axes are ignored.
  public supportsSwingVertical(): boolean {
    return false;
  }

  public supportsSwingHorizontal(): boolean {
    return false;
  }

  public getSwingVertical(): boolean {
    return false;
  }

  public getSwingHorizontal(): boolean {
    return false;
  }

  public async setSwing(vertical: boolean, horizontal: boolean): Promise<boolean> {
    this.log.debug(`Daikin - setSwing(${vertical}, ${horizontal}): not supported by '${this._IP}'`);
    return false;
  }

  // Power / energy metering (dsiot units with the en_ipower function only).
  public supportsPowerMeasurement(): boolean {
    return false;
  }

  // Instantaneous consumption in W, NaN when unknown.
  public getPowerConsumption(): number {
    return NaN;
  }

  public async fetchEnergyHistory(): Promise<EnergyHistory | undefined> {
    return undefined;
  }

  // Optional features not available on every protocol; subclasses override.
  public getMotionDetection(): boolean {
    return false;
  }

  public async setMotionDetection(bEnable: boolean): Promise<boolean> {
    this.log.debug(`Daikin - setMotionDetection(${bEnable}): not supported by '${this._IP}'`);
    return false;
  }

  public async setShowSSID(bShow: boolean): Promise<boolean> {
    this.log.debug(`Daikin - setShowSSID(${bShow}): not supported by '${this._IP}'`);
    return false;
  }

}
