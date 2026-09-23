import DaikinPlatformLogger from './logger';

import {
  USER_AGENT,
  ENDPOINT,
  REQUEST_TIMEOUT_MS
} from './const';

import {
  DaikinDevice,
  EnergyHistory,
  CLIMATE_MODE_FAN,
  CLIMATE_MODE_HEATING,
  CLIMATE_MODE_COOLING,
  CLIMATE_MODE_AUTO,
  CLIMATE_MODE_DEHUMIDIFY,
} from './daikin-device';

import { DaikinBRP069Device } from './daikin-brp069';
import { DaikinBRP072CDevice } from './daikin-brp072c';
import { DaikinAirBaseDevice } from './daikin-airbase';

// Shared device-facing API surface (base class, mode/fan-speed codes, tables)
// stays importable from this module so existing imports keep working.
export * from './daikin-device';
export { DaikinBRP069Device } from './daikin-brp069';
export { DaikinBRP072CDevice } from './daikin-brp072c';
export { DaikinAirBaseDevice } from './daikin-airbase';

const CLIMATE_OPERATE_ON = '00';
const CLIMATE_OPERATE_OFF = '01';
const CLIMATE_OPERATE_SETTING = '02';

// Target temperature lives under a mode-dependent `pn` key inside e_1002/e_3001.
const TARGET_TEMP_PN_BY_MODE: Record<string, string> = {
  [CLIMATE_MODE_HEATING]: 'p_03',
  [CLIMATE_MODE_COOLING]: 'p_02',
  [CLIMATE_MODE_AUTO]: 'p_1D',
};

// Fan speed lives under a mode-dependent `pn` key inside e_1002/e_3001.
// Modes not listed here fall back to the cooling key (p_09).
const FAN_SPEED_PN_BY_MODE: Record<string, string> = {
  [CLIMATE_MODE_FAN]: 'p_28',
  [CLIMATE_MODE_DEHUMIDIFY]: 'p_27',
  [CLIMATE_MODE_AUTO]: 'p_26',
  [CLIMATE_MODE_HEATING]: 'p_0A',
  [CLIMATE_MODE_COOLING]: 'p_09',
};
const FAN_SPEED_PN_DEFAULT = 'p_09';

// Vane swing lives under mode-dependent `pn` keys inside e_1002/e_3001, one
// per axis (mirrors pydaikin's BRP084 swing_settings). The value is a multi-
// byte hex string whose first byte selects swing ('0F') vs a fixed position
// ('00' + stored position in the remaining bytes); field length varies per
// axis and firmware (observed 4 bytes vertical / 3 bytes horizontal), so
// writes must preserve the tail. Modes not listed fall back to cooling.
const SWING_PN_BY_MODE: Record<string, { vertical: string; horizontal: string }> = {
  [CLIMATE_MODE_COOLING]: { vertical: 'p_05', horizontal: 'p_06' },
  [CLIMATE_MODE_HEATING]: { vertical: 'p_07', horizontal: 'p_08' },
  [CLIMATE_MODE_AUTO]: { vertical: 'p_20', horizontal: 'p_21' },
  [CLIMATE_MODE_DEHUMIDIFY]: { vertical: 'p_22', horizontal: 'p_23' },
  [CLIMATE_MODE_FAN]: { vertical: 'p_24', horizontal: 'p_25' },
};
const SWING_ON_BYTE = '0F';
const SWING_OFF_BYTE = '00';

const COMMAND_PROBE = '{"requests":[{"op":2,"to":"/dsiot/edge.adp_i?filter=pv"}]}';
const COMMAND_QUERY = '{"requests":[{"op":2,"to":"/dsiot/edge.adp_i?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_d?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_f?filter=pv"},{"op":2,"to":"/dsiot/edge.dev_i?filter=pv"},{"op":2,"to":"/dsiot/edge/adr_0100.dgc_status?filter=pv"}]}';
const COMMAND_QUERY_WITH_MD = '{"requests":[{"op":2,"to":"/dsiot/edge.adp_i?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_d?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_f?filter=pv"},{"op":2,"to":"/dsiot/edge.dev_i?filter=pv"},{"op":2,"to":"/dsiot/edge/adr_0100.dgc_status"},{"op":2,"to":"/dsiot/edge/adr_0200.dgc_status"}]}';
// The energy history only comes with the whole-tree dump (~28 KB).
const COMMAND_QUERY_EDGE = '{"requests":[{"op":2,"to":"/dsiot/edge"}]}';

