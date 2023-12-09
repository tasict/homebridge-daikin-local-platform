import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback, CharacteristicEventTypes } from 'homebridge';
import DaikinPlatform from '../platform';
import { DEVICE_STATUS_REFRESH_INTERVAL } from '../const';
import { DaikinAccessoryContext} from '../types';
import {
  CLIMATE_MODE_AUTO,
  CLIMATE_MODE_COOLING,
  CLIMATE_MODE_DEHUMIDIFY,
  CLIMATE_MODE_FAN,
  CLIMATE_MODE_HEATING,
  CLIMATE_FAN_SPEED_AUTO,
  CLIMATE_FAN_SPEED_SLIENT,
  CLIMATE_FAN_SPEED_1,
  CLIMATE_FAN_SPEED_2,
  CLIMATE_FAN_SPEED_3,
  CLIMATE_FAN_SPEED_4,
  CLIMATE_FAN_SPEED_5
} from '../daikin-local';
import {DaikinLocalAPI, DaikinDevice} from '../daikin-local';


/**
 * An instance of this class is created for each accessory the platform registers.
 * Each accessory may expose multiple services of different service types.
 */
export default class ClimateAccessory {
  private services: Service[] = [];
  private _refreshInterval: NodeJS.Timer | undefined;

  constructor(
    private readonly platform: DaikinPlatform,
    private readonly accessory: PlatformAccessory<DaikinAccessoryContext>,
  ) {


    accessory.context.device.setCallback(this.updateDeviceStatus.bind(this));

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
      accessory.context.device?.getDeviceName() || '空調',
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

    this.services['Climate']
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onSet(this.setTargetHeaterCoolerState.bind(this));

    // Cooling Threshold Temperature (optional)
    this.services['Climate']
    .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
    .setProps({
      minValue: accessory.context.device?.getCoolingThresholdTemperatureRange()[0] || '10',
      maxValue: accessory.context.device?.getCoolingThresholdTemperatureRange()[1] || '30',
      minStep: 0.5,
    })
    .onSet(this.setCoolingThresholdTemperature.bind(this))
    .onGet(this.getCoolingThresholdTemperature.bind(this));

  // Heating Threshold Temperature (optional)
  this.services['Climate']
    .getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
    .setProps({
      minValue: accessory.context.device?.getHeatingThresholdTemperatureRange()[0] || '10',
      maxValue: accessory.context.device?.getHeatingThresholdTemperatureRange()[1] || '30',
      minStep: 0.5,
    })
    .onSet(this.setHeatingThresholdTemperature.bind(this))
    .onGet(this.getHeatingThresholdTemperature.bind(this));

    this.services['Climate']
    .getCharacteristic(this.platform.Characteristic.RotationSpeed)
    .setProps({
      minValue: 0,
      maxValue: 6,
      minStep: 1,
    })
    .onGet(this.getRotationSpeed.bind(this))
    .onSet(this.setRotationSpeed.bind(this));

    //
    // Motion sensor switch
    //
    this.services['MotionSensor'] = this.accessory.getService(this.platform.Service.Switch)
    || this.accessory.addService(this.platform.Service.Switch);

    this.services['MotionSensor'].getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getMotionDetection.bind(this))
      .onSet(this.setMotionDetection.bind(this));

    this.services['MotionSensor'].addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.services['MotionSensor'].setCharacteristic(this.platform.Characteristic.ConfiguredName, "Motion Sensor");

    ////
    this.services['HumiditySensor'] = this.accessory.getService(this.platform.Service.HumiditySensor)
    || this.accessory.addService(this.platform.Service.HumiditySensor);

