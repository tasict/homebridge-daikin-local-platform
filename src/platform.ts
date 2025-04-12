import {
  API,
  APIEvent,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
import {DaikinLocalAPI, DaikinDevice} from './daikin-local';
import ClimateAccessory from './accessories/climate';
import DaikinPlatformLogger from './logger';
import { DaikinAccessoryContext, DaikinPlatformConfig } from './types';
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
} from './settings';

/**
 * Daikin Local Platform Plugin for Homebridge
 * Based on https://github.com/homebridge/homebridge-plugin-template
 */
export default class DaikinPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // Used to track restored cached accessories
  private readonly accessories: PlatformAccessory<DaikinAccessoryContext>[] = [];
  public readonly daikinLocalAPI: DaikinLocalAPI;
  public readonly log: DaikinPlatformLogger;

  protected readonly DaikinDevices: DaikinDevice[] = [];

  public platformConfig: DaikinPlatformConfig;

  /**
   * This constructor is where you should parse the user config
   * and discover/register accessories with Homebridge.
   *
   * @param logger Homebridge logger
   * @param config Homebridge platform config
   * @param api Homebridge API
   */
  constructor(
    homebridgeLogger: Logger,
    config: PlatformConfig,
    private readonly api: API,
  ) {
    this.platformConfig = config as DaikinPlatformConfig;

    // Initialise logging utility
    this.log = new DaikinPlatformLogger(homebridgeLogger, this.platformConfig.debugMode);

    this.daikinLocalAPI = new DaikinLocalAPI(
      this.log,
    );

    /**
     * When this event is fired it means Homebridge has restored all cached accessories from disk.
     * Dynamic Platform plugins should only register new accessories after this event was fired,
     * in order to ensure they weren't added to homebridge already. This event can also be used
     * to start discovery of new accessories.
     */
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.log.debug('Finished launching and restored cached accessories.');
      this.configurePlugin();
    });
  }

  async configurePlugin() {
    await this.checkDevices();
  }

  async checkDevices() {

    if (!this.platformConfig.climateIPs || this.platformConfig.climateIPs.length === 0) {
      this.log.error('No climate IPs configured - aborting plugin start. ');
      return;
    }


    await this.daikinLocalAPI.fetchDevices(this.platformConfig.climateIPs).then((devices) => {

      for(let i = 0; i < devices.length; i++) {

        try {


          if(!devices[i].getMacAddress()) {
            this.log.error(`Device ${devices[i].getDeviceName()} has no MAC address - skipping.`);
            continue;
          }

          const uuid = this.api.hap.uuid.generate(devices[i].getMacAddress());
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
  
          this.DaikinDevices[devices[i].getMacAddress()] = devices[i];
  
          if (existingAccessory !== undefined) {
            // The accessory already exists
            this.log.info(`Restoring accessory '${existingAccessory.displayName}' `
              + `(${devices[i].getMacAddress()}) from cache.`);
  
            // If you need to update the accessory.context then you should run
            // `api.updatePlatformAccessories`. eg.:
            existingAccessory.context.device = devices[i];
            this.api.updatePlatformAccessories([existingAccessory]);
  
            // Create the accessory handler for the restored accessory
            this.createDaikinAccessory(devices[i], this, existingAccessory);
  
          } else {
            this.log.info(`Adding accessory '${devices[i].getDeviceName()}' (${devices[i].getMacAddress()}).`);
            // The accessory does not yet exist, so we need to create it
            const accessory = new this.api.platformAccessory<DaikinAccessoryContext>(
              devices[i].getDeviceName(), uuid);
  
            // Store a copy of the device object in the `accessory.context` property,
            // which can be used to store any data about the accessory you may need.
            accessory.context.device = devices[i];
  
            // Create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            this.createDaikinAccessory(devices[i], this, accessory);
  
            // Link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }
        }
        catch (e) {
          this.log.error(`Error setting logger for device ${devices[i].getDeviceName()}: ${e}`);
          continue;
        }

      }
    
    });

    for (const cachedAccessory of this.accessories) {

      if (cachedAccessory.context.device) {

        try{

          const guid = cachedAccessory.context.device.getMacAddress();
          const daikinDevice = this.DaikinDevices[guid];
  
          if (daikinDevice === undefined) {
  
            this.log.info(`Removing accessory '${cachedAccessory.displayName}' (${guid}) `
              + 'because it does not exist on the config.');
  
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cachedAccessory]);
          }

        }catch (e) {
          this.log.error(`Error setting logger for device ${cachedAccessory.displayName}: ${e}`);
          continue;
        }


      }
    }

  }

  /**
   * This function is invoked when Homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory<DaikinAccessoryContext>) {
    this.log.info(`Loading accessory '${accessory.displayName}' from cache.`);

    /**
     * We don't have to set up the handlers here,
     * because our device discovery function takes care of that.
     *
     * But we need to add the restored accessory to the
     * accessories cache so we can access it during that process.
     */
    this.accessories.push(accessory);
  }


 
   
  createDaikinAccessory(
    device: DaikinDevice,
    platform: DaikinPlatform,
    accessory: PlatformAccessory<DaikinAccessoryContext>) {

      new ClimateAccessory(platform, accessory);

  }

}
