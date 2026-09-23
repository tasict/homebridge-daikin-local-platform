import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback, CharacteristicEventTypes } from 'homebridge';
import DaikinPlatform from '../platform';
import { AUTO_SETPOINT_OFFSET, DEVICE_STATUS_REFRESH_INTERVAL } from '../const';
import { DaikinAccessoryContext} from '../types';
import {
  CLIMATE_MODE_AUTO,
  CLIMATE_MODE_COOLING,
  CLIMATE_MODE_DEHUMIDIFY,
  CLIMATE_MODE_HUMIDIFY,
  CLIMATE_MODE_FAN,
  CLIMATE_MODE_HEATING,
  FAN_SPEED_TABLE
} from '../daikin-local';
import {DaikinLocalAPI, DaikinDevice} from '../daikin-local';
import { getServiceNames, isDefaultServiceName, ServiceNames, ServiceNameKey } from '../i18n';


/**
 * An instance of this class is created for each accessory the platform registers.
 * Each accessory may expose multiple services of different service types.
 */
export default class ClimateAccessory {
  private services: Record<string, Service> = {};
  private _refreshInterval: NodeJS.Timer | undefined;
  private _lastFanSpeed = 1; // slient
  // Capabilities detected from the device's mode metadata (see
  // DaikinDevice.supportsOperationMode); decide which HeaterCooler states
  // and threshold characteristics this accessory exposes.
  private _supportsAuto = true;
  private _supportsHeat = true;
  private _supportsCool = true;
  private _supportsHumidity = true;
  private _supportsOutdoorTemperature = true;
  private _supportsSwingVertical = false;
  private _supportsSwingHorizontal = false;
  // Localized default service names (language config field).
  private _names: ServiceNames;

