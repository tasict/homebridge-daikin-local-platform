import DaikinPlatformLogger from './logger';
import axios from 'axios';

import {
  USER_AGENT,
  ENDPOINT,
  SECONDS_BETWEEN_REQUEST
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

const CLIMATE_OPERATE_ON = '00';
const CLIMATE_OPERATE_OFF = '01';
const CLIMATE_OPERATE_SETTING = '02';

const COMMAND_QUERY = '{"requests":[{"op":2,"to":"/dsiot/edge.adp_i?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_d?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_f?filter=pv"},{"op":2,"to":"/dsiot/edge.dev_i?filter=pv"},{"op":2,"to":"/dsiot/edge/adr_0100.dgc_status?filter=pv"}]}';
const COMMAND_QUERY_WITH_MD = '{"requests":[{"op":2,"to":"/dsiot/edge.adp_i?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_d?filter=pv"},{"op":2,"to":"/dsiot/edge.adp_f?filter=pv"},{"op":2,"to":"/dsiot/edge.dev_i?filter=pv"},{"op":2,"to":"/dsiot/edge/adr_0100.dgc_status"}]}';

export class DaikinDevice {

  protected _IP: string;
  protected _Response: object;
  protected _log: DaikinPlatformLogger;
  protected _lastUpdateTimestamp: number = 0;
  protected _callback: any = null;

  constructor(
    public readonly IP: string,
    private readonly log: DaikinPlatformLogger,
  ) {
    this._IP = IP;
    this._Response = {};
    this._log = log;
  }

  public setCallback(callback:any) {
    this._callback = callback;
  }

  public async queryDevice(bForce:boolean = false): Promise<any> {

    if(!bForce && (Date.now() - this._lastUpdateTimestamp) < SECONDS_BETWEEN_REQUEST) {
      this.log.debug(`Daikin - queryDevice('${this._IP}'): Skipping query as last update was less than ${SECONDS_BETWEEN_REQUEST} micro seconds ago`);
      return this._Response;
    }
  
    const response = await axios.request({
      method: 'post',
      url: `http://${this._IP}${ENDPOINT}`,
      headers: {
        'Accept': 'application/json; charset=UTF-8',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      data: COMMAND_QUERY_WITH_MD,
    });

    this._lastUpdateTimestamp = Date.now();

    if(response.status === 200) {
      //this.log.debug(`Daikin - queryDevice('${this._IP}'): Response: '${JSON.stringify(response.data)}'`);
      return response.data;
    }

    this.log.debug(`Daikin - queryDevice('${this._IP}'): Error: Invalid response status code: '${response.status}'`);

    return undefined;
  
  
  }

  public async fetchDeviceStatus(bForce:boolean = false): Promise<boolean> {

    const response = await this.queryDevice(bForce);

    this._Response = response;
    this.log.debug(`Daikin - fetchDeviceStatus(${bForce}): Name: ${this.getDeviceName()} MAC:${this.getMacAddress()} Power:${this.getPowerStatus()} Temp:${this.getIndoorTemperature()} Humidity:${this.getIndoorHumidity()} Target Temp:${this.getTargetTemperature()}'  Mode:${this.getOperationModeName()} FanSpeed:${this.getFanSpeedName()} `);

    if(this._callback) {
      this._callback(this);
    }
    
    return true;  
  }

  public async setShowSSID(bShow: boolean): Promise<boolean> {
     

    this.log.debug(`Daikin - setShowSSID(${bShow}): Name: ${this.getDeviceName()}`);
    const command = {"requests":[{"op":3,"to":"/dsiot/edge.adp_d","pc":{"pn":"adp_d","pch":[{"pn":"disp_ssid","pv": bShow ? 0 :1 }]}}]};

    const response = await axios.request({
      method: 'post',
      url: `http://${this._IP}${ENDPOINT}`,
      headers: {
        'Accept': 'application/json; charset=UTF-8',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      data: JSON.stringify(command),
    });

    return response.status === 200;

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
  

  public getDeviceIP(): string {
    return this._IP;  
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

  //0000:fan 0100:heating 0200:cooling 0300:auto 0500:dehumidify
  public getOperationMode(): string {

    return this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_01');

  }

  public getOperationModeName(): string {
      
      const mode = this.getOperationMode();
  
      if(mode === CLIMATE_MODE_FAN) {
        return 'Fan';
      }
      else if(mode === CLIMATE_MODE_DEHUMIDIFY) {
        return 'Dehumidify';
      }
      else if(mode === CLIMATE_MODE_AUTO) {
        return 'Auto';
      }
      else if(mode === CLIMATE_MODE_HEATING) {
        return 'Heating';
      }
      else if(mode === CLIMATE_MODE_COOLING) {
        return 'Cooling';
      }
  
      return 'Unknown';
  
  }

  public getTargetTemperatureWithMode(mode:string): number {

    if(mode === CLIMATE_MODE_HEATING) {
      return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_03'), 16) / 2.0;
    }
    else if(mode === CLIMATE_MODE_COOLING) {
      return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_02'), 16) / 2.0;
    }
    else if(mode === CLIMATE_MODE_AUTO) {
      return parseInt(this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/p_1D'), 16) / 2.0;
    }

    this.log.debug(`Daikin - getTargetTemperature(): Error: Invalid mode: '${mode}'`);

    return 0;
  }

  public getTargetTemperature(): number {

    const mode = this.getOperationMode();

    return this.getTargetTemperatureWithMode(mode);

  }

  public getTargetTemperatureRange(): number[] {
  
    const mode = this.getOperationMode();
    let pn = 'p_02';

    if(mode === CLIMATE_MODE_HEATING) {
      pn = 'p_03';
    }
    else if(mode === CLIMATE_MODE_COOLING) {
      pn = 'p_02';
    }
    else if(mode === CLIMATE_MODE_AUTO) {
      pn = 'p_1D';
    }
    else{
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
    let pn = 'p_09';

    if(mode === CLIMATE_MODE_FAN) {
      pn = 'p_28';
    }
    else if(mode === CLIMATE_MODE_DEHUMIDIFY) {
      pn = 'p_27';
    }
    else if(mode === CLIMATE_MODE_AUTO) {
      pn = 'p_26';
    }
    else if(mode === CLIMATE_MODE_HEATING) {
      pn = 'p_0A';
    }
    else if(mode === CLIMATE_MODE_COOLING) {
      pn = 'p_09';
    }
    
    return this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3001/' + pn);
  
  }

  public getFanSpeedName(): string {

    const speed = this.getFanSpeed();

    if(speed === CLIMATE_FAN_SPEED_AUTO) {
      return 'Auto';
    }
    else if(speed === CLIMATE_FAN_SPEED_SLIENT) {
      return 'Silent';
    }
    else if(speed === CLIMATE_FAN_SPEED_1) {
      return '1';
    }
    else if(speed === CLIMATE_FAN_SPEED_2) {
      return '2';
    }
    else if(speed === CLIMATE_FAN_SPEED_3) {
      return '3';
    }
    else if(speed === CLIMATE_FAN_SPEED_4) {
      return '4';
    }
    else if(speed === CLIMATE_FAN_SPEED_5) {
      return '5';
    }

    return 'Unknown';
  }

  public getFanSpeedNumber(): number {
    const speed = this.getFanSpeed();

    if(speed === CLIMATE_FAN_SPEED_AUTO){
      return 0;
    }
    else if(speed === CLIMATE_FAN_SPEED_SLIENT){
      return 1;
    }
    else if(speed === CLIMATE_FAN_SPEED_1){
      return 2;
    }
    else if(speed === CLIMATE_FAN_SPEED_2){
      return 3;
    }
    else if(speed === CLIMATE_FAN_SPEED_3){
      return 4;
    }
    else if(speed === CLIMATE_FAN_SPEED_4){
      return 5;
    }
    else if(speed === CLIMATE_FAN_SPEED_5){
      return 6;
    }

    return 0;
  
  }

  public getMotionDetection(): boolean {
    return this.extractValue(this._Response, '/dsiot/edge/adr_0100.dgc_status', 'e_1002/e_3003/p_27') === '01'; 
  }

  public async setMotionDetection(bEnable: boolean): Promise<boolean> {
      
      const command = [{"pn": "e_3003", "pch": [{"pn": "p_27", "pv": bEnable ? '01':'00'}]}];
      return await this.sendCommand(command);
  
  }

  public async setPowerStatus(power: boolean): Promise<boolean> {

    const command = [{"pn": "e_3003", "pch": [{"pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING }]}, {"pn": "e_A002","pch": [{"pn": "p_01", "pv": power ? '01':'00'}]}];
    return await this.sendCommand(command);

  }

  public async setOperationMode(mode: string): Promise<boolean> {

    const command = [{"pn": "e_3003", "pch": [{"pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING}]}, {"pn": "e_3001","pch": [{"pn": "p_01", "pv": mode}]}];
    return await this.sendCommand(command);

  }

  public async setTargetTemperature(temperature: number): Promise<boolean> {

    const mode = this.getOperationMode();
    
    let pn = 'p_02';
    const pv = (temperature * 2).toString(16);

    if(mode === CLIMATE_MODE_HEATING) {
      pn = 'p_03';

    }
    else if(mode === CLIMATE_MODE_COOLING) {
      pn = 'p_02';
    }
    else if(mode === CLIMATE_MODE_AUTO) {
      pn = 'p_1D';
    }
    else{
      return false;
    }

    let command = [{"pn": "e_3003", "pch": [{"pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING}]}, {"pn": "e_3001","pch": [{"pn": pn, "pv": pv}]}];

    if(mode === CLIMATE_MODE_COOLING) {
      this.pushObject(command, 'e_3001', {"pn": "p_0B", "pv": '0A'});
      this.pushObject(command, 'e_3001', {"pn": "p_0C", "pv": '01'});    
    
    }
    
    return await this.sendCommand(command);

  }

  public async setFanSpeed(speed: string): Promise<boolean> {

    const mode = this.getOperationMode();

    let pn = 'p_09';
  
    if(mode === CLIMATE_MODE_FAN) {
      pn = 'p_28';
    }
    else if(mode === CLIMATE_MODE_DEHUMIDIFY) {
      pn = 'p_27';
    }
    else if(mode === CLIMATE_MODE_AUTO) {
      pn = 'p_26';
    }
    else if(mode === CLIMATE_MODE_HEATING) {
      pn = 'p_0A';
    }
    else if(mode === CLIMATE_MODE_COOLING) {
      pn = 'p_09';
    }

    const command = [{"pn": "e_3003", "pch": [{"pn": "p_2D", "pv": CLIMATE_OPERATE_SETTING}]}, {"pn": "e_3001","pch": [{"pn": pn, "pv": speed}]}];
    return await this.sendCommand(command);
  }

  public extractValue(responsesData: object, fr: string, path: string): any | undefined {

    try {

      if(responsesData === undefined || responsesData.hasOwnProperty('responses') === false) {
        this.log.debug('Daikin - extractValue(): Error: No responses object found');
        return undefined;
      }



      let currentObject = responsesData['responses'];
  
      for(const response of currentObject) {
        if (response['fr'] === fr) {
          currentObject = response['pc']['pch'];
        }
      }

      const pathKeys = path.split('/');

      for (let i = 0; i < pathKeys.length; i++) {
        try{

          const key = pathKeys[i];
          
          for(const currentObjectElement of currentObject) {
            if ((currentObjectElement['pn'] === key && currentObjectElement.hasOwnProperty('pch'))) {
              currentObject = currentObjectElement['pch'];
              break;
            }
            else if (currentObjectElement['pn'] === key && currentObjectElement.hasOwnProperty('pv')) {
              
              if(i === pathKeys.length - 1) {
                return currentObjectElement['pv'];
              }
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
    
    const response = await axios.request({
      method: 'post',
      url: `http://${this._IP}${ENDPOINT}`,
      headers: {
        'Accept': 'application/json; charset=UTF-8',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      data: JSON.stringify(param),
    });


    if(response.status === 200) {
      this.log.debug(`Daikin - sendCommand('${this._IP}'):  '${JSON.stringify(param)} ' : Response: '${JSON.stringify(response.data)}'`);
    }
    else{
      this.log.debug(`Daikin - sendCommand('${this._IP}'): '${JSON.stringify(param)} ' : Error: Invalid response status code: '${response.status}'`);
    }

    await this.fetchDeviceStatus(true);

    return response.status === 200;
  }

}



export class DaikinLocalAPI {

  private _devices: DaikinDevice[];

  constructor(
    private readonly log: DaikinPlatformLogger,
  ) {

    this._devices = [];
    
  }

  public async fetchDevices(climateIPs:string[], bForce:boolean = false): Promise<DaikinDevice[]> {
    
    this.log.debug('Daikin: fetchDevices()');
    this._devices = [];

    for(const ip of climateIPs) {
      const daikinDevice = new DaikinDevice(ip, this.log);

      if(await daikinDevice.fetchDeviceStatus(bForce)) {
        this._devices.push(daikinDevice);
      }        
    
    }

    return this._devices;
  }

 


}