// Metadata step `st`: low nibble = base, high nibble = signed power of ten
// (17 = 0x11 -> 1 * 10^1 = 10 W steps; 241 = 0xF1 -> 0.1).
function decodeStep(st: unknown): number {
  if (typeof st !== 'number') {
    return 1;
  }
  const exponent = (st >> 4) & 0x0F;
  return (st & 0x0F) * Math.pow(10, exponent >= 8 ? exponent - 16 : exponent);
}

// Devices running the newer JSON protocol (`/dsiot/multireq`), i.e. firmware 2.8.0+
// adapters — what pydaikin calls BRP084.
export class DaikinDsiotDevice extends DaikinDevice {

  public getProtocolName(): string {
    return 'dsiot';
  }

  protected async post(data: string): Promise<any> {
    return this.request({
      method: 'post',
      url: `http://${this._IP}${ENDPOINT}`,
      headers: {
        'Accept': 'application/json; charset=UTF-8',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      data,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  // Lightweight protocol check used during discovery; quiet on failure so
  // probing the wrong protocol doesn't spam the log.
  public async probe(): Promise<boolean> {

    try {
      const response = await this.post(COMMAND_PROBE);
      return response.status === 200 && response.data && response.data['responses'] !== undefined;
    }
    catch(e) {
      this.log.debug(`Daikin - probe('${this._IP}'): not a dsiot device: '${e}'`);
    }

    return false;
  }

  protected async _doQuery(): Promise<any> {

    try{

      const response = await this.post(COMMAND_QUERY_WITH_MD);

      this._lastUpdateTimestamp = Date.now();

      if(response.status === 200) {
        //this.log.debug(`Daikin - queryDevice('${this._IP}'): Response: '${JSON.stringify(response.data)}'`);
        this._Response = response.data;
        return response.data;
      }

      this.log.debug(`Daikin - queryDevice('${this._IP}'): Error: Invalid response status code: '${response.status}'`);

    }
    catch(e) {
      this.log.debug(`Daikin - queryDevice('${this._IP}'): Error: '${e}'`);
    }

    return undefined;
  }

  public async setShowSSID(bShow: boolean): Promise<boolean> {


    this.log.debug(`Daikin - setShowSSID(${bShow}): Name: ${this.getDeviceName()}`);
    const command = {"requests":[{"op":3,"to":"/dsiot/edge.adp_d","pc":{"pn":"adp_d","pch":[{"pn":"disp_ssid","pv": bShow ? 0 :1 }]}}]};

    try{

      const response = await this.post(JSON.stringify(command));

      return response.status === 200;

    }catch(e) {
      this.log.debug(`Daikin - setShowSSID('${this._IP}'): Error: '${e}'`);
    }

    return false;

  }

  public getMacAddress(): string {
    return this.extractValue(this._Response, '/dsiot/edge.adp_i', 'mac');
  }

  public getSSID(): string {
    return this.extractValue(this._Response, '/dsiot/edge.adp_i', 'ssid');
  }

  public getDeviceName(): string {
    return this.extractValue(this._Response, '/dsiot/edge.adp_d', 'name');
  }

  public getDeviceReg(): string {
    return this.extractValue(this._Response, '/dsiot/edge.adp_i', 'reg');
  }

  public getDeviceType(): string {
    return this.extractValue(this._Response, '/dsiot/edge.dev_i', 'type') + this.extractValue(this._Response, '/dsiot/edge.adp_i', 'enlv');
  }

  public getFirmwareVersion(): string {
    return this.extractValue(this._Response, '/dsiot/edge.adp_i', 'ver');
  }

  public getPowerStatus(): boolean {
    return this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_A002/p_01') === '01';
  }

  public getIndoorTemperature(): number {
    return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_A00B/p_01'), 16);
  }

  public getIndoorHumidity(): number {
    return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_A00B/p_02'), 16);
  }

  // Outdoor temperature lives on the outdoor unit at adr_0200, encoded as
  // little-endian signed int16 of (temperature * 2). Returns NaN if absent.
  public getOutdoorTemperature(): number {
    const raw = this.extractValue(this._Response, '/dsiot/edge/adr_0200.dgc_status', 'e_1003/e_A00D/p_01');
    if (typeof raw !== 'string' || raw.length !== 4) {
      return NaN;
    }
    const lo = parseInt(raw.substring(0, 2), 16);
    const hi = parseInt(raw.substring(2, 4), 16);
    let val = (hi << 8) | lo;
    if (val & 0x8000) {
      val -= 0x10000;
    }
    return val / 2;
  }

  //0000:fan 0100:heating 0200:cooling 0300:auto 0500:dehumidify
  public getOperationMode(): string {

    return this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_01');

  }

  // The mode property's metadata `mx` is a little-endian bitmask of the mode
  // codes the unit accepts: bit n set = mode code n supported. Example: a
  // heat-pump unit reports '2F00' (0x002F -> bits 0,1,2,3,5) = fan, heating,
  // cooling, auto and dehumidify; a cool-only unit reports the heating bit
  // cleared. Devices without the metadata are treated as supporting every
  // mode, which matches the behaviour before capability detection existed.
  public supportsOperationMode(mode: string): boolean {

    const element = this.extractObject(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_01');
    const md = element ? element['md'] : undefined;
    const mx = md ? md['mx'] : undefined;

    if(typeof mx !== 'string' || mx.length !== 4) {
      return true;
    }

    const mask = parseInt(mx.substring(2, 4) + mx.substring(0, 2), 16);
    const bit = parseInt(mode.substring(2, 4) + mode.substring(0, 2), 16);

    if(Number.isNaN(mask) || Number.isNaN(bit)) {
      return true;
    }

    return (mask & (1 << bit)) !== 0;
  }

  public getTargetTemperatureWithMode(mode:string): number {

    const pn = TARGET_TEMP_PN_BY_MODE[mode];

    if(!pn) {
      this.log.debug(`Daikin - getTargetTemperature(): Error: Invalid mode: '${mode}'`);
      return 0;
    }

    return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/' + pn), 16) / 2.0;
  }

  public getTargetTemperatureRange(): number[] {

    const mode = this.getOperationMode();
    const pn = TARGET_TEMP_PN_BY_MODE[mode];

    if(!pn) {
      this.log.debug(`Daikin - getTargetTemperatureRange(): Error: Invalid mode: '${mode}'`);
      return [0, 0];
    }

    const md = this.extractObject(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/' + pn);

    const min = md ? parseInt(md['md']['mi'], 16) / 2.0 : 0;
    const max = md ? parseInt(md['md']['mx'], 16) / 2.0 : 0;

    return [min, max];


  }

  public getCoolingThresholdTemperatureRange(): number[] {

    const md = this.extractObject(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_02');

    const min = md ? parseInt(md['md']['mi'], 16) / 2.0 : 0;
    const max = md ? parseInt(md['md']['mx'], 16) / 2.0 : 0;

    return [min, max];

  }

  public getHeatingThresholdTemperatureRange(): number[] {

    const md = this.extractObject(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_03');

    const min = md ? parseInt(md['md']['mi'], 16) / 2.0 : 0;
    const max = md ? parseInt(md['md']['mx'], 16) / 2.0 : 0;

    return [min, max];

  }


  public getFanSpeed(): string {

    const mode = this.getOperationMode();
    const pn = FAN_SPEED_PN_BY_MODE[mode] ?? FAN_SPEED_PN_DEFAULT;

    return this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/' + pn);

  }

  // The property metadata `mx` is a little-endian bitmask of the accepted
  // value codes (bit n set = first-byte value n accepted), of whatever byte
  // length the property has. Treat missing/unparseable metadata as accepted,
  // matching supportsOperationMode.
  private mxAllowsCode(mx: unknown, code: number): boolean {

    if (typeof mx !== 'string' || mx.length < 2 || mx.length % 2 !== 0) {
      return true;
    }

    const byteIndex = code >> 3;

    if ((byteIndex + 1) * 2 > mx.length) {
      return false;
    }

    const byte = parseInt(mx.substring(byteIndex * 2, byteIndex * 2 + 2), 16);

    if (Number.isNaN(byte)) {
      return true;
    }

    return (byte & (1 << (code & 7))) !== 0;
  }

  private swingPn(axis: 'vertical' | 'horizontal'): string {

    const mode = this.getOperationMode();

    return (SWING_PN_BY_MODE[mode] ?? SWING_PN_BY_MODE[CLIMATE_MODE_COOLING])[axis];
  }

  // An axis is supported when the current mode's swing property exists and
  // its metadata accepts the swing code (0x0F). Units without horizontal
  // vanes simply lack the property (or its swing bit).
  private supportsSwingAxis(axis: 'vertical' | 'horizontal'): boolean {

    const element = this.extractObject(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/' + this.swingPn(axis));

    if (!element) {
      return false;
    }

    const md = element['md'];

    return this.mxAllowsCode(md ? md['mx'] : undefined, parseInt(SWING_ON_BYTE, 16));
  }

  public supportsSwingVertical(): boolean {
    return this.supportsSwingAxis('vertical');
  }

  public supportsSwingHorizontal(): boolean {
    return this.supportsSwingAxis('horizontal');
  }

  private getSwingAxis(axis: 'vertical' | 'horizontal'): boolean {

    const pv = this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/' + this.swingPn(axis));

    return typeof pv === 'string' && pv.substring(0, 2).toUpperCase() === SWING_ON_BYTE;
  }

  public getSwingVertical(): boolean {
    return this.getSwingAxis('vertical');
  }

  public getSwingHorizontal(): boolean {
    return this.getSwingAxis('horizontal');
  }

  public async setSwing(vertical: boolean, horizontal: boolean): Promise<boolean> {

    const settings: object[] = [];
    const axes: ['vertical' | 'horizontal', boolean][] = [['vertical', vertical], ['horizontal', horizontal]];

    for (const [axis, on] of axes) {

      if (!this.supportsSwingAxis(axis)) {
        continue;
      }

      const pn = this.swingPn(axis);
      const current = this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/' + pn);
      // Keep the stored fixed-vane position in the tail bytes and only flip
      // the first (swing selector) byte.
      const tail = typeof current === 'string' && current.length > 2 ? current.substring(2) : '0000';

      settings.push({ 'pn': pn, 'pv': (on ? SWING_ON_BYTE : SWING_OFF_BYTE) + tail });
    }

    if (settings.length === 0) {
      this.log.debug(`Daikin - setSwing(${vertical}, ${horizontal}): no swing-capable axis on '${this._IP}'`);
      return false;
    }

    const command = [{"pn": "e_3003", "pch": [{"pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING}]}, {"pn": "e_3001", "pch": settings}];
    return await this.sendCommand(command);
  }

  public supportsPowerMeasurement(): boolean {
    return this.extractValue(this._Response, '/dsiot/edge.adp_i', 'func/en_ipower') === 1;
  }

  // Outdoor-unit power at adr_0200: 3-byte little-endian count of `md.st` steps.
  public getPowerConsumption(): number {
    const element = this.extractObject(this._Response, '/dsiot/edge/adr_0200.dgc_status', 'e_1003/e_A005/p_01');
    const raw = element ? element['pv'] : undefined;
    if (typeof raw !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(raw)) {
      return NaN;
    }
    const count = parseInt(raw.substring(4, 6) + raw.substring(2, 4) + raw.substring(0, 2), 16);
    return count * decodeStep(element!['md']?.['st']);
  }

  public async fetchEnergyHistory(): Promise<EnergyHistory | undefined> {

    try {
      const response = await this.post(COMMAND_QUERY_EDGE);
      const list = (name: string) => {
        const value = this.extractValue(response.data, '/dsiot/edge', 'adr_0100/i_power/' + name);
        return Array.isArray(value) ? value.filter((v) => typeof v === 'number') : [];
      };
      const dailyWh = list('week_power/datas');

      const tmdf = this.extractValue(response.data, '/dsiot/edge', 'adp_d/timz/tmdf');

      if (dailyWh.length === 0) {
        this.log.debug(`Daikin - fetchEnergyHistory('${this._IP}'): no i_power data`);
        return undefined;
      }

      return {
        todayRuntimeMinutes: Number(this.extractValue(response.data, '/dsiot/edge', 'adr_0100/i_power/week_power/today_runtime')) || 0,
        dailyWh,
        thisYearKWh: list('year_power/this_year'),
        previousYearKWh: list('year_power/previous_year'),
        // ponytail: DST flag (timz/dst) ignored; add it if a DST-region unit drifts by an hour.
        utcOffsetMinutes: typeof tmdf === 'number' ? tmdf : undefined,
      };
    }
    catch(e) {
      this.log.debug(`Daikin - fetchEnergyHistory('${this._IP}'): Error: '${e}'`);
    }

    return undefined;
  }

  public getMotionDetection(): boolean {
    return this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3003/p_27') === '01';
  }

  public async setMotionDetection(bEnable: boolean): Promise<boolean> {

      const command = [{"pn": "e_3003", "pch": [{"pn": "p_27", "pv": bEnable ? '01':'00'}]}];
      return await this.sendCommand(command);

  }

  public async setPowerStatus(power: boolean): Promise<boolean> {

    // p_2D is the operation-type flag. Sending SETTING ('02') makes the unit treat the
    // stop as a mere config change, so it skips the post-stop 内部クリーン (mould-proof) dry
    // cycle. Sending the genuine OFF ('01') makes it a normal user stop, which triggers the
    // dry cycle when the unit's auto-internal-clean setting is enabled — matching the remote.
    const operate = power ? CLIMATE_OPERATE_ON : CLIMATE_OPERATE_OFF;
    const command = [{"pn": "e_3003", "pch": [{"pn": "p_2D", "pv": operate }]}, {"pn": "e_A002","pch": [{"pn": "p_01", "pv": power ? '01':'00'}]}];
    return await this.sendCommand(command);

  }

  public async setOperationMode(mode: string): Promise<boolean> {

    const command = [{"pn": "e_3003", "pch": [{"pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING}]}, {"pn": "e_3001","pch": [{"pn": "p_01", "pv": mode}]}];
    return await this.sendCommand(command);

  }

  public async setTargetTemperature(temperature: number): Promise<boolean> {

    const mode = this.getOperationMode();

    const pn = TARGET_TEMP_PN_BY_MODE[mode];

    if(!pn) {
      return false;
    }

    const pv = (temperature * 2).toString(16);

    const command = [{"pn": "e_3003", "pch": [{"pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING}]}, {"pn": "e_3001","pch": [{"pn": pn, "pv": pv}]}];

    if(mode === CLIMATE_MODE_COOLING) {
      this.pushObject(command, 'e_3001', {"pn": "p_0B", "pv": '0A'});
      this.pushObject(command, 'e_3001', {"pn": "p_0C", "pv": '01'});

    }

    return await this.sendCommand(command);

  }

  public async setFanSpeed(speed: string): Promise<boolean> {

    const mode = this.getOperationMode();

    const pn = FAN_SPEED_PN_BY_MODE[mode] ?? FAN_SPEED_PN_DEFAULT;

    const command = [{"pn": "e_3003", "pch": [{"pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING}]}, {"pn": "e_3001","pch": [{"pn": pn, "pv": speed}]}];
    return await this.sendCommand(command);
  }

  public extractValue(responsesData: object, fr: string, path: string): any | undefined {

    const element = this.extractObject(responsesData, fr, path);

    return element ? element['pv'] : undefined;
  }

  public extractObject(responsesData: object, fr: string, path: string): object | undefined {

    try {

      if(responsesData === undefined || responsesData.hasOwnProperty('responses') === false) {
        this.log.debug('Daikin - extractObject(): Error: No responses object found');
        return undefined;
      }



      let currentObject = responsesData['responses'];

      for(const response of currentObject) {
        if (response['fr'] === fr) {
          currentObject = response['pc']['pch'];
        }
      }

      const pathKeys = path.split('/');

      for (const key of pathKeys) {
        try{

          for(const currentObjectElement of currentObject) {
            if (currentObjectElement['pn'] === key && currentObjectElement.hasOwnProperty('pch')) {
              currentObject = currentObjectElement['pch'];
              break;
            }
            else if (currentObjectElement['pn'] === key && currentObjectElement.hasOwnProperty('pv')) {
              return currentObjectElement;
            }

          }


        } catch (e) {
          this.log.debug('Daikin - extractValue(): Error:' + e);
        }



      }
    }
    catch (e) {
      this.log.debug('Daikin - extractValue(): Error:' + e);
    }


    this.log.debug('Daikin - extractValue(): Error: No value found for path:' + path);

    return undefined;
  }

  // const command = [{"pn": "e_3003", "pch": [{"pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING}]}, {"pn": "e_3001","pch": [{"pn": pn, "pv": speed}]}];

  public pushObject(jsonData: Object, pn: string, obj: object): object | undefined {

    try{

      for(const i in jsonData) {
        const currentObject = jsonData[i];
        if (currentObject['pn'] === pn && currentObject.hasOwnProperty('pch')) {
          currentObject['pch'].push(obj);
          return jsonData;
        }
      }


    }catch (e) {
      this.log.debug('Daikin - pushObject(): Error:' + e);
    }

    return undefined;



  }

  protected async sendCommand(command: object): Promise<boolean> {

    const param = {"requests": [{"op": 3,"to": "/dsiot/edge/adr_0100.dgc_status","pc": {"pn": "dgc_status","pch": [{"pn": "e_1002","pch": command}]}}]};

    try{

      const response = await this.post(JSON.stringify(param));


      if(response.status === 200) {
        this.log.debug(`Daikin - sendCommand('${this._IP}'):  '${JSON.stringify(param)} ' : Response: '${JSON.stringify(response.data)}'`);
      }
      else{
        this.log.debug(`Daikin - sendCommand('${this._IP}'): '${JSON.stringify(param)} ' : Error: Invalid response status code: '${response.status}'`);
      }

      await this.fetchDeviceStatus(true);

      return response.status === 200;

    }
    catch(e) {
      this.log.debug(`Daikin - sendCommand('${this._IP}'): Error: '${e}'`);
    }

    return false;


  }

}



const FETCH_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 2000;

export class DaikinLocalAPI {

  private _devices: DaikinDevice[];

  constructor(
    private readonly log: DaikinPlatformLogger,
  ) {

    this._devices = [];

  }

  // climateKeys maps a configured IP (exactly as written in climateIPs, port
  // included) to the 13-digit key of a secure BRP072C adapter.
  public async fetchDevices(climateIPs:string[], climateKeys?: Record<string, string>): Promise<DaikinDevice[]> {

    this.log.debug('Daikin: fetchDevices()');
    this._devices = [];

    for(const ip of climateIPs) {

      const daikinDevice = await this.detectDeviceWithRetry(ip, climateKeys ? climateKeys[ip] : undefined);

      if(daikinDevice) {
        this.log.info(`Daikin: ${ip} detected as ${daikinDevice.getProtocolName()} device '${daikinDevice.getDeviceName()}'.`);
        this._devices.push(daikinDevice);
      }
      else {
        this.log.error(`Daikin: device at ${ip} did not respond after ${FETCH_ATTEMPTS} attempts - skipping.`);
      }

    }

    return this._devices;
  }

  // Probe order mirrors pydaikin's factory: the newer /dsiot JSON protocol
  // first, then the legacy BRP069 query-string protocol. When the user
  // configured a key for the IP, the secure BRP072C candidate goes first but
  // the others stay as fallback, so a key entered for the wrong unit is
  // simply ignored. A device that is briefly unreachable at startup (e.g.
  // still booting) would otherwise be dropped until Homebridge restarts;
  // retry a few times first.
  private async detectDeviceWithRetry(ip: string, key?: string): Promise<DaikinDevice | undefined> {

    for(let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {

      const candidates: DaikinDevice[] = [
        new DaikinDsiotDevice(ip, this.log),
        new DaikinBRP069Device(ip, this.log),
        new DaikinAirBaseDevice(ip, this.log),
      ];

      if(key) {
        candidates.unshift(new DaikinBRP072CDevice(ip, this.log, key));
      }

      for(const candidate of candidates) {

        if(!(await candidate.probe())) {
          // Visible on the first pass only, so users can see which protocols
          // were ruled out without the retries tripling the noise.
          if(attempt === 1) {
            this.log.info(`Daikin: ${ip} does not answer the ${candidate.getProtocolName()} protocol.`);
          }
          continue;
        }

        if(await candidate.fetchDeviceStatus(true)) {
          return candidate;
        }

        this.log.info(`Daikin: ${ip} answers the ${candidate.getProtocolName()} probe but the full status query failed - not a ${candidate.getProtocolName()} device.`);
      }

      if(attempt < FETCH_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_DELAY_MS));
      }
    }

    return undefined;
  }

}
