import axios from 'axios';

import {
  DaikinDevice,
  CLIMATE_MODE_FAN,
  CLIMATE_MODE_HEATING,
  CLIMATE_MODE_COOLING,
  CLIMATE_MODE_AUTO,
  CLIMATE_MODE_DEHUMIDIFY,
  CLIMATE_FAN_SPEED_AUTO,
  CLIMATE_FAN_SPEED_SLIENT,
  CLIMATE_FAN_SPEED_1,
  CLIMATE_FAN_SPEED_2,
  CLIMATE_FAN_SPEED_3,
  CLIMATE_FAN_SPEED_4,
  CLIMATE_FAN_SPEED_5,
} from './daikin-device';

import {
  USER_AGENT,
  REQUEST_TIMEOUT_MS
} from './const';

// Legacy query-string protocol spoken by BRP069xx / built-in WiFi adapters
// (firmware < 2.8.0). This is the same protocol Home Assistant's pydaikin
// DaikinBRP069 class implements; endpoint names and set semantics follow
// https://github.com/fredrike/pydaikin (daikin_brp069.py).
export const RESOURCE_BASIC_INFO = 'common/basic_info';
export const RESOURCE_CONTROL_INFO = 'aircon/get_control_info';
export const RESOURCE_SENSOR_INFO = 'aircon/get_sensor_info';
export const RESOURCE_MODEL_INFO = 'aircon/get_model_info';
export const RESOURCE_SET_CONTROL = 'aircon/set_control_info';

// basic_info and model_info never change; fetched once and kept in _Response.
const STATIC_RESOURCES = [RESOURCE_BASIC_INFO, RESOURCE_MODEL_INFO];
const INFO_RESOURCES = [RESOURCE_CONTROL_INFO, RESOURCE_SENSOR_INFO];

// Legacy `mode` codes: 0/1/7 = auto variants, 2 = dry, 3 = cool, 4 = heat, 6 = fan.
const CLIMATE_MODE_BY_BRP069_MODE: Record<string, string> = {
  '0': CLIMATE_MODE_AUTO,
  '1': CLIMATE_MODE_AUTO,
  '7': CLIMATE_MODE_AUTO,
  '2': CLIMATE_MODE_DEHUMIDIFY,
  '3': CLIMATE_MODE_COOLING,
  '4': CLIMATE_MODE_HEATING,
  '6': CLIMATE_MODE_FAN,
};

const BRP069_MODE_BY_CLIMATE_MODE: Record<string, string> = {
  [CLIMATE_MODE_AUTO]: '0',
  [CLIMATE_MODE_DEHUMIDIFY]: '2',
  [CLIMATE_MODE_COOLING]: '3',
  [CLIMATE_MODE_HEATING]: '4',
  [CLIMATE_MODE_FAN]: '6',
};

// Per-mode target-temperature memory keys inside get_control_info
// (dt1 = auto, dt2 = dry, dt3 = cool, dt4 = heat; fan mode has no temperature).
const TARGET_TEMP_KEY_BY_MODE: Record<string, string> = {
  [CLIMATE_MODE_AUTO]: 'dt1',
  [CLIMATE_MODE_DEHUMIDIFY]: 'dt2',
  [CLIMATE_MODE_COOLING]: 'dt3',
  [CLIMATE_MODE_HEATING]: 'dt4',
};

// Legacy `f_rate` codes: A = auto, B = silent, 3..7 = levels 1-5.
const F_RATE_BY_FAN_SPEED_CODE: Record<string, string> = {
  [CLIMATE_FAN_SPEED_AUTO]: 'A',
  [CLIMATE_FAN_SPEED_SLIENT]: 'B',
  [CLIMATE_FAN_SPEED_1]: '3',
  [CLIMATE_FAN_SPEED_2]: '4',
  [CLIMATE_FAN_SPEED_3]: '5',
  [CLIMATE_FAN_SPEED_4]: '6',
  [CLIMATE_FAN_SPEED_5]: '7',
};