  constructor(
    private readonly platform: DaikinPlatform,
    private readonly accessory: PlatformAccessory<DaikinAccessoryContext>,
  ) {


    this._names = getServiceNames(platform.platformConfig.language);

    accessory.context.device.addCallback(this.updateDeviceStatus.bind(this));

    // Accessory Information
    // https://developers.homebridge.io/#/service/AccessoryInformation
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'Daikin ' + accessory.context.device?.getDeviceReg(),
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        accessory.context.device?.getDeviceType() || 'Unknown',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        accessory.context.device?.getMacAddress() || 'Unknown',
      )
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        accessory.context.device?.getFirmwareVersion() || 'Unknown',
      );

    this.services['Climate'] = this.accessory.getService(this.platform.Service.HeaterCooler)
      || this.accessory.addService(this.platform.Service.HeaterCooler);

    
    // This is what is displayed as the default name on the Home app
    this.services['Climate'].setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device?.getDeviceName() || this._names.airConditioner,
    );

    this.services['Climate']
      .getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.setClimateActive.bind(this))
      .onGet(this.getClimateActive.bind(this));

    this.services['Climate']
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({
        minValue: -100,
        maxValue: 100,
        minStep: 0.01,
      });  

    this.services['Climate']
      .getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.getCurrentHeaterCoolerState.bind(this));

    this._supportsAuto = accessory.context.device?.supportsOperationMode(CLIMATE_MODE_AUTO) ?? true;
    this._supportsHeat = accessory.context.device?.supportsOperationMode(CLIMATE_MODE_HEATING) ?? true;
    this._supportsCool = accessory.context.device?.supportsOperationMode(CLIMATE_MODE_COOLING) ?? true;

    // Config override for cool-only hardware whose firmware advertises the
    // full heat-pump mode mask (issue #16): hide Heating and Auto no matter
    // what the unit reports. Only hides — never adds a mode the unit lacks.
    if (platform.isCoolingOnly(accessory.context.device?.IP)) {
      this._supportsAuto = false;
      this._supportsHeat = false;
      this._supportsCool = true;
      this.platform.log.info(`Accessory: '${this.accessory.displayName}' is marked cooling-only `
        + 'in the config - hiding Heating and Auto.');
    }

    const validTargetStates: number[] = [];
    if (this._supportsAuto) {
      validTargetStates.push(this.platform.Characteristic.TargetHeaterCoolerState.AUTO);
    }
    if (this._supportsHeat) {
      validTargetStates.push(this.platform.Characteristic.TargetHeaterCoolerState.HEAT);
    }
    if (this._supportsCool) {
      validTargetStates.push(this.platform.Characteristic.TargetHeaterCoolerState.COOL);
    }

    // A unit reporting none of the three states would leave HomeKit with an
    // empty mode menu; fall back to exposing everything.
    if (validTargetStates.length === 0) {
      this._supportsAuto = this._supportsHeat = this._supportsCool = true;
      validTargetStates.push(
        this.platform.Characteristic.TargetHeaterCoolerState.AUTO,
        this.platform.Characteristic.TargetHeaterCoolerState.HEAT,
        this.platform.Characteristic.TargetHeaterCoolerState.COOL,
      );
    }

    this.platform.log.info(`Accessory: '${this.accessory.displayName}' supported modes: `
      + `${accessory.context.device?.getSupportedOperationModeNames().join(', ')}`);

    this.services['Climate']
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: validTargetStates,
      })
      .onSet(this.setTargetHeaterCoolerState.bind(this));

    // Cooling Threshold Temperature (optional)
    if (this._supportsCool) {
      this.services['Climate']
        .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
        .setProps({
          minValue: accessory.context.device?.getCoolingThresholdTemperatureRange()[0] || 10,
          maxValue: accessory.context.device?.getCoolingThresholdTemperatureRange()[1] || 30,
          minStep: 0.5,
        })
        .onSet(this.setCoolingThresholdTemperature.bind(this))
        .onGet(this.getCoolingThresholdTemperature.bind(this));
    } else if (this.services['Climate'].testCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)) {
      // Drop the characteristic left on an accessory cached before capability detection.
      this.services['Climate'].removeCharacteristic(
        this.services['Climate'].getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature));
    }

    // Heating Threshold Temperature (optional)
    if (this._supportsHeat) {
      this.services['Climate']
        .getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
        .setProps({
          minValue: accessory.context.device?.getHeatingThresholdTemperatureRange()[0] || 10,
          maxValue: accessory.context.device?.getHeatingThresholdTemperatureRange()[1] || 30,
          minStep: 0.5,
        })
        .onSet(this.setHeatingThresholdTemperature.bind(this))
        .onGet(this.getHeatingThresholdTemperature.bind(this));
    } else if (this.services['Climate'].testCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)) {
      // Drop the characteristic left on an accessory cached before capability detection.
      this.services['Climate'].removeCharacteristic(
        this.services['Climate'].getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature));
    }

    // Fan control service
    this.services['Fan'] = this.accessory.getService(this.platform.Service.Fan)
      || this.accessory.addService(this.platform.Service.Fan);

    this.services['Fan'].getCharacteristic(this.platform.Characteristic.On)
    .onGet(this.getFanStatus.bind(this))
    .onSet(this.setFanStatus.bind(this));

    this.services['Fan'].getCharacteristic(this.platform.Characteristic.RotationSpeed)
    .setProps({
      unit: null,
      format: this.platform.api.hap.Formats.UINT8,
      minValue: 0,
      maxValue: 6,
      validValues: [0, 1, 2, 3, 4, 5, 6]
    })
    .onGet(this.getRotationSpeed.bind(this))
    .onSet(this.setRotationSpeed.bind(this));

    ////
    // Vane swing. The HeaterCooler's binary SwingMode (native Home-app
    // "Oscillate" toggle, Siri-capable) is exposed whenever the unit swings
    // on at least one axis: enabled = every supported axis on (3D),
    // disabled = all off. The optional per-axis Switch services
    // (climateSwingSwitches config) add the remaining combinations.
    this._supportsSwingVertical = accessory.context.device?.supportsSwingVertical() ?? false;
    this._supportsSwingHorizontal = accessory.context.device?.supportsSwingHorizontal() ?? false;

    if (this._supportsSwingVertical || this._supportsSwingHorizontal) {
      this.services['Climate']
        .getCharacteristic(this.platform.Characteristic.SwingMode)
        .onGet(this.getSwingMode.bind(this))
        .onSet(this.setSwingMode.bind(this));
    } else if (this.services['Climate'].testCharacteristic(this.platform.Characteristic.SwingMode)) {
      // Drop the characteristic left on an accessory cached before capability detection.
      this.services['Climate'].removeCharacteristic(
        this.services['Climate'].getCharacteristic(this.platform.Characteristic.SwingMode));
    }

    const swingSwitches: { key: string; subtype: string; nameKey: ServiceNameKey; supported: boolean;
      onGet: () => Promise<CharacteristicValue>; onSet: (value: CharacteristicValue) => Promise<void>; }[] = [
      { key: 'VerticalSwing', subtype: 'swing-vertical', nameKey: 'verticalSwing',
        supported: this._supportsSwingVertical,
        onGet: this.getVerticalSwingSwitch.bind(this), onSet: this.setVerticalSwingSwitch.bind(this) },
      { key: 'HorizontalSwing', subtype: 'swing-horizontal', nameKey: 'horizontalSwing',
        supported: this._supportsSwingHorizontal,
        onGet: this.getHorizontalSwingSwitch.bind(this), onSet: this.setHorizontalSwingSwitch.bind(this) },
    ];

    const exposeSwingSwitches = platform.isSwingSwitchesEnabled(accessory.context.device?.IP);

    for (const swingSwitch of swingSwitches) {

      if (exposeSwingSwitches && swingSwitch.supported) {
        let service = this.accessory.getServiceById(this.platform.Service.Switch, swingSwitch.subtype);
        const created = !service;

        if (!service) {
          service = this.accessory.addService(
            this.platform.Service.Switch, this._names[swingSwitch.nameKey], swingSwitch.subtype);
        }
        this.applyDefaultServiceName(service, swingSwitch.nameKey, created);

        this.services[swingSwitch.key] = service;
        this.services[swingSwitch.key].getCharacteristic(this.platform.Characteristic.On)
          .onGet(swingSwitch.onGet)
          .onSet(swingSwitch.onSet);
      } else {
        // Drop the service when the option is switched off or the axis is
        // not supported (stale cached accessory).
        const stale = this.accessory.getServiceById(this.platform.Service.Switch, swingSwitch.subtype);
        if (stale) {
          this.accessory.removeService(stale);
        }
      }
    }

    /*
    //
    // Motion sensor switch
    //
    const buttonName = 'Motion Sensor';
    this.services[buttonName] = this.accessory.getServiceById(this.platform.Service.Switch, buttonName) || this.accessory.addService(this.platform.Service.Switch,  'buttonBuzzerName', buttonName);

     this.services[buttonName].setCharacteristic(this.platform.Characteristic.Name, buttonName);
     this.services[buttonName].getCharacteristic(this.platform.Characteristic.On)
     .onGet(this.getMotionDetection.bind(this))
     .onSet(this.setMotionDetection.bind(this));

     this.services[buttonName].addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
     this.services[buttonName].setCharacteristic(this.platform.Characteristic.ConfiguredName, buttonName);
    */

    ////
    // Legacy (BRP069) units often have no humidity / outdoor-temperature
    // sensor; only expose the services the device can actually feed.
    this._supportsHumidity = accessory.context.device?.supportsIndoorHumidity() ?? true;
    this._supportsOutdoorTemperature = accessory.context.device?.supportsOutdoorTemperature() ?? true;

    if (this._supportsHumidity) {
      this.services['HumiditySensor'] = this.accessory.getService(this.platform.Service.HumiditySensor)
      || this.accessory.addService(this.platform.Service.HumiditySensor);

      this.services['HumiditySensor'].getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .onGet(this.getCurrentRelativeHumidity.bind(this));
    } else {
      // Drop the service left on an accessory cached before capability detection.
      const staleHumidity = this.accessory.getService(this.platform.Service.HumiditySensor);
      if (staleHumidity) {
        this.accessory.removeService(staleHumidity);
      }
    }

    if (this._supportsOutdoorTemperature) {
      // Separate service so it doesn't collide with HeaterCooler's
      // CurrentTemperature, which reports the indoor value.
      const restoredOutdoor = this.accessory.getServiceById(this.platform.Service.TemperatureSensor, 'outdoor');
      this.services['OutdoorTemperatureSensor'] = restoredOutdoor
        || this.accessory.addService(
          this.platform.Service.TemperatureSensor, this._names.outdoorTemperature, 'outdoor');
      this.applyDefaultServiceName(this.services['OutdoorTemperatureSensor'], 'outdoorTemperature', !restoredOutdoor);

      this.services['OutdoorTemperatureSensor']
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .setProps({
          minValue: -100,
          maxValue: 100,
          minStep: 0.5,
        })
        .onGet(this.getOutdoorTemperature.bind(this));
    } else {
      const staleOutdoor = this.accessory.getServiceById(this.platform.Service.TemperatureSensor, 'outdoor');
      if (staleOutdoor) {
        this.accessory.removeService(staleOutdoor);
      }
    }

    //////////
    // Update characteristic values asynchronously instead of using onGet handlers
    this.refreshDeviceStatus();
  }

  // Apply the localized default name to a plugin-created service. On
  // creation the name and its ConfiguredName (where Home-app renames land)
  // are always set. A restored service is only renamed while its name is
  // still one of this plugin's defaults (in any language) AND differs from
  // the wanted one — a rename done in the Home app must survive restarts
  // and language changes. The equality bail-out doubles as upgrade safety:
  // outdoor sensors restored from pre-1.5.1 accessories carry no
  // ConfiguredName, and adding one without actually changing the visible
  // name could clobber a rename the user did in the Home app (those live
  // only in HomeKit's own database, invisible to the plugin).
  private applyDefaultServiceName(service: Service, key: ServiceNameKey, created: boolean) {
    const name = this._names[key];
    const hasConfiguredName = service.testCharacteristic(this.platform.Characteristic.ConfiguredName);

    if (!created) {
      const current = hasConfiguredName
        ? service.getCharacteristic(this.platform.Characteristic.ConfiguredName).value
        : service.getCharacteristic(this.platform.Characteristic.Name).value;

      if (typeof current === 'string' && current.trim() !== '' && !isDefaultServiceName(key, current)) {
        return;
      }
      if (current === name) {
        return;
      }
    }

    service.setCharacteristic(this.platform.Characteristic.Name, name);
    if (!hasConfiguredName) {
      service.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    }
    service.setCharacteristic(this.platform.Characteristic.ConfiguredName, name);
  }


  async refreshDeviceStatus() {
    
    this.platform.log.debug(`Accessory: Refresh status for device '${this.accessory.displayName}'`);

    await this.accessory.context.device.fetchDeviceStatus();

   ///
   // Schedule continuous device updates on the first run
    if (!this._refreshInterval) {
      this._refreshInterval = setInterval(
        this.refreshDeviceStatus.bind(this),
        DEVICE_STATUS_REFRESH_INTERVAL,
      );
    }
  }


  // TargetHeaterCoolerState shown while the unit runs an auxiliary mode
  // (fan/dry/humidify) that HeaterCooler cannot represent; must be one of
  // the states this accessory actually exposes in validValues.
  private auxModeTargetState(): CharacteristicValue {
    if (this._supportsAuto) {
      return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
    }
    if (this._supportsCool) {
      return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
    }
    return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
  }

  // Turn a device command result into a HomeKit-visible outcome: a failed command
  // must reject the onSet so the Home app doesn't show a stale "success" state.
  private assertCommand(ok: boolean) {
    if (!ok) {
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setClimateActive(value: CharacteristicValue) {
    this.platform.log.debug(`Accessory: setClimateActive() for device '${this.accessory.displayName}'`);
    this.assertCommand(
      await this.accessory.context.device.setPowerStatus(value === this.platform.Characteristic.Active.ACTIVE));
  }

  async getClimateActive():Promise<CharacteristicValue> { 
    this.platform.log.debug(`Accessory: getClimateActive() for device '${this.accessory.displayName}'`);

    const active = this.accessory.context.device.getPowerStatus() ?
      this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
    return active;
  }

  async getFanStatus():Promise<CharacteristicValue> {
    this.platform.log.debug(`Accessory: getFanStatus() for device '${this.accessory.displayName}'`);

    const value = this.accessory.context.device.getFanSpeedNumber() !== 0;
    return value;
  }

  async setFanStatus(value: CharacteristicValue) {
    this.platform.log.debug(`Accessory: setFanStatus() for device '${this.accessory.displayName}'`);

    let speed = this._lastFanSpeed; // restore to previous non-zero speed
    if (value === false) {
      // turn off fan means turn on auto-speed mode
      speed = 0;
    }
    await this.setRotationSpeed(speed);
  }

  async getRotationSpeed():Promise<CharacteristicValue> {
      
    this.platform.log.debug(`Accessory: getRotationSpeed() for device '${this.accessory.displayName}'`);

    let value = this.accessory.context.device.getFanSpeedNumber();
    if (value === 0) {
      value = this._lastFanSpeed;
    }
    return value;
  }

  async setRotationSpeed(value: CharacteristicValue) {

    this.platform.log.debug(`Accessory: setRotationSpeed() for device '${this.accessory.displayName}'`);

    const entry = FAN_SPEED_TABLE.find(e => e.number === value);

    if (!entry) {
      this.platform.log.error(`Unknown RotationSpeed: ${value}` );
      return;
    }

    // Speed 0 = auto; remember the last explicit speed so turning the fan back on restores it.
    if (value === 0) {
      const lastFanSpeed = this.accessory.context.device.getFanSpeedNumber();
      if (lastFanSpeed !== 0) {
        this._lastFanSpeed = lastFanSpeed;
      }
    }

    this.assertCommand(await this.accessory.context.device.setFanSpeed(entry.code));
  }

  // Swing on any supported axis shows as "swinging"; enabling turns every
  // supported axis on (3D on units with both), disabling turns all off.
  private isSwinging(): boolean {
    const device = this.accessory.context.device;
    return (this._supportsSwingVertical && device.getSwingVertical())
      || (this._supportsSwingHorizontal && device.getSwingHorizontal());
  }

  async getSwingMode(): Promise<CharacteristicValue> {
    this.platform.log.debug(`Accessory: getSwingMode() for device '${this.accessory.displayName}'`);

    return this.isSwinging()
      ? this.platform.Characteristic.SwingMode.SWING_ENABLED
      : this.platform.Characteristic.SwingMode.SWING_DISABLED;
  }

  async setSwingMode(value: CharacteristicValue) {
    this.platform.log.debug(`Accessory: setSwingMode() for device '${this.accessory.displayName}'`);

    const enable = value === this.platform.Characteristic.SwingMode.SWING_ENABLED;
    this.assertCommand(await this.accessory.context.device.setSwing(
      enable && this._supportsSwingVertical,
      enable && this._supportsSwingHorizontal));
  }

  async getVerticalSwingSwitch(): Promise<CharacteristicValue> {
    this.platform.log.debug(`Accessory: getVerticalSwingSwitch() for device '${this.accessory.displayName}'`);

    return this.accessory.context.device.getSwingVertical();
  }

  async setVerticalSwingSwitch(value: CharacteristicValue) {
    this.platform.log.debug(`Accessory: setVerticalSwingSwitch() for device '${this.accessory.displayName}'`);

    this.assertCommand(await this.accessory.context.device.setSwing(
      value === true,
      this.accessory.context.device.getSwingHorizontal()));
  }

  async getHorizontalSwingSwitch(): Promise<CharacteristicValue> {
    this.platform.log.debug(`Accessory: getHorizontalSwingSwitch() for device '${this.accessory.displayName}'`);

    return this.accessory.context.device.getSwingHorizontal();
  }

  async setHorizontalSwingSwitch(value: CharacteristicValue) {
    this.platform.log.debug(`Accessory: setHorizontalSwingSwitch() for device '${this.accessory.displayName}'`);

    this.assertCommand(await this.accessory.context.device.setSwing(
      this.accessory.context.device.getSwingVertical(),
      value === true));
  }

  async getCurrentRelativeHumidity():Promise<CharacteristicValue> {

    try{
      this.platform.log.debug(`Accessory: getCurrentRelativeHumidity() for device '${this.accessory.displayName}'`);
    }catch(e){
        this.platform.log.error(e);
    }

    return this.accessory.context.device.getIndoorHumidity();


  }

  async getOutdoorTemperature():Promise<CharacteristicValue> {
    this.platform.log.debug(`Accessory: getOutdoorTemperature() for device '${this.accessory.displayName}'`);

    const value = this.accessory.context.device.getOutdoorTemperature();
    if (Number.isFinite(value)) {
      return value;
    }
    // Outdoor unit hasn't reported yet (e.g. AC just powered on); keep
    // whatever HomeKit already has cached rather than spike to 0.
    const cached = this.services['OutdoorTemperatureSensor']
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature).value;
    return typeof cached === 'number' ? cached : 0;
  }


  // TargetHeaterCoolerState for the unit's mode — a mode this accessory does
  // not offer (fan, dry, or e.g. Auto set from the remote on a unit marked
  // cooling-only) falls back to auxModeTargetState.
  private targetStateFor(mode: string): CharacteristicValue {
    const State = this.platform.Characteristic.TargetHeaterCoolerState;
    if (mode === CLIMATE_MODE_AUTO && this._supportsAuto) {
      return State.AUTO;
    }
    if (mode === CLIMATE_MODE_HEATING && this._supportsHeat) {
      return State.HEAT;
    }
    if (mode === CLIMATE_MODE_COOLING && this._supportsCool) {
      return State.COOL;
    }
    return this.auxModeTargetState();
  }

  // Also keeps TargetHeaterCoolerState in step with the unit's mode — while
  // it is off too, so the Home app shows the mode the unit will start in.
  async getCurrentHeaterCoolerState():Promise<CharacteristicValue> {

    const device = this.accessory.context.device;
    const State = this.platform.Characteristic.CurrentHeaterCoolerState;
    const currentMode = device.getOperationMode() || CLIMATE_MODE_AUTO;

    this.services['Climate'].updateCharacteristic(
      this.platform.Characteristic.TargetHeaterCoolerState, this.targetStateFor(currentMode));

    if (!device.getPowerStatus()) {
      this.services['Climate'].getCharacteristic(State).updateValue(State.INACTIVE);
      return State.INACTIVE;
    }

    const currentTemperature = device.getIndoorTemperature() || 0;
    const targetTemperature = device.getTargetTemperature() || 0;

    let state = State.IDLE;
    if ((currentMode === CLIMATE_MODE_AUTO || currentMode === CLIMATE_MODE_HEATING) && currentTemperature < targetTemperature) {
      state = State.HEATING;
    } else if ((currentMode === CLIMATE_MODE_AUTO || currentMode === CLIMATE_MODE_COOLING) && currentTemperature > targetTemperature) {
      state = State.COOLING;
    } else if (![CLIMATE_MODE_AUTO, CLIMATE_MODE_HEATING, CLIMATE_MODE_COOLING, CLIMATE_MODE_DEHUMIDIFY,
      CLIMATE_MODE_HUMIDIFY, CLIMATE_MODE_FAN].includes(currentMode)) {
      this.platform.log.error(`Unknown TargetHeaterCoolerState state: '${this.accessory.displayName}' '${currentMode}'`);
    }

    this.services['Climate'].getCharacteristic(State).updateValue(state);
    return state;
  }

  // Threshold shown for a mode's setpoint. Daikin's Auto has one target of
  // its own, shown as a range of ± AUTO_SETPOINT_OFFSET around it (same as
  // the Matter accessory); outside Auto each threshold is that mode's target.
  private thresholdTemperature(setpointMode: string): number {
    const device = this.accessory.context.device;
    const characteristic = setpointMode === CLIMATE_MODE_COOLING
      ? this.platform.Characteristic.CoolingThresholdTemperature
      : this.platform.Characteristic.HeatingThresholdTemperature;
    const props = this.services['Climate'].getCharacteristic(characteristic).props;
    let value = device.getTargetTemperatureWithMode(setpointMode);
    if (device.getOperationMode() === CLIMATE_MODE_AUTO) {
      value = device.getTargetTemperatureWithMode(CLIMATE_MODE_AUTO)
        + (setpointMode === CLIMATE_MODE_COOLING ? AUTO_SETPOINT_OFFSET : -AUTO_SETPOINT_OFFSET);
    }
    return Math.min(Math.max(value, props.minValue ?? value), props.maxValue ?? value);
  }

  // In Auto, moving either end of the range moves the Auto target and the
  // unit stays in Auto. Otherwise the unit switches to the threshold's mode
  // (the Home app shows both thresholds while the unit runs fan/dry).
  private async setThresholdTemperature(value: CharacteristicValue, setpointMode: string) {
    const device = this.accessory.context.device;
    const threshold: number = +value;

    if (device.getOperationMode() === CLIMATE_MODE_AUTO) {
      this.assertCommand(await device.setTargetTemperature(
        threshold + (setpointMode === CLIMATE_MODE_HEATING ? AUTO_SETPOINT_OFFSET : -AUTO_SETPOINT_OFFSET)));
      return;
    }
    this.assertCommand(await device.setOperationMode(setpointMode));
    this.assertCommand(await device.setTargetTemperature(threshold));
  }

  async getCoolingThresholdTemperature():Promise<CharacteristicValue> {
    this.platform.log.debug(`Accessory: getCoolingThresholdTemperature() for device '${this.accessory.displayName}'`);
    return this.thresholdTemperature(CLIMATE_MODE_COOLING);
  }

  async getHeatingThresholdTemperature():Promise<CharacteristicValue> {
    this.platform.log.debug(`Accessory: getHeatingThresholdTemperature() for device '${this.accessory.displayName}'`);
    return this.thresholdTemperature(CLIMATE_MODE_HEATING);
  }

  async setCoolingThresholdTemperature(value: CharacteristicValue) {
    this.platform.log.debug(`Accessory: setCoolingThresholdTemperature() for device '${this.accessory.displayName}'`);
    await this.setThresholdTemperature(value, CLIMATE_MODE_COOLING);
  }

  async setHeatingThresholdTemperature(value: CharacteristicValue) {
    this.platform.log.debug(`Accessory: setHeatingThresholdTemperature() for device '${this.accessory.displayName}'`);
    await this.setThresholdTemperature(value, CLIMATE_MODE_HEATING);
  }

  async setTargetHeaterCoolerState(value: CharacteristicValue) {

    this.platform.log.debug(`Accessory: setTargetHeaterCoolerState() for device '${this.accessory.displayName}'`);

    let mode = CLIMATE_MODE_AUTO

    switch (value) {
      case this.platform.Characteristic.TargetHeaterCoolerState.AUTO:
        mode = CLIMATE_MODE_AUTO;
        break;

      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        mode = CLIMATE_MODE_COOLING;
        break;

      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        mode = CLIMATE_MODE_HEATING;
        break;

      default:
        this.platform.log.error(`Unknown TargetHeaterCoolerState ${value}`);
        return;
    }


    this.assertCommand(await this.accessory.context.device.setOperationMode(mode));
  }

  async updateDeviceStatus(device: DaikinDevice) {

    try{

      this.platform.log.debug(`Accessory: updateDeviceStatus() for device '${this.accessory.displayName}'`);

      const active = this.accessory.context.device.getPowerStatus() ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
    
      this.services['Climate'].updateCharacteristic(this.platform.Characteristic.Active, active);
      this.services['Climate'].updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.accessory.context.device.getIndoorTemperature());
  
      this.getCurrentHeaterCoolerState();

  
      // updateCharacteristic would re-add a removed optional characteristic,
      // so only push values for modes this accessory exposes.
      if (this._supportsHeat) {
        this.services['Climate'].updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, this.thresholdTemperature(CLIMATE_MODE_HEATING));
      }
      if (this._supportsCool) {
        this.services['Climate'].updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, this.thresholdTemperature(CLIMATE_MODE_COOLING));
      }
  
      if (this._supportsHumidity) {
        this.services['HumiditySensor'].updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.accessory.context.device.getIndoorHumidity());
      }

      const outdoorTemp = this.accessory.context.device.getOutdoorTemperature();
      if (this._supportsOutdoorTemperature && Number.isFinite(outdoorTemp)) {
        this.services['OutdoorTemperatureSensor']
          .updateCharacteristic(this.platform.Characteristic.CurrentTemperature, outdoorTemp);
      }

      // updateCharacteristic would re-add the removed SwingMode, so only push
      // when at least one axis is exposed; the per-axis switches exist only
      // when configured (see constructor).
      if (this._supportsSwingVertical || this._supportsSwingHorizontal) {
        this.services['Climate'].updateCharacteristic(this.platform.Characteristic.SwingMode,
          this.isSwinging()
            ? this.platform.Characteristic.SwingMode.SWING_ENABLED
            : this.platform.Characteristic.SwingMode.SWING_DISABLED);
      }
      if (this.services['VerticalSwing']) {
        this.services['VerticalSwing'].updateCharacteristic(this.platform.Characteristic.On,
          this.accessory.context.device.getSwingVertical());
      }
      if (this.services['HorizontalSwing']) {
        this.services['HorizontalSwing'].updateCharacteristic(this.platform.Characteristic.On,
          this.accessory.context.device.getSwingHorizontal());
      }

      //this.services['MotionSensor'].updateCharacteristic(this.platform.Characteristic.On, this.accessory.context.device.getMotionDetection());

    }catch(e){
        this.platform.log.error(e);
    }




  }



}
