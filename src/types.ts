import { PlatformConfig } from 'homebridge';
import { DaikinDevice } from './daikin-local';


export interface DaikinPlatformConfig extends PlatformConfig {
  climateIPs: Array<string>;
  debugMode: boolean;
}

export interface DaikinAccessoryContext {
  device: DaikinDevice;
}