const FAN_SPEED_CODE_BY_F_RATE: Record<string, string> =
  Object.fromEntries(Object.entries(F_RATE_BY_FAN_SPEED_CODE).map(([code, rate]) => [rate, code]));

// The legacy API exposes no temperature-range metadata; these match the
// limits of the IR remotes / Daikin mobile app for BRP069-era units.
const COOLING_TEMP_RANGE = [18, 32];
const HEATING_TEMP_RANGE = [10, 30];
const AUTO_TEMP_RANGE = [18, 30];

export class DaikinBRP069Device extends DaikinDevice {

  // Wire-code lookup tables; DaikinAirBaseDevice overrides these since the
  // AirBase firmware uses different mode / memory-key numbering.
  protected readonly climateModeByDeviceMode: Record<string, string> = CLIMATE_MODE_BY_BRP069_MODE;
  protected readonly deviceModeByClimateMode: Record<string, string> = BRP069_MODE_BY_CLIMATE_MODE;
  protected readonly targetTempKeyByMode: Record<string, string> = TARGET_TEMP_KEY_BY_MODE;

  // Command waiting for the previous one to finish; settings sent meanwhile join it.
  private _pendingControl: { overrides: Record<string, string>; result: Promise<boolean> } | undefined;
  private _controlQueue: Promise<unknown> = Promise.resolve();

  // A command is four requests (read, set, then the status read-back) and
  // these adapters answer in ~100 ms; at 500 ms HomeKit gave up (issue #21).
  protected requestIntervalMs(): number {
    return 150;
  }

  public getProtocolName(): string {
    return 'BRP069 (legacy)';
  }

  public async probe(): Promise<boolean> {

    try {
      return await this.getResource(RESOURCE_BASIC_INFO) !== undefined;
    }
    catch(e) {
      this.logProbeFailure(e);
    }

    return false;
  }

  // Probing the wrong protocol is expected during discovery, so stay quiet by
  // default. DaikinBRP072CDevice overrides this to log at error level: its
  // probe only runs when the user configured a key for the IP, so a failure
  // there is a real problem the user must see.
  protected logProbeFailure(e: unknown): void {
    this.log.debug(`Daikin - probe('${this._IP}'): not a ${this.getProtocolName()} device: '${e}'`);
  }

  // Human-readable reason for a failed request: the HTTP status when the
  // device answered, otherwise the network/TLS error code and message.
  protected describeRequestError(e: unknown): string {

    if (axios.isAxiosError(e)) {

      if (e.response?.status !== undefined) {
        return `HTTP ${e.response.status}`;
      }

      return e.code !== undefined ? `${e.code}: ${e.message}` : e.message;
    }

    return `${e}`;
  }

  // Parses the `ret=OK,pow=1,name=%4c...`-style body into a key/value map.
  // Same tolerant regex as pydaikin's parse_response; undefined when the
  // request was rejected (`ret` missing or not OK).
  protected parseResponse(body: string): Record<string, string> | undefined {

    const values: Record<string, string> = {};

    for (const match of body.matchAll(/(\w+)=([^=]*)(?:,|$)/g)) {
      values[match[1]] = match[2];
    }

    if (values['ret'] !== 'OK') {
      return undefined;
    }

    return values;
  }

  // Transport override points: DaikinBRP072CDevice swaps these for HTTPS with
  // an X-Daikin-uuid header and a legacy-TLS agent; everything else is shared.
  protected getBaseUrl(): string {
    return `http://${this._IP}`;
  }

  protected getExtraHeaders(): Record<string, string> {
    return {};
  }

  protected getHttpsAgent(): unknown {
    return undefined;
  }

  // Raw GET for a resource; axios throws on non-2xx status codes.
  protected async requestResource(path: string, params?: Record<string, string>): Promise<any> {

    const query = params ? '?' + Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&') : '';

    return this.request({
      method: 'get',
      url: `${this.getBaseUrl()}/${path}${query}`,
      headers: {
        'User-Agent': USER_AGENT,
        ...this.getExtraHeaders(),
      },
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'text',
      // The adapter answers with text/plain (or no content type); keep the raw body.
      transformResponse: [(data) => data],
      httpsAgent: this.getHttpsAgent(),
    });
  }

