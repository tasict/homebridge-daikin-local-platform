import {
  API,
  APIEvent,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  MatterAccessory,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
import {DaikinLocalAPI, DaikinDevice} from './daikin-local';
import ClimateAccessory from './accessories/climate';
import ClimateMatterAccessory, { thermostatFeatureSignature } from './accessories/climate-matter';
import DaikinPlatformLogger from './logger';
import { DaikinAccessoryContext, DaikinPlatformConfig } from './types';
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
} from './settings';

const MATTER_REGISTER_ATTEMPTS = 10;
const MATTER_REGISTER_RETRY_MS = 3000;

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

  protected readonly DaikinDevices: Record<string, DaikinDevice> = {};

  // Matter (Homebridge 2.x with Matter enabled on this bridge only).
  private matterEnabled = false;
  private readonly matterAccessories = new Map<string, MatterAccessory>();

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
    public readonly api: API,
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
    this.matterEnabled = (this.api.isMatterAvailable?.() ?? false) && (this.api.isMatterEnabled?.() ?? false);
    const wantsMatter = [...(this.platformConfig.climateMatter ?? []), ...(this.platformConfig.climateMatterMigration ?? [])];
    if (!this.matterEnabled && wantsMatter.length > 0) {
      this.log.warn('Some units are set to Matter, but Matter is not enabled on this bridge '
        + '- publishing them over HomeKit (HAP) instead. Turn Matter on in the Homebridge bridge settings to use it.');
    }
    await this.checkDevices();
  }

  // Per-device config lists hold climateIPs entries; matched like
  // climateKeys: the exact entry (port included) first, then by bare IP so
  // hand-edited configs still line up.
  private configListHas(list: Array<string> | undefined, ip: string | undefined): boolean {
    if (!ip) {
      return false;
    }
    const bare = (value: string) => value.trim().split(':')[0];
    return (list ?? []).some((entry) =>
      typeof entry === 'string' && (entry.trim() === ip.trim() || bare(entry) === bare(ip)));
  }

  // True when the config marks this unit as cooling-only (climateCoolingOnly).
  isCoolingOnly(ip: string | undefined): boolean {
    return this.configListHas(this.platformConfig.climateCoolingOnly, ip);
  }

  // True when the config asks for the per-axis swing switches
  // (climateSwingSwitches) on this unit.
  isSwingSwitchesEnabled(ip: string | undefined): boolean {
    return this.configListHas(this.platformConfig.climateSwingSwitches, ip);
  }

  // Where a unit is published, when this bridge has Matter: climateMatter =
  // Matter only; climateMatterMigration = both, so the Matter accessory can
  // be set up in the Home app (rooms, automations) while the HomeKit one
  // keeps working, until the user moves the unit on to climateMatter.
  resolveProtocol(ip: string | undefined): 'hap' | 'both' | 'matter' {
    if (!this.matterEnabled) {
      return 'hap';
    }
    if (this.configListHas(this.platformConfig.climateMatterMigration, ip)) {
      return 'both';
    }
    return this.configListHas(this.platformConfig.climateMatter, ip) ? 'matter' : 'hap';
  }

  // True when the unit gets a separate Matter swing switch (climateMatterSwing).
  isMatterSwingEnabled(ip: string | undefined): boolean {
    return this.configListHas(this.platformConfig.climateMatterSwing, ip);
  }

  async checkDevices() {

    if (!this.platformConfig.climateIPs || this.platformConfig.climateIPs.length === 0) {
      this.log.error('No climate IPs configured - aborting plugin start. ');
      return;
    }


    // Flatten the config's climateKeys ([{ "<ip>": "<key>" }, ...]) into an
    // ip -> key lookup for the secure BRP072C candidates.
    const climateKeys: Record<string, string> = {};

    for (const entry of this.platformConfig.climateKeys ?? []) {

      if (entry === null || typeof entry !== 'object') {
        continue;
      }

      for (const [ip, key] of Object.entries(entry)) {
        if (typeof key === 'string' && key.length > 0) {
          climateKeys[ip] = key;
        }
      }
    }

    const matterClimates: ClimateMatterAccessory[] = [];

    await this.daikinLocalAPI.fetchDevices(this.platformConfig.climateIPs, climateKeys).then((devices) => {

      for(let i = 0; i < devices.length; i++) {

        try {


          if(!devices[i].getMacAddress()) {
            this.log.error(`Device ${devices[i].getDeviceName()} has no MAC address - skipping.`);
            continue;
          }

          const protocol = this.resolveProtocol(devices[i].IP);
          if (protocol !== 'hap') {
            // Homebridge rebuilds no Matter endpoint or handler from its cache:
            // every unit is registered again on each launch (pairing and
            // attribute state survive).
            const climate = new ClimateMatterAccessory(this, devices[i]);
            this.log.info(`${this.matterAccessories.has(climate.UUID) ? 'Restoring' : 'Adding'} Matter accessory `
              + `'${climate.accessory.displayName}' (${devices[i].getMacAddress()}).`);
            this.DaikinDevices[devices[i].getMacAddress()] = devices[i];
            matterClimates.push(climate);
            if (protocol === 'matter') {
              continue;
            }
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
          this.log.error(`Error registering device ${devices[i].getDeviceName()}: ${e}`);
          continue;
        }

      }
    
    });

    if (matterClimates.length > 0) {
      await Promise.all(matterClimates.map((m) => m.loadEnergy()));
      await this.registerMatterClimates(matterClimates);
    }

    await this.reconcileProtocolSwitches();

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
          this.log.error(`Error removing stale accessory ${cachedAccessory.displayName}: ${e}`);
          continue;
        }


      }
    }

  }

  // The bridge's Matter server can still be starting right after launch
  // (registration then throws), so retry for a little while.
  private async registerMatterClimates(climates: ClimateMatterAccessory[]) {
    // Homebridge keeps a cache-restored endpoint whose thermostat features
    // came from the cached setpoints; when the unit's feature set changed
    // (e.g. cooling-only toggled), make Homebridge rebuild it.
    for (const climate of climates) {
      const cached = this.matterAccessories.get(climate.UUID);
      if (cached && thermostatFeatureSignature(cached.clusters) !== thermostatFeatureSignature(climate.accessory.clusters)) {
        this.log.info(`Rebuilding Matter accessory '${cached.displayName}' because its heating/cooling modes changed.`);
        climate.composeThermostat();
      }
    }

    for (let attempt = 1; ; attempt++) {
      try {
        await this.api.matter!.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, climates.flatMap((m) => m.accessories));
        // A migrating unit's HomeKit accessory already polls the device.
        climates.forEach((m) => m.start(this.resolveProtocol(m.accessory.context.ip as string) === 'matter'));
        return;
      }
      catch (e) {
        if (attempt >= MATTER_REGISTER_ATTEMPTS) {
          this.log.error(`Error registering Matter accessories: ${e}`);
          return;
        }
        this.log.debug(`Matter registration attempt ${attempt} failed, retrying: ${e}`);
        await new Promise((resolve) => setTimeout(resolve, MATTER_REGISTER_RETRY_MS));
      }
    }
  }

  // Drop the cached accessory of the protocol a unit no longer uses, so it
  // does not show up twice. Keyed by the configured IP, not by whether the
  // unit answered, so a unit that is offline at startup keeps its accessory.
  private async reconcileProtocolSwitches() {

    for (const cachedAccessory of [...this.accessories]) {
      const ip = cachedAccessory.context.device?.IP;
      if (this.resolveProtocol(ip) === 'matter') {
        this.log.info(`Removing HomeKit accessory '${cachedAccessory.displayName}' because it is now published over Matter.`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cachedAccessory]);
        this.accessories.splice(this.accessories.indexOf(cachedAccessory), 1);
      }
    }

    if (!this.api.matter) {
      return;
    }

    for (const cached of this.matterAccessories.values()) {
      const ip = cached.context?.ip as string | undefined;
      // The unit's companion accessories (fan, sensors, swing) go with it;
      // swing also when its option was switched off.
      const wanted = cached.context?.role === 'swing' ? this.isMatterSwingEnabled(ip) : true;
      if (wanted && this.resolveProtocol(ip) !== 'hap' && this.configListHas(this.platformConfig.climateIPs, ip)) {
        continue;
      }
      this.log.info(`Removing Matter accessory '${cached.displayName}' because it is no longer published over Matter.`);
      try {
        await this.api.matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cached]);
      }
      catch (e) {
        this.log.error(`Error removing Matter accessory ${cached.displayName}: ${e}`);
      }
    }
  }

  // Homebridge 2.x: cached Matter accessories, restored before launch finishes.
  configureMatterAccessory(accessory: MatterAccessory) {
    this.matterAccessories.set(accessory.UUID, accessory);
  }

  /**
   * This function is invoked when Homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info(`Loading accessory '${accessory.displayName}' from cache.`);

    /**
     * We don't have to set up the handlers here,
     * because our device discovery function takes care of that.
     *
     * But we need to add the restored accessory to the
     * accessories cache so we can access it during that process.
     */
    this.accessories.push(accessory as PlatformAccessory<DaikinAccessoryContext>);
  }


 
   
  createDaikinAccessory(
    device: DaikinDevice,
    platform: DaikinPlatform,
    accessory: PlatformAccessory<DaikinAccessoryContext>) {

      new ClimateAccessory(platform, accessory);

  }

}
