import { PlatformConfig } from 'homebridge';
import { DaikinDevice } from './daikin-local';


export interface DaikinPlatformConfig extends PlatformConfig {
  climateIPs: Array<string>;
  // Keys for secure BRP072C adapters: one { "<ip>": "<13-digit key>" } map
  // entry per unit, matching the IP exactly as written in climateIPs.
  climateKeys?: Array<Record<string, string>>;
  // climateIPs entries of units to expose as cooling-only in HomeKit
  // (Heating and Auto hidden) — an override for cool-only hardware whose
  // firmware advertises the full heat-pump mode mask.
  climateCoolingOnly?: Array<string>;
  // climateIPs entries of units that get the per-axis Vertical/Horizontal
  // Swing switches in addition to the HeaterCooler's binary SwingMode.
  climateSwingSwitches?: Array<string>;
  // climateIPs entries of units published over Matter instead of HAP
  // (Homebridge 2.x with Matter enabled on this bridge; ignored otherwise).
  climateMatter?: Array<string>;
  // climateIPs entries of units published over both HAP and Matter while
  // the user moves them to Matter (takes precedence over climateMatter).
  climateMatterMigration?: Array<string>;
  // climateIPs entries of Matter units that also get a separate swing
  // switch accessory (Matter has no swing control Apple Home shows).
  climateMatterSwing?: Array<string>;
  // climateIPs entries of units whose tile shows the setpoint in place of
  // the indoor reading (built-in sensor far off the room, issue #20).
  climateSetpointAsTemperature?: Array<string>;
  // climateIPs entries of units whose outdoor temperature sensor is an
  // accessory of its own, so the Home app can put it in another room than
  // the unit (issue #22). Over Matter it always is.
  climateOutdoorSeparate?: Array<string>;
  // climateIPs entries of units that publish no outdoor temperature sensor
  // (takes precedence over climateOutdoorSeparate).
  climateOutdoorHidden?: Array<string>;
  // Language for the default HomeKit names of plugin-created services (see
  // src/i18n.ts). Same codes as the Homebridge UI languages; the settings
  // UI defaults it to the language selected there. Absent = English.
  language?: string;
  debugMode: boolean;
}

export interface DaikinAccessoryContext {
  device: DaikinDevice;
  // Set on a unit's other accessories: 'outdoor' = its separate outdoor
  // temperature sensor (climateOutdoorSeparate).
  role?: string;
}