  protected async getResource(path: string, params?: Record<string, string>): Promise<Record<string, string> | undefined> {

    const response = await this.requestResource(path, params);

    if (response.status !== 200 || typeof response.data !== 'string') {
      this.log.debug(`Daikin - getResource('${this._IP}', '${path}'): Error: Invalid response status code: '${response.status}'`);
      return undefined;
    }

    const values = this.parseResponse(response.data);

    if (values === undefined) {
      this.log.debug(`Daikin - getResource('${this._IP}', '${path}'): Error: device rejected request: '${response.data}'`);
    }

    return values;
  }

  protected async _doQuery(): Promise<any> {

    const resources = [...INFO_RESOURCES];

    // Static resources only need to be fetched once per device object.
    for (const resource of STATIC_RESOURCES) {
      if (this._Response[resource] === undefined) {
        resources.unshift(resource);
      }
    }

    for (const resource of resources) {

      let values: Record<string, string> | undefined;
      let status: number | undefined;
      let failure = 'device rejected the request';

      try {
        values = await this.getResource(resource);
      }
      catch(e) {
        // axios throws on non-2xx responses, so 404s from units that don't
        // serve a resource land here rather than in getResource.
        status = axios.isAxiosError(e) ? e.response?.status : undefined;
        failure = this.describeRequestError(e);
      }

      if (values === undefined) {

        // model_info is optional (some adapters report NOTSUPPORT or 404 it); everything else is required.
        if (resource === RESOURCE_MODEL_INFO) {
          this._Response[resource] = {};
          continue;
        }

        this.log.error(`Daikin: ${this._IP}: request for '/${resource}' failed (${failure}).`);

        // A unit that answers basic_info over plain HTTP but 404s the aircon
        // endpoints is almost certainly a secure BRP072C-style adapter (the
        // ones paired with the Daikin Comfort Control app): those only serve
        // the control endpoints over HTTPS after registering the adapter key.
        if (resource === RESOURCE_CONTROL_INFO && status === 404 && this._Response[RESOURCE_BASIC_INFO] !== undefined) {
          this.logSecureAdapterHint();
        }

        return undefined;
      }

      this._Response[resource] = values;
    }

    this._lastUpdateTimestamp = Date.now();

    return this._Response;
  }

  // Guidance shown when the plain-HTTP BRP069 probe matched but the control
  // endpoints 404 — the signature of a secure BRP072C adapter. Overridden to
  // a no-op by DaikinBRP072CDevice, where the message would be misleading.
  protected logSecureAdapterHint(): void {
    this.log.info(`Daikin: ${this._IP}: the unit answers '/${RESOURCE_BASIC_INFO}' but not '/${RESOURCE_CONTROL_INFO}' over plain HTTP. If the unit answers on HTTPS (port 443), it is a secure BRP072C-style adapter: add its 13-digit key (printed on the adapter sticker) to 'climateKeys' in the plugin settings. If port 443 does not answer, it is a cloud-only unit (e.g. BRP069C4x/C8x, US ATMOSPHERA built-in WiFi) with no local control API, which no LAN-based plugin can support — see the README's 'Cloud-only units' section.`);
  }

  protected getValue(resource: string, key: string): string | undefined {
    const values = this._Response[resource];
    return values ? values[key] : undefined;
  }

  protected getNumber(resource: string, key: string): number {
    const raw = this.getValue(resource, key);
    // Unavailable readings come back as '-' or '--'; parseFloat turns those into NaN.
    return raw === undefined ? NaN : parseFloat(raw);
  }

  public getMacAddress(): string {
    return this.getValue(RESOURCE_BASIC_INFO, 'mac') ?? '';
  }

  public getSSID(): string {
    return this.getValue(RESOURCE_BASIC_INFO, 'ssid1') ?? this.getValue(RESOURCE_BASIC_INFO, 'ssid') ?? '';
  }