    this.services['HumiditySensor'].getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getCurrentRelativeHumidity.bind(this));
 

    //////////
    // Update characteristic values asynchronously instead of using onGet handlers
    this.refreshDeviceStatus();
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


  async setClimateActive(value: CharacteristicValue) {
    this.platform.log.debug(`Accessory: setClimateActive() for device '${this.accessory.displayName}'`);
    this.accessory.context.device.setPowerStatus(value === this.platform.Characteristic.Active.ACTIVE ? true : false);
    this.services['Climate'].updateCharacteristic(this.platform.Characteristic.Active, value);  
  }

  async getClimateActive():Promise<CharacteristicValue> { 
    
    this.platform.log.debug(`Accessory: getClimateActive() for device '${this.accessory.displayName}'`);

    const active = this.accessory.context.device.getPowerStatus() ? this.platform.Characteristic.Active.ACTIVE
    : this.platform.Characteristic.Active.INACTIVE;
    return active;
  }

  async getRotationSpeed():Promise<CharacteristicValue> {
      
      this.platform.log.debug(`Accessory: getRotationSpeed() for device '${this.accessory.displayName}'`);
   
      return this.accessory.context.device.getFanSpeedNumber();
  }

  async setRotationSpeed(value: CharacteristicValue) {

    this.platform.log.debug(`Accessory: setRotationSpeed() for device '${this.accessory.displayName}'`);

    let speed = CLIMATE_FAN_SPEED_AUTO;

    switch (value) {
      case 0:
        speed = CLIMATE_FAN_SPEED_SLIENT;
        break;

      case 1:
        speed = CLIMATE_FAN_SPEED_1;
        break;

      case 2:
        speed = CLIMATE_FAN_SPEED_2;
        break;

      case 3:
        speed = CLIMATE_FAN_SPEED_3;
        break;

      case 4:
        speed = CLIMATE_FAN_SPEED_4;
        break;

      case 5:
        speed = CLIMATE_FAN_SPEED_5;
        break;

      default:
        this.platform.log.error('Unknown RotationSpeed', value );
        return;
    }

    this.accessory.context.device.setFanSpeed(speed);
  }
  
  async getCurrentRelativeHumidity():Promise<CharacteristicValue> {
      
    try{
      this.platform.log.debug(`Accessory: getCurrentRelativeHumidity() for device '${this.accessory.displayName}'`);
    }catch(e){
        this.platform.log.error(e);
    }

    return this.accessory.context.device.getIndoorHumidity();


  }


  async getCurrentHeaterCoolerState():Promise<CharacteristicValue> {

    if(this.accessory.context.device.getPowerStatus()){

      const currentTemperature = await this.accessory.context.device.getIndoorTemperature() || 0;
      const targetTemperature = await this.accessory.context.device.getTargetTemperature() || 0;
      const currentMode = await this.accessory.context.device.getOperationMode() || CLIMATE_MODE_AUTO;

      switch (currentMode) 
      {
            // Auto
            case CLIMATE_MODE_AUTO:
              // Set target state and current state (based on current temperature)
              this.services['Climate'].updateCharacteristic(
                this.platform.Characteristic.TargetHeaterCoolerState,
                this.platform.Characteristic.TargetHeaterCoolerState.AUTO,
              );

              if (currentTemperature < targetTemperature) {
                this.services['Climate'].getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
                  .updateValue(this.platform.Characteristic.CurrentHeaterCoolerState.HEATING);
              } else if (currentTemperature > targetTemperature) {
                this.services['Climate'].getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
                  .updateValue(this.platform.Characteristic.CurrentHeaterCoolerState.COOLING);
              } else {
                this.services['Climate'].getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
                  .updateValue(this.platform.Characteristic.CurrentHeaterCoolerState.IDLE);
              }
              break;

            // Heat
            case CLIMATE_MODE_HEATING:
              this.services['Climate'].updateCharacteristic(
                this.platform.Characteristic.TargetHeaterCoolerState,
                this.platform.Characteristic.TargetHeaterCoolerState.HEAT,
              );

              if (currentTemperature < targetTemperature) {
                this.services['Climate'].getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
                  .updateValue(this.platform.Characteristic.CurrentHeaterCoolerState.HEATING);
              } else {
                this.services['Climate'].getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
                  .updateValue(this.platform.Characteristic.CurrentHeaterCoolerState.IDLE);
              }
              break;

            // Cool
            case CLIMATE_MODE_COOLING:
              this.services['Climate'].updateCharacteristic(
                this.platform.Characteristic.TargetHeaterCoolerState,
                this.platform.Characteristic.TargetHeaterCoolerState.COOL,
              );

              if (currentTemperature > targetTemperature) {
                this.services['Climate'].getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
                  .updateValue(this.platform.Characteristic.CurrentHeaterCoolerState.COOLING);
              } else {
                this.services['Climate'].getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
                  .updateValue(this.platform.Characteristic.CurrentHeaterCoolerState.IDLE);
              }
              break;

            // Dry (Dehumidifier)
            case CLIMATE_MODE_DEHUMIDIFY:
              this.services['Climate'].getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
                .updateValue(this.platform.Characteristic.CurrentHeaterCoolerState.IDLE);
                this.services['Climate'].updateCharacteristic(
                this.platform.Characteristic.TargetHeaterCoolerState,

                this.platform.Characteristic.TargetHeaterCoolerState.AUTO,
              );
              break;

            // Fan
            case CLIMATE_MODE_FAN:
              this.services['Climate'].getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
                .updateValue(this.platform.Characteristic.CurrentHeaterCoolerState.IDLE);
                this.services['Climate'].updateCharacteristic(
                this.platform.Characteristic.TargetHeaterCoolerState,

                this.platform.Characteristic.TargetHeaterCoolerState.AUTO,
              );
              break;

            default:
              this.platform.log.error(
                `Unknown TargetHeaterCoolerState state: '${this.accessory.displayName}' '${currentMode}'`);
              break;
          }
          return this.services['Climate'].getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState).value ;

    }

    return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
  
  }

  async getCoolingThresholdTemperature():Promise<CharacteristicValue> {
      
      this.platform.log.debug(`Accessory: getCoolingThresholdTemperature() for device '${this.accessory.displayName}'`);
  
      return this.accessory.context.device.getTargetTemperatureWithMode(CLIMATE_MODE_COOLING);
  }

  async getHeatingThresholdTemperature():Promise<CharacteristicValue> {
      
      this.platform.log.debug(`Accessory: getHeatingThresholdTemperature() for device '${this.accessory.displayName}'`);
  
      return this.accessory.context.device.getTargetTemperatureWithMode(CLIMATE_MODE_HEATING);
  }

  async setCoolingThresholdTemperature(value: CharacteristicValue) {

    this.platform.log.debug(`Accessory: setCoolingThresholdTemperature() for device '${this.accessory.displayName}'`);

    const threshold:number = +value;

    this.accessory.context.device.setOperationMode(CLIMATE_MODE_COOLING);
    this.accessory.context.device.setTargetTemperature(threshold);

    this.services['Climate'].getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .updateValue(value);
  }

  async setHeatingThresholdTemperature(value: CharacteristicValue) {

    this.platform.log.debug(`Accessory: setHeatingThresholdTemperature() for device '${this.accessory.displayName}'`);

    const threshold:number = +value;

    this.accessory.context.device.setOperationMode(CLIMATE_MODE_HEATING);
    this.accessory.context.device.setTargetTemperature(threshold);

    this.services['Climate'].getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .updateValue(value);
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
        this.platform.log.error('Unknown TargetHeaterCoolerState', value );
        return;
    }


    this.accessory.context.device.setOperationMode(mode);

    this.services['Climate'].getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .updateValue(value);
  }

  async getMotionDetection():Promise<CharacteristicValue> {
        
      this.platform.log.debug(`Accessory: getMotionDetection() for device '${this.accessory.displayName}'`);
  
      return this.accessory.context.device.getMotionDetection();
  }

  async setMotionDetection(value: CharacteristicValue) {

    this.platform.log.debug(`Accessory: setMotionDetection() for device '${this.accessory.displayName}'`);

    this.accessory.context.device.setMotionDetection(value ? true : false);
    this.services['MotionSensor'].updateCharacteristic(this.platform.Characteristic.On, value);  
  }

  async updateDeviceStatus(device: DaikinDevice) {

    try{

      this.platform.log.debug(`Accessory: updateDeviceStatus() for device '${this.accessory.displayName}'`);

      const active = this.accessory.context.device.getPowerStatus() ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
    
      this.services['Climate'].updateCharacteristic(this.platform.Characteristic.Active, active);
      this.services['Climate'].updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.accessory.context.device.getIndoorTemperature());
  
      this.getCurrentHeaterCoolerState();

  
      this.services['Climate'].updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, this.accessory.context.device.getTargetTemperatureWithMode(CLIMATE_MODE_HEATING));
      this.services['Climate'].updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, this.accessory.context.device.getTargetTemperatureWithMode(CLIMATE_MODE_COOLING));
  
      this.services['HumiditySensor'].updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.accessory.context.device.getIndoorHumidity());
      
      this.services['MotionSensor'].updateCharacteristic(this.platform.Characteristic.On, this.accessory.context.device.getMotionDetection());

    }catch(e){
        this.platform.log.error(e);
    }




  }



}