  public getDeviceName(): string {

    const name = this.getValue(RESOURCE_BASIC_INFO, 'name');

    if (name === undefined) {
      return '';
    }

    // The adapter percent-encodes the name (e.g. '%4c%69%76...').
    try {
      return decodeURIComponent(name);
    }
    catch(e) {
      return name;
    }
  }

  public getDeviceReg(): string {
    return this.getValue(RESOURCE_BASIC_INFO, 'reg') ?? '';
  }

  public getDeviceType(): string {

    const model = this.getValue(RESOURCE_MODEL_INFO, 'model');

    if (model && model !== 'NOTSUPPORT') {
      return model;
    }

    return this.getValue(RESOURCE_BASIC_INFO, 'type') ?? '';
  }

  public getFirmwareVersion(): string {
    // Reported as e.g. '1_2_51'.
    return (this.getValue(RESOURCE_BASIC_INFO, 'ver') ?? '').replace(/_/g, '.');
  }

  public getPowerStatus(): boolean {
    return this.getValue(RESOURCE_CONTROL_INFO, 'pow') === '1';
  }

  public getIndoorTemperature(): number {
    return this.getNumber(RESOURCE_SENSOR_INFO, 'htemp');
  }

  public getIndoorHumidity(): number {
    const humidity = this.getNumber(RESOURCE_SENSOR_INFO, 'hhum');
    return Number.isFinite(humidity) ? humidity : 0;
  }

  public supportsIndoorHumidity(): boolean {
    return Number.isFinite(this.getNumber(RESOURCE_SENSOR_INFO, 'hhum'));
  }

  public getOutdoorTemperature(): number {
    return this.getNumber(RESOURCE_SENSOR_INFO, 'otemp');
  }

  public supportsOutdoorTemperature(): boolean {
    return this.getValue(RESOURCE_SENSOR_INFO, 'otemp') !== undefined;
  }

  public getOperationMode(): string {

    const mode = this.getValue(RESOURCE_CONTROL_INFO, 'mode');

    return (mode !== undefined ? this.climateModeByDeviceMode[mode] : undefined) ?? CLIMATE_MODE_AUTO;
  }

  // The legacy API has no per-mode capability metadata; every BRP069-era unit
  // handles auto/cool/heat/dry/fan, only humidify is out of reach.
  public supportsOperationMode(mode: string): boolean {
    return this.deviceModeByClimateMode[mode] !== undefined;
  }

  public getTargetTemperatureWithMode(mode: string): number {

    const key = this.targetTempKeyByMode[mode];

    if (!key) {
      this.log.debug(`Daikin - getTargetTemperatureWithMode(): Error: Invalid mode: '${mode}'`);
      return 0;
    }

    const memorized = this.getNumber(RESOURCE_CONTROL_INFO, key);

    if (Number.isFinite(memorized)) {
      return memorized;
    }

    // Fall back to the live target; 'M' (dry) and '--' (fan) stay NaN -> 0.
    const stemp = this.getNumber(RESOURCE_CONTROL_INFO, 'stemp');

    return Number.isFinite(stemp) ? stemp : 0;
  }

  public getTargetTemperature(): number {

    const stemp = this.getNumber(RESOURCE_CONTROL_INFO, 'stemp');

    if (Number.isFinite(stemp)) {
      return stemp;
    }

    return this.getTargetTemperatureWithMode(this.getOperationMode());
  }

  public getTargetTemperatureRange(): number[] {

    switch (this.getOperationMode()) {
      case CLIMATE_MODE_COOLING:
        return COOLING_TEMP_RANGE;
      case CLIMATE_MODE_HEATING:
        return HEATING_TEMP_RANGE;
      case CLIMATE_MODE_AUTO:
        return AUTO_TEMP_RANGE;
      default:
        return [0, 0];
    }
  }

  public getCoolingThresholdTemperatureRange(): number[] {
    return COOLING_TEMP_RANGE;
  }

  public getHeatingThresholdTemperatureRange(): number[] {
    return HEATING_TEMP_RANGE;
  }

  public getFanSpeed(): string {

    const rate = this.getValue(RESOURCE_CONTROL_INFO, 'f_rate');

    return (rate !== undefined ? FAN_SPEED_CODE_BY_F_RATE[rate] : undefined) ?? CLIMATE_FAN_SPEED_AUTO;
  }

  // Vane swing. Most units report the combined `f_dir` (0 = off, 1 = vertical,
  // 2 = horizontal, 3 = 3D); Australian Alira X units use the split
  // `f_dir_ud`/`f_dir_lr` keys ('S' = swing, '0' = off) instead. Like pydaikin,
  // presence of the key in get_control_info is the capability signal — the
  // combined f_dir cannot tell the axes apart, so it advertises both.
  public supportsSwingVertical(): boolean {
    return this.getValue(RESOURCE_CONTROL_INFO, 'f_dir_ud') !== undefined
      || this.getValue(RESOURCE_CONTROL_INFO, 'f_dir') !== undefined;
  }

  public supportsSwingHorizontal(): boolean {
    return this.getValue(RESOURCE_CONTROL_INFO, 'f_dir_lr') !== undefined
      || this.getValue(RESOURCE_CONTROL_INFO, 'f_dir') !== undefined;
  }

  public getSwingVertical(): boolean {

    const ud = this.getValue(RESOURCE_CONTROL_INFO, 'f_dir_ud');

    if (ud !== undefined) {
      return ud === 'S';
    }

    const dir = this.getValue(RESOURCE_CONTROL_INFO, 'f_dir');

    return dir === '1' || dir === '3';
  }

  public getSwingHorizontal(): boolean {

    const lr = this.getValue(RESOURCE_CONTROL_INFO, 'f_dir_lr');

    if (lr !== undefined) {
      return lr === 'S';
    }

    const dir = this.getValue(RESOURCE_CONTROL_INFO, 'f_dir');

    return dir === '2' || dir === '3';
  }

  public async setSwing(vertical: boolean, horizontal: boolean): Promise<boolean> {

    if (this.getValue(RESOURCE_CONTROL_INFO, 'f_dir_ud') !== undefined
      || this.getValue(RESOURCE_CONTROL_INFO, 'f_dir_lr') !== undefined) {
      return await this.sendControl({
        'f_dir_ud': vertical ? 'S' : '0',
        'f_dir_lr': horizontal ? 'S' : '0',
      });
    }

    if (this.getValue(RESOURCE_CONTROL_INFO, 'f_dir') === undefined) {
      this.log.debug(`Daikin - setSwing(${vertical}, ${horizontal}): not supported by '${this._IP}'`);
      return false;
    }

    return await this.sendControl({ 'f_dir': String((vertical ? 1 : 0) + (horizontal ? 2 : 0)) });
  }

  public async setPowerStatus(power: boolean): Promise<boolean> {
    // pydaikin keeps the current mode when powering off; some units reject a bare pow=0 otherwise.
    return await this.sendControl({ 'pow': power ? '1' : '0' });
  }

  public async setOperationMode(mode: string): Promise<boolean> {

    const deviceMode = this.deviceModeByClimateMode[mode];

    if (deviceMode === undefined) {
      this.log.debug(`Daikin - setOperationMode(): Error: unsupported mode: '${mode}'`);
      return false;
    }

    // Selecting a mode implies powering on, matching pydaikin's set() semantics.
    return await this.sendControl({ 'mode': deviceMode, 'pow': '1' });
  }

  public async setTargetTemperature(temperature: number): Promise<boolean> {

    // The unit expects half-degree steps formatted with one decimal, e.g. '25.0'.
    const stemp = (Math.round(temperature * 2) / 2).toFixed(1);

    return await this.sendControl({ 'stemp': stemp });
  }

  public async setFanSpeed(speed: string): Promise<boolean> {

    const rate = F_RATE_BY_FAN_SPEED_CODE[speed];

    if (rate === undefined) {
      this.log.debug(`Daikin - setFanSpeed(): Error: unsupported speed: '${speed}'`);
      return false;
    }

    return await this.sendControl({ 'f_rate': rate });
  }

  // Commands run one at a time, so none reads the control info another is
  // about to change, and the settings that arrive while one runs are merged
  // into the next: HomeKit writes power, mode and setpoint together, each to
  // its own handler (issue #21). Like pydaikin's set(), which takes them all.
  protected sendControl(overrides: Record<string, string>): Promise<boolean> {

    if (this._pendingControl) {
      Object.assign(this._pendingControl.overrides, overrides);
      return this._pendingControl.result;
    }

    const merged = { ...overrides };

    const result = this._controlQueue
      // Let the other handlers of the same HomeKit write join first.
      .then(() => new Promise(resolve => setImmediate(resolve)))
      .then(() => {
        this._pendingControl = undefined;
        return this.applyControl(merged);
      });

    this._pendingControl = { overrides: merged, result };
    this._controlQueue = result;

    return result;
  }

  // set_control_info must always carry the full pow/mode/stemp/shum(/f_rate/f_dir)
  // state, so read the current control info, merge the overrides and send it all
  // back — the same flow as pydaikin's _update_settings()/set().
  private async applyControl(overrides: Record<string, string>): Promise<boolean> {

    try {

      const current = await this.getResource(RESOURCE_CONTROL_INFO);

      if (current === undefined) {
        this.log.debug(`Daikin - sendControl('${this._IP}'): Error: could not read current control info`);
        return false;
      }

      const values = this.mergeControlValues(current, overrides);
      const params = this.buildControlParams(current, values);

      const response = await this.getResource(RESOURCE_SET_CONTROL, params);

      if (response !== undefined) {
        this.log.debug(`Daikin - sendControl('${this._IP}'): '${JSON.stringify(params)}' : OK`);
      }
      else {
        this.log.debug(`Daikin - sendControl('${this._IP}'): '${JSON.stringify(params)}' : Error: device rejected command`);
      }

      await this.fetchDeviceStatus(true);

      return response !== undefined;

    }
    catch(e) {
      this.log.debug(`Daikin - sendControl('${this._IP}'): Error: '${e}'`);
    }

    return false;
  }

  // Overlays the overrides on the current control state; settings not
  // explicitly overridden follow the per-mode memory of the unit:
  // dt<mode> = target temp, dh<mode> = target humidity, dfr<mode> = fan rate.
  protected mergeControlValues(current: Record<string, string>, overrides: Record<string, string>): Record<string, string> {

    const values: Record<string, string> = { ...current, ...overrides };

    const memoryKeys: [string, string][] = [['stemp', 'dt'], ['shum', 'dh'], ['f_rate', 'dfr']];

    for (const [key, prefix] of memoryKeys) {
      if (!(key in overrides)) {
        const memorized = current[prefix + values['mode']];
        if (memorized !== undefined) {
          values[key] = memorized;
        }
      }
    }

    return values;
  }

  // Builds the query parameters for set_control_info; DaikinAirBaseDevice
  // overrides this since the AirBase firmware expects a different set.
  protected buildControlParams(current: Record<string, string>, values: Record<string, string>): Record<string, string> {

    const params: Record<string, string> = {};

    for (const key of ['pow', 'mode', 'stemp', 'shum']) {
      if (values[key] !== undefined) {
        params[key] = values[key];
      }
    }

    // Some remote controllers don't support f_rate/f_dir; only echo what the
    // unit reports. Australian Alira X units use split f_dir_ud/f_dir_lr keys.
    if (current['f_rate'] !== undefined) {
      params['f_rate'] = values['f_rate'];
    }

    if (current['f_dir_ud'] !== undefined && current['f_dir_lr'] !== undefined) {
      params['f_dir_ud'] = values['f_dir_ud'];
      params['f_dir_lr'] = values['f_dir_lr'];
    }
    else if (current['f_dir'] !== undefined) {
      params['f_dir'] = values['f_dir'];
    }

    return params;
  }

}
